import db from '../db';
import { logger } from '../lib/logger';
import { SERVER_ERROR } from '../lib/serviceResult';
import { pushToPlayer } from '../lib/realtime';
import { listWords } from '../lib/listWords';
import { homesteadPlace, shopTown } from './islands';
import { missingBuildTool } from './construction';
import { carpentryLevel } from './builds';
import { creditGoldWithin, debitGoldWithin, lockPlayersInOrder } from './gold';
import { addItemToInventoryWithin, takeItemsWithin } from './inventory';
import { awardXp } from './xp';
import { incrementStats } from './stats';
import { buffedSeconds } from './buffs';
import { buildXpFor, homesteadTier, raiseFarmsteadWithin, upgradeFarmsteadWithin, UpgradeAbort } from './farming';
import { SHOP_TIERS, raiseShopWithin, upgradeShopWithin, ShopUpgradeAbort } from './shops';

// ── Hiring a carpenter for a homestead or a shop (docs/antura-plan.md §6b) ──
//
// Homesteads and shops are single build actions (Nathan, 2026-11-17), so a
// hire is one action too, run by the carpenter. The owner, standing at the
// place (the island's homestead ground or port), names the carpenter, says
// what is to be built (a tier raised outright, or the next tier on what
// stands), and lays the fee. They may also lay materials there. The carpenter
// starts the same farm_establish / farm_upgrade / shop_establish /
// shop_upgrade action they would run for themselves, with `<tier>|hire:<id>`
// as its data; the tick sends that to resolveHireBuild.
//
// The finish is ONE transaction: both players locked in id order (CLAUDE.md
// §4 rule 6), then the hire row, which is the gate (it is deleted at the
// finish, so a second finish finds nothing); the materials taken, laid stock
// first and then the carpenter's pack; the property raised for the owner by
// the same helper the owner's own build uses; the fee paid; leftovers
// returned. The carpenter is paid the build's XP, as the owner would have
// been. Calling the work off is refused while the carpenter is at it, so a
// hand is never left with nothing for work already under way.
//
// Presence is enforced here: every call needs the player at the place.

type Kind = 'farmstead' | 'shop';
type Work = 'establish' | 'upgrade';

/** The most a hire may pay, a guard against a slipped digit. */
export const MAX_HIRE_FEE = 1_000_000;

class HireAbort extends Error {
    constructor(message: string, public status = 400) { super(message); }
}

type Ok<T> = { ok: true } & T;
type Refused = { ok: false; error: string; status: number };

function refuse(err: unknown, context: string): Refused {
    if (err instanceof HireAbort) return { ok: false, error: err.message, status: err.status };
    if (err instanceof UpgradeAbort || err instanceof ShopUpgradeAbort) return { ok: false, error: err.message, status: 400 };
    if ((err as { code?: string })?.code === '23505') return { ok: false, error: 'That is already in hand.', status: 409 };
    logger.error(`hires ${context}: ${err}`);
    return { ok: false, error: SERVER_ERROR, status: 500 };
}

interface Cost { itemName: string; qty: number }
interface Job { kind: Kind; work: Work; tier: number; cost: Cost[]; seconds: number; carpentry: number }

function asKind(raw: unknown): Kind | null {
    return raw === 'farmstead' || raw === 'shop' ? raw : null;
}

/** What a hire of this kind, work, and tier asks of the carpenter, or null if there is no such work. */
function jobFor(kind: Kind, work: Work, tier: number): Job | null {
    const t = kind === 'farmstead' ? homesteadTier(tier) : SHOP_TIERS[tier] ?? null;
    if (!t) return null;
    const part = work === 'establish' ? t.build : t.upgrade;
    if (!part) return null;
    return { kind, work, tier, cost: part.cost, seconds: part.seconds, carpentry: t.carpentry };
}

/** The action a hire runs as: the owner's own build's, so restore and scene text are unchanged. */
function actionTypeFor(kind: Kind, work: Work): string {
    return `${kind === 'farmstead' ? 'farm' : 'shop'}_${work}`;
}

/** The hire behind an action's data (`<tier>|hire:<id>`), or null for a player's own build. */
export function hireIdOf(data: unknown): number | null {
    if (typeof data !== 'string') return null;
    const m = /\|hire:(\d+)$/.exec(data);
    return m ? Number(m[1]) : null;
}

