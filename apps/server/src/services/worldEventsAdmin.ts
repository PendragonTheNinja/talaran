import db from '../db';
import { logger } from '../lib/logger';
import { SERVER_ERROR } from '../lib/serviceResult';
import { eligibleLocations, eventsChanged, startEvent } from './worldEvents';
import { merchantPlaces, summonMerchant, MerchantRefusal } from './travellingMerchant';

// The admin panel's Events tab (docs/WORLD-EVENTS-AND-MUSEUMS.md, "Admin: an
// Events section"). Every number the scheduler and the roster use is a row, so
// all of it is adjustable here without a deploy. Admin-only; the route checks.
//
// Every function answers { ok: true, ... } or { error }: a refusal in words an
// admin can act on, or SERVER_ERROR for a fault (lib/serviceResult.ts).

type Result<T = object> = ({ ok: true } & T) | { error: string };

/** A refusal: thrown inside, answered as { error: message }. */
class Refusal extends Error {}

async function answer<T>(label: string, fn: () => Promise<T>): Promise<Result<T>> {
    try {
        return { ok: true, ...(await fn()) };
    } catch (err: any) {
        if (err instanceof Refusal || err instanceof MerchantRefusal) return { error: err.message };
        // The CHECK constraints on the event tables are the backstop for the
        // ranges validated below; if one fires, say so rather than 500.
        if (err?.code === '23514') return { error: 'Those numbers do not fit together (check the ranges).' };
        logger.error(`[events admin] ${label}: ${err}`);
        return { error: SERVER_ERROR };
    }
}

// ── Validation ────────────────────────────────────────────────────────────

function whole(value: unknown, label: string, min: number, max: number): number {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < min || n > max) throw new Refusal(`${label} must be a whole number from ${min} to ${max}.`);
    return n;
}

function optionalWhole(value: unknown, label: string, min: number, max: number): number | undefined {
    return value === undefined || value === null || value === '' ? undefined : whole(value, label, min, max);
}

/** An XP multiplier: 1.25 is +25%. Capped well inside the column's 99.99. */
function multiplier(value: unknown): number {
    const n = Math.round(Number(value) * 100) / 100;
    if (!Number.isFinite(n) || n < 1 || n > 5) throw new Refusal('The bonus must be a multiplier from 1.00 to 5.00 (1.25 is +25%).');
    return n;
}

function text(value: unknown, label: string, max: number): string {
    const s = String(value ?? '').trim();
    if (!s) throw new Refusal(`${label} cannot be empty.`);
    if (s.length > max) throw new Refusal(`${label} is longer than ${max} characters.`);
    return s;
}

async function realSkill(value: unknown): Promise<string> {
    const name = text(value, 'Skill', 60);
    const row = await db('skills').whereRaw('LOWER(name) = ?', [name.toLowerCase()]).first();
    if (!row) throw new Refusal(`There is no skill called "${name}".`);
    return row.name;
}

async function realLocation(value: unknown): Promise<{ id: number; name: string }> {
    const id = whole(value, 'Location', 1, 2 ** 31 - 1);
    const row = await db('locations').where({ id }).first();
    if (!row) throw new Refusal('That location does not exist.');
    return row;
}

async function realLocations(value: unknown): Promise<number[]> {
    if (!Array.isArray(value)) return [];
    const ids = [...new Set(value.map((v) => whole(v, 'Location', 1, 2 ** 31 - 1)))];
    if (!ids.length) return [];
    const found = await db('locations').whereIn('id', ids).select('id');
    if (found.length !== ids.length) throw new Refusal('One of the pinned locations does not exist.');
    return ids;
}

const RARITIES = ['common', 'uncommon', 'rare'];

// ── Reading ───────────────────────────────────────────────────────────────