/** Where this kind of property stands on the island the player is on. */
async function placeFor(x: any, playerId: number, kind: Kind) {
    return kind === 'farmstead' ? homesteadPlace(x, playerId) : shopTown(x, playerId);
}

/**
 * The owner's property of this kind at the place, or null. A shop counts only
 * with its shopfront: a bare property is a half-built shop the build repairs.
 */
async function standing(x: any, ownerId: number, kind: Kind, locationId: number) {
    const property = await x('player_properties').where({ player_id: ownerId, type: kind, location_id: locationId }).first();
    if (!property) return null;
    if (kind === 'shop' && !(await x('player_shops').where({ property_id: property.id }).first('id'))) return null;
    return property;
}

/** What the owner may hire a carpenter to build here, now. */
function jobsOpenTo(kind: Kind, property: { tier?: number | null } | null): Job[] {
    if (!property) {
        const tiers = kind === 'farmstead' ? [1, 2] : Object.keys(SHOP_TIERS).map(Number);
        return tiers.map((n) => jobFor(kind, 'establish', n)).filter((j): j is Job => !!j);
    }
    const next = jobFor(kind, 'upgrade', (Number(property.tier) || 1) + 1);
    return next ? [next] : [];
}

/** Is the work still to be done: nothing standing for a build, the tier below for an upgrade? */
function stillWanted(job: Job, property: { tier?: number | null } | null): boolean {
    return job.work === 'establish' ? !property : !!property && (Number(property.tier) || 1) === job.tier - 1;
}

/** Plain words for a hire: "a tier 2 farmstead", "the shop built on to tier 2". */
function describe(job: Job, place: string): string {
    const what = job.kind === 'farmstead' ? 'farmstead' : 'shop';
    if (job.work === 'upgrade') return `the ${what} in ${place} built on to tier ${job.tier}`;
    return `${job.tier === 1 ? `a ${what}` : `a tier ${job.tier} ${what}`} in ${place}`;
}

const gold = (n: number) => `${n.toLocaleString('en-US')} gold`;

function wholeAtLeast(raw: unknown, min: number): number | null {
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) && n >= min ? n : null;
}

async function letter(to: number, subject: string, body: string): Promise<void> {
    try {
        const { sendSystemMessage } = await import('../routes/messages');
        await sendSystemMessage(to, subject, body);
    } catch (err) {
        // A letter is never worth failing the work over.
        logger.error(`hires letter error: ${err}`);
    }
}

async function nameOf(x: any, playerId: number | null): Promise<string> {
    if (!playerId) return 'Someone';
    return (await x('players').where({ id: playerId }).first('username'))?.username ?? 'Someone';
}

async function stockRows(x: any, hireId: number): Promise<{ item_id: number; name: string; quantity: number }[]> {
    return (await x('property_hire_stock as s').join('items as i', 'i.id', 's.item_id')
        .where('s.hire_id', hireId).where('s.quantity', '>', 0)
        .select('s.item_id', 'i.name', 's.quantity'))
        .map((r: any) => ({ item_id: Number(r.item_id), name: r.name, quantity: Number(r.quantity) }));
}

async function packQty(playerId: number, itemName: string): Promise<number> {
    const row = await db('player_inventory as pi').join('items as i', 'i.id', 'pi.item_id')
        .where({ 'pi.player_id': playerId, 'i.name': itemName }).sum({ q: 'pi.quantity' }).first();
    return Number(row?.q ?? 0);
}

/** The carpenter's action at work on this hire, if any. */
async function workUnderWay(x: any, hire: { id: number; carpenter_id: number | null }) {
    if (!hire.carpenter_id) return null;
    return x('player_actions').where({ player_id: hire.carpenter_id })
        .where('action_data', 'like', `%|hire:${hire.id}`).first('completes_at');
}

// ── Reading ─────────────────────────────────────────────────────────────────

/**
 * Everything the homestead or shop panel shows about hiring here: what the
 * player may hire for, the hire they have open, and the work others have
 * hired them for.
 */
export async function hiresHere(playerId: number, kindRaw: unknown) {
    const kind = asKind(kindRaw);
    if (!kind) return null;
    const place = await placeFor(db, playerId, kind);
    if (!place) return null;
    const me = await db('players').where({ id: playerId }).first('current_location_id');
    const atPlace = Number(me?.current_location_id) === Number(place.id);
    const property = await standing(db, playerId, kind, place.id);

    const mineRow = await db('property_hires').where({ owner_id: playerId, kind, location_id: place.id }).first();
    let mine = null;
    if (mineRow) {
        const job = jobFor(kind, mineRow.work, Number(mineRow.tier));
        const laid = await stockRows(db, mineRow.id);
        mine = {
            id: Number(mineRow.id),
            work: mineRow.work, tier: Number(mineRow.tier),
            carpenter: await nameOf(db, mineRow.carpenter_id),
            fee: Number(mineRow.fee_gold),
            working: !!(await workUnderWay(db, mineRow)),
            materials: (job?.cost ?? []).map((c) => ({
                itemName: c.itemName, need: c.qty,
                laid: laid.find((l) => l.name === c.itemName)?.quantity ?? 0,
            })),
        };
    }

    const level = await carpentryLevel(playerId);
    const tool = (await missingBuildTool(playerId))?.message ?? null;
    const forMe = [];
    for (const h of await db('property_hires').where({ carpenter_id: playerId, kind, location_id: place.id }).orderBy('id')) {
        const job = jobFor(kind, h.work, Number(h.tier));
        if (!job) continue;
        const laid = await stockRows(db, h.id);
        const materials = [];
        for (const c of job.cost) {
            const l = laid.find((x) => x.name === c.itemName)?.quantity ?? 0;
            materials.push({ itemName: c.itemName, need: c.qty, laid: l, have: await packQty(playerId, c.itemName) });
        }
        const ownerProperty = await standing(db, Number(h.owner_id), kind, place.id);
        forMe.push({
            id: Number(h.id), owner: await nameOf(db, h.owner_id),
            work: h.work, tier: Number(h.tier), fee: Number(h.fee_gold), seconds: job.seconds,
            carpentryRequired: job.carpentry, carpentryOk: level >= job.carpentry,
            materials, canAfford: materials.every((m) => m.laid + m.have >= m.need),
            stillWanted: stillWanted(job, ownerProperty),
            missingTool: tool,
        });
    }

    return {
        kind, place: place.name, atPlace,
        options: mineRow ? [] : jobsOpenTo(kind, property).map((j) => ({ work: j.work, tier: j.tier, seconds: j.seconds, carpentryRequired: j.carpentry, cost: j.cost })),
        mine,
        forMe,
        maxFee: MAX_HIRE_FEE,
    };
}

// ── The owner's side ────────────────────────────────────────────────────────