/** Everything the tab shows, in one call. */
export async function eventsAdminOverview() {
    return answer('overview', async () => {
        const columns = [
            'e.*', 'l.name as location', 'p.username as started_by_name',
        ];
        const live = await db('world_events as e')
            .leftJoin('locations as l', 'l.id', 'e.location_id')
            .leftJoin('players as p', 'p.id', 'e.started_by')
            .whereNull('e.ended_at').where('e.ends_at', '>', db.fn.now())
            .orderBy('e.ends_at', 'asc').select(columns);
        const history = await db('world_events as e')
            .leftJoin('locations as l', 'l.id', 'e.location_id')
            .leftJoin('players as p', 'p.id', 'e.started_by')
            .whereNotNull('e.ended_at')
            .orderBy('e.ended_at', 'desc').limit(50).select(columns);
        const shape = (r: any) => ({
            id: r.id, typeId: r.type_id, name: r.name, kind: r.kind, skill: r.skill,
            location: r.location, locationId: r.location_id,
            multiplier: Number(r.xp_multiplier),
            poolTotal: r.pool_total, poolLeft: r.pool_left,
            // A refill or cut keeps total minus left equal to what was paid.
            paidOut: r.pool_total - r.pool_left,
            startsAt: r.starts_at, endsAt: r.ends_at, endedAt: r.ended_at, endReason: r.end_reason,
            startedBy: r.started_by_name ?? null, announcement: r.announcement,
        });

        const typeRows = await db('world_event_types').orderBy([{ column: 'display_order' }, { column: 'id' }]);
        const types = [];
        for (const t of typeRows) {
            types.push({
                id: t.id, key: t.key, name: t.name, kind: t.kind, skill: t.skill, rarity: t.rarity,
                weight: t.weight, minMinutes: t.min_minutes, maxMinutes: t.max_minutes,
                minPool: t.min_pool, maxPool: t.max_pool, multiplier: Number(t.xp_multiplier),
                locationIds: t.location_ids ?? [], cooldownMinutes: t.cooldown_minutes,
                startText: t.start_text, isActive: t.is_active,
                // Where the scheduler could put it today.
                eligiblePlaces: (await eligibleLocations(t)).length,
            });
        }

        // The merchant's cart, on his live visit (there is at most one).
        const stockRows = await db('world_event_stock as s').join('items as i', 'i.id', 's.item_id')
            .whereIn('s.event_id', live.filter((e: any) => e.kind === 'merchant').map((e: any) => e.id))
            .orderBy('i.name')
            .select('s.event_id', 'i.name', 's.price', 's.quantity_left', 's.quantity_total');
        const stockFor = (eventId: number) => stockRows.filter((r: any) => r.event_id === eventId)
            .map((r: any) => ({ name: r.name, price: r.price, left: r.quantity_left, total: r.quantity_total }));

        const extras = await db('merchant_extra_goods as x').join('items as i', 'i.id', 'x.item_id')
            .orderBy('i.name')
            .select('x.id', 'x.item_id', 'i.name', 'x.chance_percent', 'x.min_qty', 'x.max_qty', 'x.is_active');
        const items = await db('items').where({ is_active: true }).where('value', '>', 0).orderBy('name').select('id', 'name');

        const s = await db('world_event_settings').where({ id: 1 }).first();
        const skills = (await db('skills').where({ is_active: true, is_implemented: true }).orderBy('name').select('name'))
            .map((r: { name: string }) => r.name);
        const locations = await db('locations').where({ is_accessible: true }).orderBy('name').select('id', 'name', 'region');

        return {
            live: live.map((r: any) => ({ ...shape(r), stock: r.kind === 'merchant' ? stockFor(r.id) : undefined })),
            history: history.map(shape),
            types,
            settings: {
                schedulerEnabled: !!s?.scheduler_enabled,
                averageGapMinutes: s?.average_gap_minutes ?? 180,
                maxConcurrent: s?.max_concurrent ?? 3,
            },
            merchant: {
                enabled: !!s?.merchant_enabled,
                nextAt: s?.merchant_next_at ?? null,
                everyDays: s?.merchant_every_days ?? 7,
                stayMinutes: s?.merchant_stay_minutes ?? 1440,
                lines: s?.merchant_lines ?? 8,
                lineGold: s?.merchant_line_gold ?? 300,
                arrivalText: s?.merchant_arrival_text ?? '',
                // Where he could go today: open places with something to sell.
                places: (await merchantPlaces()).length,
            },
            extras: extras.map((x: any) => ({
                id: x.id, itemId: x.item_id, name: x.name, chancePercent: x.chance_percent,
                minQty: x.min_qty, maxQty: x.max_qty, isActive: x.is_active,
            })),
            items,
            skills,
            locations,
        };
    });
}

// ── Live events ───────────────────────────────────────────────────────────

export interface LiveChange {
    /** Minutes from now until it ends. */
    endsInMinutes?: number | string
    /** What is left in the pool. Raising it is a refill. */
    poolLeft?: number | string
    multiplier?: number | string
    announcement?: string
}

/** Extend or shorten, refill or cut, change the bonus, reword. */
export async function updateLiveEvent(adminId: number, eventId: number, change: LiveChange) {
    return answer('update live', async () => {
        const minutes = optionalWhole(change.endsInMinutes, 'Minutes left', 1, 7 * 24 * 60);
        const left = optionalWhole(change.poolLeft, 'Actions left', 1, 1_000_000);
        const patch: Record<string, unknown> = {};
        if (minutes !== undefined) patch.ends_at = new Date(Date.now() + minutes * 60_000);
        if (left !== undefined) {
            // One statement, against the row as it stands: awards are taking
            // from pool_left while this runs, and total minus left must stay
            // what was actually paid.
            patch.pool_total = db.raw('pool_total - pool_left + ?', [left]);
            patch.pool_left = left;
        }
        if (change.multiplier !== undefined && change.multiplier !== '') patch.xp_multiplier = multiplier(change.multiplier);
        if (change.announcement !== undefined) patch.announcement = text(change.announcement, 'Announcement', 500);
        if (!Object.keys(patch).length) throw new Refusal('Nothing to change.');

        // A merchant's pool is his goods, and he has no bonus: only his stay
        // and wording are his to change.
        const current = await db('world_events').where({ id: eventId }).first();
        if (current?.kind === 'merchant' && (left !== undefined || patch.xp_multiplier !== undefined)) {
            throw new Refusal('The merchant has no pool or bonus to change: only how long he stays and his announcement.');
        }

        const [row] = await db('world_events').where({ id: eventId }).whereNull('ended_at').update(patch).returning('*');
        if (!row) throw new Refusal('That event has already ended.');
        await eventsChanged();
        logger.info(`[events admin] player ${adminId} changed event ${eventId} (${row.name}): ${Object.keys(patch).join(', ')}`);
        return {};
    });
}

/** End it now. Players see it "was called off". */
export async function endLiveEvent(adminId: number, eventId: number) {
    return answer('end', async () => {
        const [row] = await db('world_events').where({ id: eventId }).whereNull('ended_at')
            .update({ ended_at: db.fn.now(), end_reason: 'admin' }).returning(['id', 'name']);
        if (!row) throw new Refusal('That event has already ended.');
        await eventsChanged();
        logger.info(`[events admin] player ${adminId} ended event ${eventId} (${row.name})`);
        return {};
    });
}

// ── Starting ──────────────────────────────────────────────────────────────

export interface StartRequest {
    /** A roster type; leave out for a one-off. */
    typeId?: number | string
    /** One-off only. */
    name?: string
    skill?: string
    /** Leave out for a random place where the skill's work is. */
    locationId?: number | string
    minutes?: number | string
    pool?: number | string
    multiplier?: number | string
    /** The chat line; {location} is filled in. Required for a one-off. */
    announcement?: string
}

/**
 * Start an event now, on top of whatever is running: the scheduler's limits
 * do not apply. One thing is still refused: a second live event for the same
 * skill at the same place, because only one of them could ever pay.
 */
export async function startEventNow(adminId: number, req: StartRequest) {
    return answer('start', async () => {
        let type: any;
        if (req.typeId !== undefined && req.typeId !== '' && req.typeId !== null) {
            type = await db('world_event_types').where({ id: whole(req.typeId, 'Type', 1, 2 ** 31 - 1) }).first();
            if (!type) throw new Refusal('That event type does not exist.');
        } else {
            type = {
                id: null, kind: 'skill', location_ids: [],
                name: text(req.name, 'Name', 100),
                skill: await realSkill(req.skill),
                start_text: text(req.announcement, 'Announcement', 500),
            };
        }

        let locationId: number;
        if (req.locationId !== undefined && req.locationId !== '' && req.locationId !== null) {
            locationId = (await realLocation(req.locationId)).id;
        } else {
            const places = await eligibleLocations(type);
            if (!places.length) throw new Refusal(`Nowhere has ${type.skill} work to put this event; pick a place.`);
            locationId = places[Math.floor(Math.random() * places.length)];
        }

        const clash = await db('world_events').whereNull('ended_at').where('ends_at', '>', db.fn.now())
            .where({ location_id: locationId }).whereRaw('LOWER(skill) = ?', [String(type.skill ?? '').toLowerCase()]).first();
        if (clash) throw new Refusal(`${clash.name} is already boosting ${type.skill} there. Change or end it instead.`);

        const oneOff = type.id === null;
        const event = await startEvent(type, {
            locationId,
            minutes: optionalWhole(req.minutes, 'Minutes', 1, 7 * 24 * 60) ?? (oneOff ? 60 : undefined),
            pool: optionalWhole(req.pool, 'Pool', 1, 1_000_000) ?? (oneOff ? 300 : undefined),
            multiplier: req.multiplier !== undefined && req.multiplier !== '' ? multiplier(req.multiplier) : (oneOff ? 1.25 : undefined),
            announcement: req.announcement ? text(req.announcement, 'Announcement', 500) : undefined,
            startedBy: adminId,
        });
        return { eventId: event.id };
    });
}