/** Name a carpenter for work here and lay the fee. */
export async function offerHire(ownerId: number, body: any): Promise<Ok<{ id: number }> | Refused> {
    try {
        const kind = asKind(body?.kind);
        const work: Work | null = body?.work === 'establish' || body?.work === 'upgrade' ? body.work : null;
        const tier = wholeAtLeast(body?.tier, 1);
        const fee = wholeAtLeast(body?.fee, 0);
        const username = typeof body?.carpenter === 'string' ? body.carpenter.trim() : '';
        if (!kind || !work || !tier) throw new HireAbort('There is no work of that kind to hire for.');
        const job = jobFor(kind, work, tier);
        if (!job) throw new HireAbort('There is no work of that kind to hire for.');
        if (fee === null) throw new HireAbort('The fee is a whole number of gold, or nothing.');
        if (fee > MAX_HIRE_FEE) throw new HireAbort(`A hire can pay at most ${gold(MAX_HIRE_FEE)}.`);
        if (!username) throw new HireAbort('Name the carpenter you want to build it.');
        const hand = await db('players').whereRaw('lower(username) = lower(?)', [username]).first('id', 'username');
        if (!hand) throw new HireAbort(`There is nobody called ${username}.`);
        if (Number(hand.id) === ownerId) throw new HireAbort('You need no one\'s leave to build for yourself.');

        const made = await db.transaction(async (trx) => {
            await trx('players').where({ id: ownerId }).forUpdate().first('id');
            const place = await placeFor(trx, ownerId, kind);
            if (!place) throw new HireAbort(kind === 'farmstead' ? 'There is no homestead ground on this island.' : 'There is no port on this island to raise a shop in.');
            const here = await trx('players').where({ id: ownerId }).first('current_location_id');
            if (Number(here?.current_location_id) !== Number(place.id)) throw new HireAbort(`You must be in ${place.name} to hire a carpenter for it.`);
            if (await trx('property_hires').where({ owner_id: ownerId, kind, location_id: place.id }).first('id')) {
                throw new HireAbort('You have hired a carpenter here already. Call that work off first.');
            }
            const property = await standing(trx, ownerId, kind, place.id);
            if (!stillWanted(job, property)) {
                throw new HireAbort(work === 'establish'
                    ? `You already have a ${kind} in ${place.name}.`
                    : `Your ${kind} in ${place.name} is not ready to be built on to tier ${tier}.`);
            }
            const [row] = await trx('property_hires').insert({
                owner_id: ownerId, carpenter_id: hand.id, kind, work, tier, location_id: place.id, fee_gold: fee,
            }).returning('id');
            const id = Number(typeof row === 'object' ? row.id : row);
            if (fee > 0) {
                const paid = await debitGoldWithin(trx, { playerId: ownerId, amount: fee, reason: 'hire_fee_lay', refType: 'property_hire', refId: id });
                if (!paid.ok) throw new HireAbort(`You have only ${gold(paid.balance)}.`);
            }
            return { id, place: place.name };
        });

        const owner = await nameOf(db, ownerId);
        await letter(Number(hand.id), `Work in ${made.place}`,
            `${owner} has hired you to build ${describe(job, made.place)}${fee > 0 ? `, for ${gold(fee)}, paid when it stands` : ', for no fee'}. `
            + `It wants ${listWords(job.cost.map((c) => `${c.qty.toLocaleString('en-US')} ${c.itemName}`))}, and Carpentry ${job.carpentry}. `
            + `Go to ${made.place} and open the ${kind === 'farmstead' ? 'homestead' : 'shops'} to start.`);
        pushToPlayer(Number(hand.id), 'hires_changed', { kind });
        return { ok: true, id: made.id };
    } catch (err) {
        return refuse(err, 'offerHire');
    }
}

/** Call the work off: the fee and any materials laid come back to the owner. */
export async function cancelHire(ownerId: number, kindRaw: unknown): Promise<Ok<{}> | Refused> {
    try {
        const kind = asKind(kindRaw);
        if (!kind) throw new HireAbort('There is no such work.');
        const done = await db.transaction(async (trx) => {
            await trx('players').where({ id: ownerId }).forUpdate().first('id');
            const place = await placeFor(trx, ownerId, kind);
            if (!place) throw new HireAbort('There is no such work.');
            const here = await trx('players').where({ id: ownerId }).first('current_location_id');
            if (Number(here?.current_location_id) !== Number(place.id)) throw new HireAbort(`You must be in ${place.name} to call the work off.`);
            const hire = await trx('property_hires').where({ owner_id: ownerId, kind, location_id: place.id }).forUpdate().first();
            if (!hire) throw new HireAbort('You have hired nobody here.');
            const working = await workUnderWay(trx, hire);
            if (working) {
                const mins = Math.max(1, Math.ceil((new Date(working.completes_at).getTime() - Date.now()) / 60000));
                throw new HireAbort(`${await nameOf(trx, hire.carpenter_id)} is at work on it now. Wait the ${mins} minute${mins === 1 ? '' : 's'} it has left.`);
            }
            const fee = Number(hire.fee_gold);
            if (fee > 0) await creditGoldWithin(trx, { playerId: ownerId, amount: fee, reason: 'hire_fee_return', refType: 'property_hire', refId: hire.id });
            for (const s of await stockRows(trx, hire.id)) await addItemToInventoryWithin(trx, ownerId, s.item_id, s.quantity);
            await trx('property_hires').where({ id: hire.id }).delete();
            return { carpenter: hire.carpenter_id ? Number(hire.carpenter_id) : null, place: place.name };
        });
        if (done.carpenter) {
            await letter(done.carpenter, `Work in ${done.place} called off`,
                `${await nameOf(db, ownerId)} has called off the work they hired you for in ${done.place}.`);
            pushToPlayer(done.carpenter, 'hires_changed', { kind });
        }
        return { ok: true };
    } catch (err) {
        return refuse(err, 'cancelHire');
    }
}

/** The owner's open hire here, locked, with the owner at the place. */
async function ownHireAtPlace(trx: any, ownerId: number, kind: Kind) {
    await trx('players').where({ id: ownerId }).forNoKeyUpdate().first('id');
    const place = await placeFor(trx, ownerId, kind);
    if (!place) throw new HireAbort('You have hired nobody here.');
    const here = await trx('players').where({ id: ownerId }).first('current_location_id');
    if (Number(here?.current_location_id) !== Number(place.id)) throw new HireAbort(`You must be in ${place.name}.`);
    const hire = await trx('property_hires').where({ owner_id: ownerId, kind, location_id: place.id }).forUpdate().first();
    if (!hire) throw new HireAbort('You have hired nobody here.');
    const job = jobFor(kind, hire.work, Number(hire.tier));
    if (!job) throw new HireAbort('There is no such work.');
    return { hire, job, place };
}

/** Lay materials from the owner's pack for the carpenter to use. Never more than the work wants. */
export async function layHireStock(ownerId: number, kindRaw: unknown, itemRaw: unknown, qtyRaw: unknown): Promise<Ok<{ laid: number }> | Refused> {
    try {
        const kind = asKind(kindRaw);
        const qty = wholeAtLeast(qtyRaw, 1);
        const itemName = typeof itemRaw === 'string' ? itemRaw : '';
        if (!kind) throw new HireAbort('You have hired nobody here.');
        if (!qty) throw new HireAbort('Lay a whole number of them.');
        return await db.transaction(async (trx) => {
            const { hire, job } = await ownHireAtPlace(trx, ownerId, kind);
            const want = job.cost.find((c) => c.itemName === itemName);
            if (!want) throw new HireAbort(`No ${itemName} goes into this work.`);
            const item = await trx('items').where({ name: itemName }).first('id');
            if (!item) throw new HireAbort(`No one in Talaran can make ${itemName} yet.`);
            // Read under the hire's lock, so two layings at once cannot both fit.
            const laid = Number((await trx('property_hire_stock').where({ hire_id: hire.id, item_id: item.id }).first('quantity'))?.quantity ?? 0);
            const room = Math.max(0, want.qty - laid);
            if (qty > room) {
                throw new HireAbort(room > 0
                    ? `The work wants only ${room.toLocaleString('en-US')} more ${itemName} than is laid here already.`
                    : `Enough ${itemName} is laid here already.`);
            }
            const taken = await takeItemsWithin(trx, ownerId, [{ name: itemName, quantity: qty }]);
            if (!taken.ok) throw new HireAbort(`You do not have ${qty.toLocaleString('en-US')} ${itemName}.`);
            const [row] = await trx('property_hire_stock').insert({ hire_id: hire.id, item_id: item.id, quantity: qty })
                .onConflict(['hire_id', 'item_id']).merge({ quantity: trx.raw('property_hire_stock.quantity + ?', [qty]) })
                .returning('quantity');
            return { ok: true as const, laid: Number(row.quantity) };
        });
    } catch (err) {
        return refuse(err, 'layHireStock');
    }
}

/** Take laid materials back, while they are not yet built in. */
export async function takeHireStock(ownerId: number, kindRaw: unknown, itemRaw: unknown, qtyRaw: unknown): Promise<Ok<{ laid: number }> | Refused> {
    try {
        const kind = asKind(kindRaw);
        const qty = wholeAtLeast(qtyRaw, 1);
        const itemName = typeof itemRaw === 'string' ? itemRaw : '';
        if (!kind) throw new HireAbort('You have hired nobody here.');
        if (!qty) throw new HireAbort('Take a whole number of them.');
        return await db.transaction(async (trx) => {
            const { hire } = await ownHireAtPlace(trx, ownerId, kind);
            if (await workUnderWay(trx, hire)) throw new HireAbort('The carpenter is at work with them now.');
            const item = await trx('items').where({ name: itemName }).first('id');
            if (!item) throw new HireAbort(`There is no ${itemName} laid here.`);
            const [row] = await trx('property_hire_stock').where({ hire_id: hire.id, item_id: item.id }).where('quantity', '>=', qty)
                .decrement('quantity', qty).returning('quantity');
            if (!row) throw new HireAbort(`There are not ${qty.toLocaleString('en-US')} ${itemName} laid here.`);
            await addItemToInventoryWithin(trx, ownerId, item.id, qty);
            return { ok: true as const, laid: Number(row.quantity) };
        });
    } catch (err) {
        return refuse(err, 'takeHireStock');
    }
}