// ── The roster ────────────────────────────────────────────────────────────

export interface TypeFields {
    name?: string
    skill?: string
    rarity?: string
    weight?: number | string
    minMinutes?: number | string
    maxMinutes?: number | string
    minPool?: number | string
    maxPool?: number | string
    multiplier?: number | string
    cooldownMinutes?: number | string
    startText?: string
    locationIds?: unknown
    isActive?: boolean
}

async function typeRow(f: TypeFields, partial: boolean): Promise<Record<string, unknown>> {
    const row: Record<string, unknown> = {};
    const has = (k: keyof TypeFields) => !partial || f[k] !== undefined;
    if (has('name')) row.name = text(f.name, 'Name', 100);
    if (has('skill')) row.skill = await realSkill(f.skill);
    if (has('rarity')) {
        const r = String(f.rarity ?? '').toLowerCase();
        if (!RARITIES.includes(r)) throw new Refusal('Rarity must be common, uncommon or rare.');
        row.rarity = r;
    }
    if (has('weight')) row.weight = whole(f.weight, 'Weight', 0, 1000);
    if (has('minMinutes')) row.min_minutes = whole(f.minMinutes, 'Shortest length', 1, 7 * 24 * 60);
    if (has('maxMinutes')) row.max_minutes = whole(f.maxMinutes, 'Longest length', 1, 7 * 24 * 60);
    if (has('minPool')) row.min_pool = whole(f.minPool, 'Smallest pool', 1, 1_000_000);
    if (has('maxPool')) row.max_pool = whole(f.maxPool, 'Largest pool', 1, 1_000_000);
    if (has('multiplier')) row.xp_multiplier = multiplier(f.multiplier);
    if (has('cooldownMinutes')) row.cooldown_minutes = whole(f.cooldownMinutes, 'Cooldown', 0, 30 * 24 * 60);
    if (has('startText')) row.start_text = text(f.startText, 'Announcement', 500);
    if (has('locationIds')) row.location_ids = await realLocations(f.locationIds);
    if (f.isActive !== undefined) row.is_active = !!f.isActive;
    return row;
}

function checkRanges(r: { min_minutes: number; max_minutes: number; min_pool: number; max_pool: number }) {
    if (r.max_minutes < r.min_minutes) throw new Refusal('The longest length is shorter than the shortest.');
    if (r.max_pool < r.min_pool) throw new Refusal('The largest pool is smaller than the smallest.');
}

export async function updateEventType(adminId: number, typeId: number, fields: TypeFields) {
    return answer('update type', async () => {
        const current = await db('world_event_types').where({ id: typeId }).first();
        if (!current) throw new Refusal('That event type does not exist.');
        const patch = await typeRow(fields, true);
        if (!Object.keys(patch).length) throw new Refusal('Nothing to change.');
        checkRanges({ ...current, ...patch } as any);
        await db('world_event_types').where({ id: typeId }).update({ ...patch, updated_at: db.fn.now() });
        logger.info(`[events admin] player ${adminId} changed type ${typeId} (${current.name}): ${Object.keys(patch).join(', ')}`);
        return {};
    });
}

export async function createEventType(adminId: number, fields: TypeFields) {
    return answer('create type', async () => {
        const row = await typeRow(fields, false);
        checkRanges(row as any);
        // The key is the name, made safe and unique; it never changes after.
        const base = String(row.name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50) || 'event';
        let key = base;
        for (let i = 2; await db('world_event_types').where({ key }).first(); i++) key = `${base}_${i}`;
        const [{ max }] = await db('world_event_types').max('display_order as max');
        const [created] = await db('world_event_types').insert({
            ...row, key, kind: 'skill', display_order: Number(max ?? 0) + 1,
        }).returning(['id']);
        logger.info(`[events admin] player ${adminId} added type ${created.id} (${row.name})`);
        return { typeId: created.id };
    });
}

// ── The scheduler ─────────────────────────────────────────────────────────

export interface SettingsFields {
    schedulerEnabled?: boolean
    averageGapMinutes?: number | string
    maxConcurrent?: number | string
}

export async function updateEventSettings(adminId: number, f: SettingsFields) {
    return answer('settings', async () => {
        const patch: Record<string, unknown> = {};
        if (f.schedulerEnabled !== undefined) patch.scheduler_enabled = !!f.schedulerEnabled;
        const gap = optionalWhole(f.averageGapMinutes, 'Average gap', 1, 7 * 24 * 60);
        if (gap !== undefined) patch.average_gap_minutes = gap;
        const most = optionalWhole(f.maxConcurrent, 'Most at once', 0, 20);
        if (most !== undefined) patch.max_concurrent = most;
        if (!Object.keys(patch).length) throw new Refusal('Nothing to change.');
        await db('world_event_settings').where({ id: 1 }).update({ ...patch, updated_at: db.fn.now() });
        logger.info(`[events admin] player ${adminId} changed the scheduler: ${JSON.stringify(patch)}`);
        return {};
    });
}