// ── The carpenter's side ────────────────────────────────────────────────────

/**
 * Checked at the start and again at the finish: the carpenter is the one
 * hired, stands at the place, has the Carpentry, a mallet, and a saw.
 */
async function carpenterCheck(carpenterId: number, hire: any, x: any = db): Promise<Job> {
    const job = jobFor(hire.kind, hire.work, Number(hire.tier));
    if (!job) throw new HireAbort('There is no such work.');
    const here = await x('players').where({ id: carpenterId }).first('current_location_id');
    if (Number(here?.current_location_id) !== Number(hire.location_id)) {
        const at = await x('locations').where({ id: hire.location_id }).first('name');
        throw new HireAbort(`That work is in ${at?.name ?? 'another place'}.`);
    }
    if ((await carpentryLevel(carpenterId, x)) < job.carpentry) throw new HireAbort(`Requires Carpentry level ${job.carpentry}.`);
    const tool = await missingBuildTool(carpenterId, x);
    if (tool) throw new HireAbort(tool.message);
    return job;
}

/** Start the work someone hired this carpenter for. */
export async function startHireBuild(carpenterId: number, hireIdRaw: unknown): Promise<Ok<{ timerSeconds: number; actionType: string }> | Refused> {
    try {
        const hireId = wholeAtLeast(hireIdRaw, 1);
        const hire = hireId ? await db('property_hires').where({ id: hireId, carpenter_id: carpenterId }).first() : null;
        if (!hire) throw new HireAbort('Nobody has hired you for that work.');
        const job = await carpenterCheck(carpenterId, hire);
        if (await db('player_actions').where({ player_id: carpenterId }).first('id')) throw new HireAbort('You are already performing an action.', 409);
        if (!stillWanted(job, await standing(db, Number(hire.owner_id), job.kind, Number(hire.location_id)))) {
            throw new HireAbort('That work has been done already.');
        }
        const laid = await stockRows(db, hire.id);
        const short = [];
        for (const c of job.cost) {
            const l = laid.find((x) => x.name === c.itemName)?.quantity ?? 0;
            const have = await packQty(carpenterId, c.itemName);
            if (l + have < c.qty) short.push(`${(c.qty - l).toLocaleString('en-US')} ${c.itemName} (you have ${have.toLocaleString('en-US')})`);
        }
        if (short.length) throw new HireAbort(`You need: ${listWords(short)}.`);

        const actionType = actionTypeFor(job.kind, job.work);
        const seconds = await buffedSeconds(carpenterId, 'Carpentry', job.seconds);
        const now = new Date();
        await db('player_actions').insert({
            player_id: carpenterId,
            action_type: actionType,
            action_data: `${job.tier}|hire:${hire.id}`,
            location_id: hire.location_id,
            started_at: now,
            completes_at: new Date(now.getTime() + seconds * 1000),
            last_timer_seconds: seconds,
            auto_restart: false,
            last_bot_check: now,
            bot_check_pending: false,
        });
        return { ok: true, timerSeconds: seconds, actionType };
    } catch (err) {
        return refuse(err, 'startHireBuild');
    }
}

export interface HireBuildResult {
    success: boolean; error?: string; xp?: number; skillName?: string; message?: string
    // The farm tick's result shape; a build yields no item and finds no gold.
    itemName?: string; quantity?: number; goldBasisXp?: number
}