// ── The travelling merchant ───────────────────────────────────────────────

/** Bring him now, anywhere, for as long as asked. Refused while he is already out. */
export async function summonMerchantNow(adminId: number, req: { locationId?: unknown; stayMinutes?: unknown }) {
    return answer('summon merchant', async () => {
        const location = req.locationId !== undefined && req.locationId !== '' && req.locationId !== null
            ? await realLocation(req.locationId) : undefined;
        const stay = optionalWhole(req.stayMinutes, 'Stay', 1, 7 * 24 * 60);
        const visit = await summonMerchant({ locationId: location?.id, stayMinutes: stay, startedBy: adminId });
        return visit;
    });
}

export interface MerchantFields {
    enabled?: boolean
    /** Hours from now until he is next due. */
    nextInHours?: number | string
    everyDays?: number | string
    stayMinutes?: number | string
    lines?: number | string
    lineGold?: number | string
    arrivalText?: string
}

export async function updateMerchantSettings(adminId: number, f: MerchantFields) {
    return answer('merchant settings', async () => {
        const patch: Record<string, unknown> = {};
        if (f.enabled !== undefined) patch.merchant_enabled = !!f.enabled;
        const next = optionalWhole(f.nextInHours, 'Next visit (hours)', 0, 60 * 24);
        if (next !== undefined) patch.merchant_next_at = new Date(Date.now() + next * 3_600_000);
        const every = optionalWhole(f.everyDays, 'Days between visits', 1, 60);
        if (every !== undefined) patch.merchant_every_days = every;
        const stay = optionalWhole(f.stayMinutes, 'Stay (minutes)', 10, 7 * 24 * 60);
        if (stay !== undefined) patch.merchant_stay_minutes = stay;
        const lines = optionalWhole(f.lines, 'Lines he carries', 1, 40);
        if (lines !== undefined) patch.merchant_lines = lines;
        const gold = optionalWhole(f.lineGold, 'Gold of value per line', 1, 100_000);
        if (gold !== undefined) patch.merchant_line_gold = gold;
        if (f.arrivalText !== undefined) patch.merchant_arrival_text = text(f.arrivalText, 'Arrival line', 500);
        if (!Object.keys(patch).length) throw new Refusal('Nothing to change.');
        await db('world_event_settings').where({ id: 1 }).update({ ...patch, updated_at: db.fn.now() });
        await eventsChanged();
        logger.info(`[events admin] player ${adminId} changed the merchant: ${Object.keys(patch).join(', ')}`);
        return {};
    });
}

export interface ExtraFields {
    itemId?: number | string
    chancePercent?: number | string
    minQty?: number | string
    maxQty?: number | string
    isActive?: boolean
}

/** Add an item to the extras list, or change its line. One line per item. */
export async function saveMerchantExtra(adminId: number, f: ExtraFields) {
    return answer('merchant extra', async () => {
        const itemId = whole(f.itemId, 'Item', 1, 2 ** 31 - 1);
        const item = await db('items').where({ id: itemId }).first();
        if (!item) throw new Refusal('That item does not exist.');
        if (!(Number(item.value) > 0)) throw new Refusal(`${item.name} has no value, so he could not price it.`);
        const row = {
            item_id: itemId,
            chance_percent: whole(f.chancePercent, 'Chance', 1, 100),
            min_qty: whole(f.minQty, 'Fewest', 1, 999),
            max_qty: whole(f.maxQty, 'Most', 1, 999),
            is_active: f.isActive !== false,
        };
        if (row.max_qty < row.min_qty) throw new Refusal('Most is fewer than fewest.');
        await db('merchant_extra_goods').insert(row).onConflict('item_id').merge({ ...row, updated_at: db.fn.now() });
        logger.info(`[events admin] player ${adminId} set merchant extra ${item.name}: ${JSON.stringify(row)}`);
        return {};
    });
}

export async function removeMerchantExtra(adminId: number, extraId: number) {
    return answer('remove merchant extra', async () => {
        const n = await db('merchant_extra_goods').where({ id: extraId }).delete();
        if (!n) throw new Refusal('That line is already gone.');
        logger.info(`[events admin] player ${adminId} removed merchant extra ${extraId}`);
        return {};
    });
}