/** The tick's finish for a hired build (see the header). */
export async function resolveHireBuild(carpenterId: number, hireId: number): Promise<HireBuildResult> {
    try {
        const first = await db('property_hires').where({ id: hireId, carpenter_id: carpenterId }).first();
        if (!first) return { success: false, error: 'The work was called off before you finished.' };
        const job = await carpenterCheck(carpenterId, first);
        const ownerId = Number(first.owner_id);

        const done = await db.transaction(async (trx) => {
            await lockPlayersInOrder(trx, [ownerId, carpenterId]);
            const hire = await trx('property_hires').where({ id: hireId, carpenter_id: carpenterId }).forUpdate().first();
            if (!hire) throw new HireAbort('The work was called off before you finished.');
            const place = await trx('locations').where({ id: hire.location_id }).first('id', 'name');
            const property = await standing(trx, ownerId, job.kind, place.id);
            if (!stillWanted(job, property)) throw new HireAbort('That work has been done already.');

            // Laid stock first, then the carpenter's own.
            const fromPack: { name: string; quantity: number }[] = [];
            for (const c of job.cost) {
                const item = await trx('items').where({ name: c.itemName }).first('id');
                if (!item) throw new HireAbort(`No one in Talaran can make ${c.itemName} yet.`);
                const laid = Number((await trx('property_hire_stock').where({ hire_id: hire.id, item_id: item.id }).first('quantity'))?.quantity ?? 0);
                const use = Math.min(laid, c.qty);
                if (use > 0) {
                    const n = await trx('property_hire_stock').where({ hire_id: hire.id, item_id: item.id }).where('quantity', '>=', use).decrement('quantity', use);
                    if (n !== 1) throw new HireAbort('The materials laid here have changed.');
                }
                if (c.qty > use) fromPack.push({ name: c.itemName, quantity: c.qty - use });
            }
            if (fromPack.length) {
                const took = await takeItemsWithin(trx, carpenterId, fromPack);
                if (!took.ok) throw new HireAbort('You no longer have the materials.');
            }

            const ownerName = await nameOf(trx, ownerId);
            if (job.kind === 'farmstead') {
                const t = homesteadTier(job.tier)!;
                if (job.work === 'establish') await raiseFarmsteadWithin(trx, ownerId, place.id, t);
                else await upgradeFarmsteadWithin(trx, property.id, t);
            } else if (job.work === 'establish') {
                await raiseShopWithin(trx, ownerId, place.id, job.tier, ownerName);
            } else {
                await upgradeShopWithin(trx, property.id, job.tier);
            }

            const fee = Number(hire.fee_gold);
            if (fee > 0) await creditGoldWithin(trx, { playerId: carpenterId, amount: fee, reason: 'hire_fee', refType: 'property_hire', refId: hire.id });
            for (const s of await stockRows(trx, hire.id)) await addItemToInventoryWithin(trx, ownerId, s.item_id, s.quantity);
            await trx('property_hires').where({ id: hire.id }).delete();
            return { fee, place: place.name, ownerName };
        });

        const xp = buildXpFor(await carpentryLevel(carpenterId), job.seconds);
        await awardXp(carpenterId, 'Carpentry', xp);
        await incrementStats(carpenterId, { total_actions_completed: 1 });
        if (job.kind === 'farmstead' && job.work === 'establish') {
            const { updateQuestObjectiveProgress } = await import('../routes/quests');
            await updateQuestObjectiveProgress(ownerId, 'build', 'Farmstead', 1);
        }
        const carpenter = await nameOf(db, carpenterId);
        await letter(ownerId, `Your ${job.kind} in ${done.place}`,
            `${carpenter} has finished ${describe(job, done.place)} for you.${done.fee > 0 ? ` The ${gold(done.fee)} fee is paid.` : ''}`);
        pushToPlayer(ownerId, 'hires_changed', { kind: job.kind });
        logger.info(`Player ${carpenterId} built ${job.kind} ${job.work} tier ${job.tier} for player ${ownerId} (hire ${hireId}, ${done.fee} gold)`);
        return {
            success: true, xp, skillName: 'Carpentry',
            message: job.work === 'establish'
                ? `${done.ownerName}'s ${job.kind} in ${done.place} stands.${done.fee > 0 ? ` You are paid ${gold(done.fee)}.` : ''}`
                : `${done.ownerName}'s ${job.kind} in ${done.place} is built on to tier ${job.tier}.${done.fee > 0 ? ` You are paid ${gold(done.fee)}.` : ''}`,
        };
    } catch (err) {
        if (err instanceof HireAbort || err instanceof UpgradeAbort || err instanceof ShopUpgradeAbort) return { success: false, error: err.message };
        logger.error(`resolveHireBuild error: ${err}`);
        return { success: false, error: SERVER_ERROR };
    }
}
