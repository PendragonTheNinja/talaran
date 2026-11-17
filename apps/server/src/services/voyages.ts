import db from '../db';
import { logger } from '../lib/logger';
import { SERVER_ERROR } from '../lib/serviceResult';
import { announcePlayersHere } from '../lib/realtime';
import { MOUNT_RATE, TRAVEL_SKILL } from './travel';
import { levelFromXp } from './xp';
import { addItemToInventoryWithin } from './inventory';
import { creditGoldWithin } from './gold';
import { endFightIfAny } from './combatFights';
import { dropIsletFind, rollIsletFindWithin } from './isletFinds';
import { seaSpeedFactor, wearSailingPieceWithin } from './sailorSet';

// ── Voyages: putting to sea, islets, and coming home ─────────────────────────
// (docs/sailing-spec.md §6, docs/islets-plan.md; Nathan, 2026-11-15 to 17)
//
// From a port (a place with a slip) a player who owns a boat puts to sea and
// lands on one of the island's islets, picked at random by weight: which islet
// is pure chance, and a better boat or a higher Wayfaring level changes only
// how long the legs take, never where they end. A voyage may make up to
// LANDINGS_PER_VOYAGE landings, sailing on from islet to islet, before it must
// make port; sailing home goes back to the port it left.
//
// Every leg is an ordinary 'traveling' action whose data says it is at sea
// ({ base, mounted: false, sea: 'out' | 'on' | 'home' }), so the travel bar,
// a refresh, and the tick's arrival all work as for a road. The tick pays
// Wayfaring at SEA_XP_RATE on the leg's base time (near a horse's; walking
// stays the best Wayfaring for the time), rolls no road finds, and calls
// arriveBySea for the rest: a landing records the islet as found and searches
// the strandline; a homecoming ends the voyage.
//
// A player who leaves the game on an islet is brought home when they next
// come back (bringHomeIfAway, from the socket join): everything they carry
// comes with them, and nothing else is lost.

export const ISLET_LEG_SECONDS = 180;
export const LANDINGS_PER_VOYAGE = 3;
/** Wayfaring XP per second of a leg's base time: a horse's rate (services/travel.ts MOUNT_XP_RATE). */
export const SEA_XP_RATE = 0.45;

class VoyageAbort extends Error {
    constructor(message: string, public status = 400) { super(message); }
}

type Ok<T> = { ok: true } & T;
type Refused = { ok: false; error: string; status: number };

function refuse(err: unknown, context: string): Refused {
    if (err instanceof VoyageAbort) return { ok: false, error: err.message, status: err.status };
    if ((err as { code?: string })?.code === '23505') return { ok: false, error: 'You are already at sea.', status: 409 };
    logger.error(`voyages ${context}: ${err}`);
    return { ok: false, error: SERVER_ERROR, status: 500 };
}

export type SeaLeg = 'out' | 'on' | 'home';

async function wayfaringLevel(playerId: number, x: any = db): Promise<number> {
    const row = await x('player_skills as ps').join('skills as s', 's.id', 'ps.skill_id')
        .where({ 'ps.player_id': playerId, 's.name': TRAVEL_SKILL }).first('ps.xp');
    return row ? levelFromXp(Number(row.xp)) : 1;
}

/** A leg's real seconds: the boat's start and floor, closed by Wayfaring as a mount's are (services/travel.ts). */
export function legSeconds(base: number, start: number, floor: number, wayfaring: number): number {
    const top = Math.max(start, floor);
    return Math.max(1, Math.round(base * (floor + (top - floor) * Math.pow(MOUNT_RATE, wayfaring))));
}

/** One line for a moment, at random; null when none is written. */
async function line(island: string, moment: string, locationId: number | null = null, x: any = db): Promise<string | null> {
    const q = x('voyage_lines').where({ island, moment, is_active: true });
    const rows = await (locationId ? q.where({ location_id: locationId }) : q.whereNull('location_id')).select('text');
    return rows.length ? rows[Math.floor(Math.random() * rows.length)].text : null;
}

/** Pick an islet of `island` by weight, never `not`. */
async function pickIslet(island: string, not: number | null, x: any = db): Promise<{ id: number; name: string } | null> {
    const islets = (await x('locations').where({ region: island }).whereNotNull('islet_kind').select('id', 'name', 'islet_weight'))
        .filter((l: any) => Number(l.id) !== Number(not) && Number(l.islet_weight) > 0);
    const total = islets.reduce((s: number, l: any) => s + Number(l.islet_weight), 0);
    let roll = Math.random() * total;
    for (const l of islets) {
        roll -= Number(l.islet_weight);
        if (roll < 0) return { id: l.id, name: l.name };
    }
    return islets.length ? { id: islets[islets.length - 1].id, name: islets[islets.length - 1].name } : null;
}

async function standing(playerId: number, x: any = db) {
    return x('players as p').join('locations as l', 'l.id', 'p.current_location_id')
        .where('p.id', playerId)
        .first('p.current_location_id as location_id', 'l.name', 'l.region', 'l.has_slip', 'l.islet_kind');
}

// ── Reading ─────────────────────────────────────────────────────────────────

export async function voyageState(playerId: number) {
    const here = await standing(playerId);
    const voyage = await db('player_voyages as v').join('vessel_types as t', 't.id', 'v.vessel_type_id')
        .join('locations as l', 'l.id', 'v.home_location_id')
        .where('v.player_id', playerId).first('t.name as boat', 'l.name as home', 'v.landings');
    const islets = here?.region
        ? await db('locations').where({ region: here.region }).whereNotNull('islet_kind').orderBy('id').select('id', 'name', 'islet_kind')
        : [];
    const found = new Map<number, { found_at: string; landings: number }>(
        (await db('player_islets_found').where({ player_id: playerId }).select('location_id', 'found_at', 'landings'))
            .map((r: any) => [Number(r.location_id), { found_at: r.found_at, landings: Number(r.landings) }]),
    );
    return {
        onIslet: !!here?.islet_kind,
        atPort: !!here?.has_slip,
        voyage: voyage ? { boat: voyage.boat, home: voyage.home, landings: Number(voyage.landings), landingsLeft: Math.max(0, LANDINGS_PER_VOYAGE - Number(voyage.landings)) } : null,
        // The island's islet map: a name only once found; the count either way.
        islets: islets.map((l: any) => {
            const f = found.get(Number(l.id));
            return f ? { found: true, name: l.name, kind: l.islet_kind, landings: f.landings } : { found: false, name: null, kind: null, landings: 0 };
        }),
    };
}

// ── Setting out, sailing on, coming home ────────────────────────────────────

/**
 * Start a leg: the old action goes, and the journey starts, as a road's does
 * (routes/travel.ts). `write` runs inside the same transaction, with the
 * player row locked, to make or update the voyage.
 */
async function startLeg(playerId: number, to: { id: number; name: string }, leg: SeaLeg, vessel: any,
    write: (trx: any) => Promise<void>): Promise<{ travelTime: number }> {
    await endFightIfAny(playerId);
    const base = ISLET_LEG_SECONDS;
    // The boat and Wayfaring set the leg; the sailor's set takes its share off (services/sailorSet.ts).
    const travelTime = Math.max(1, Math.round(
        legSeconds(base, Number(vessel.speed_start ?? 1), Number(vessel.speed_floor ?? 1), await wayfaringLevel(playerId))
        * await seaSpeedFactor(playerId)));
    const now = new Date();
    const from = await db('players').where({ id: playerId }).first('current_location_id');
    await db.transaction(async (trx) => {
        await trx('players').where({ id: playerId }).forNoKeyUpdate().first('id');
        const trade = await trx('trades')
            .where(function () { this.where({ player1_id: playerId }).orWhere({ player2_id: playerId }); })
            .whereIn('status', ['pending', 'active']).first('id');
        if (trade) throw new VoyageAbort('Finish or cancel your trade before you put to sea.');
        await write(trx);
        // Leaving an islet loses what was found there.
        await dropIsletFind(playerId, trx);
        await trx('player_actions').where({ player_id: playerId }).delete();
        await trx('player_actions').insert({
            player_id: playerId,
            action_type: 'traveling',
            resource_node_id: null,
            location_id: to.id,
            started_at: now,
            completes_at: new Date(now.getTime() + travelTime * 1000),
            last_timer_seconds: travelTime,
            auto_restart: false,
            last_bot_check: now,
            bot_check_pending: false,
            action_data: JSON.stringify({ base, mounted: false, sea: leg }),
        });
    });
    announcePlayersHere(from?.current_location_id);
    return { travelTime };
}

/** From a port, in a boat the player owns: out to an islet of this island. */
export async function putToSea(playerId: number, boatRaw: unknown): Promise<Ok<{ travelTime: number; message: string | null }> | Refused> {
    try {
        const boat = typeof boatRaw === 'string' ? boatRaw : '';
        const vessel = await db('vessel_types').where({ key: boat, is_active: true }).first();
        if (!vessel) throw new VoyageAbort('There is no such boat.');
        if (!(await db('player_vessels').where({ player_id: playerId, vessel_type_id: vessel.id }).first())) {
            throw new VoyageAbort(`You have no ${vessel.name}.`);
        }
        if ((await wayfaringLevel(playerId)) < Number(vessel.sail_level)) {
            throw new VoyageAbort(`You need Wayfaring ${vessel.sail_level} to sail a ${vessel.name}.`);
        }
        const here = await standing(playerId);
        if (!here?.has_slip) throw new VoyageAbort('You can only put to sea from a port.');
        if (await db('player_voyages').where({ player_id: playerId }).first()) throw new VoyageAbort('You are already at sea.');
        const islet = await pickIslet(here.region, null);
        if (!islet) throw new VoyageAbort('There is nowhere to sail to from here yet.');
        const { travelTime } = await startLeg(playerId, islet, 'out', vessel, async (trx) => {
            await trx('player_voyages').insert({ player_id: playerId, vessel_type_id: vessel.id, home_location_id: here.location_id, landings: 0 });
        });
        return { ok: true, travelTime, message: await line(here.region, 'set_out') };
    } catch (err) {
        return refuse(err, 'putToSea');
    }
}

/** From an islet, on to another, while the voyage has landings left. */
export async function sailOn(playerId: number): Promise<Ok<{ travelTime: number; message: string | null }> | Refused> {
    try {
        const here = await standing(playerId);
        if (!here?.islet_kind) throw new VoyageAbort('You are not on an islet.');
        const voyage = await db('player_voyages').where({ player_id: playerId }).first();
        if (!voyage) throw new VoyageAbort('You have no boat here.');
        if (Number(voyage.landings) >= LANDINGS_PER_VOYAGE) {
            throw new VoyageAbort(`The water is low in the casks. After ${LANDINGS_PER_VOYAGE} landings you must make port.`);
        }
        const vessel = await db('vessel_types').where({ id: voyage.vessel_type_id }).first();
        const islet = await pickIslet(here.region, here.location_id);
        if (!islet) throw new VoyageAbort('There is nowhere else to sail to.');
        const { travelTime } = await startLeg(playerId, islet, 'on', vessel, async () => { /* the voyage row is unchanged until landing */ });
        return { ok: true, travelTime, message: await line(here.region, 'sail_on') };
    } catch (err) {
        return refuse(err, 'sailOn');
    }
}

/** From an islet, back to the port the voyage left. */
export async function sailHome(playerId: number): Promise<Ok<{ travelTime: number; message: string | null }> | Refused> {
    try {
        const here = await standing(playerId);
        if (!here?.islet_kind) throw new VoyageAbort('You are not on an islet.');
        const voyage = await db('player_voyages').where({ player_id: playerId }).first();
        if (!voyage) throw new VoyageAbort('You have no boat here.');
        const vessel = await db('vessel_types').where({ id: voyage.vessel_type_id }).first();
        const home = await db('locations').where({ id: voyage.home_location_id }).first('id', 'name');
        const { travelTime } = await startLeg(playerId, home, 'home', vessel, async () => { /* ended on arrival */ });
        return { ok: true, travelTime, message: null };
    } catch (err) {
        return refuse(err, 'sailHome');
    }
}

// ── Arriving ────────────────────────────────────────────────────────────────

export interface SeaArrival {
    /** Lines for the arrival card and the travel log: the landing, then the strandline. */
    events: { message: string; itemName: string | null; quantity: number }[]
    firstLanding: boolean
}

/**
 * The tick, after a sea leg has moved the player (processTravelAction).
 * Landing: count it, record the islet, search the strandline. Home: the
 * voyage is over. Everything in one transaction on the locked player row.
 */
export async function arriveBySea(playerId: number, locationId: number, leg: SeaLeg): Promise<SeaArrival> {
    const place = await db('locations').where({ id: locationId }).first('id', 'name', 'region', 'islet_kind');
    const findLine = async (moment: string) => line(island, moment);
    const island = place?.region ?? '';
    if (leg === 'home' || !place?.islet_kind) {
        const broke = await db.transaction(async (trx) => {
            await trx('players').where({ id: playerId }).forNoKeyUpdate().first('id');
            await trx('player_voyages').where({ player_id: playerId }).delete();
            return wearSailingPieceWithin(trx, playerId);
        });
        const said = await line(island, 'home');
        const events: SeaArrival['events'] = said ? [{ message: said, itemName: null, quantity: 0 }] : [];
        if (broke) events.push({ message: `Your ${broke} gives out at last, worn through by the sea.`, itemName: null, quantity: 0 });
        return { events, firstLanding: false };
    }

    const arrive = await line(island, 'arrive', place.id);
    const strand = await rollStrandline(island);
    const strandText = await line(island, 'strandline');
    return db.transaction(async (trx) => {
        await trx('players').where({ id: playerId }).forNoKeyUpdate().first('id');
        await trx('player_voyages').where({ player_id: playerId }).increment('landings', 1);
        const inserted = await trx('player_islets_found').insert({ player_id: playerId, location_id: place.id })
            .onConflict(['player_id', 'location_id']).ignore().returning('location_id');
        if (!inserted.length) await trx('player_islets_found').where({ player_id: playerId, location_id: place.id }).increment('landings', 1);

        const events: SeaArrival['events'] = [];
        if (arrive) events.push({ message: arrive, itemName: null, quantity: 0 });
        if (strand) {
            let words: string;
            if (strand.item === 'coins') {
                await creditGoldWithin(trx, { playerId, amount: strand.quantity, reason: 'strandline_coins' });
                words = strand.words;
                events.push({ message: (strandText ?? 'On the tideline: {find}.').replace('{find}', words), itemName: null, quantity: 0 });
            } else {
                const item = await trx('items').where({ name: strand.item }).first('id', 'name');
                if (item) {
                    await addItemToInventoryWithin(trx, playerId, item.id, strand.quantity);
                    words = strand.words;
                    events.push({ message: (strandText ?? 'On the tideline: {find}.').replace('{find}', words), itemName: item.name, quantity: strand.quantity });
                }
            }
        }
        // Every sea journey wears one worn piece of the sailor's set.
        const broke = await wearSailingPieceWithin(trx, playerId);
        if (broke) events.push({ message: `Your ${broke} gives out at last, worn through by the sea.`, itemName: null, quantity: 0 });
        // This landing's own find (services/isletFinds.ts), told after the shore.
        const find = await rollIsletFindWithin(trx, playerId, { id: place.id, region: island });
        const said = await findLine(`find_${find.kind}`);
        if (said) events.push({ message: said, itemName: null, quantity: 0 });
        return { events, firstLanding: inserted.length > 0 };
    });
}

/** How a strandline find reads: the row's own words, or the item's name and count. */
function strandWords(row: any, quantity: number): string {
    const written = quantity === 1 ? row.words_one : row.words_many;
    if (written) return String(written).replace('{n}', String(quantity));
    return quantity === 1 ? String(row.item_name) : `${quantity} ${row.item_name}`;
}

async function rollStrandline(island: string): Promise<{ item: string; quantity: number; words: string } | null> {
    const rows = await db('strandline_finds').where({ island, is_active: true }).select('item_name', 'min_qty', 'max_qty', 'weight', 'words_one', 'words_many');
    const total = rows.reduce((s: number, r: any) => s + Number(r.weight), 0);
    let roll = Math.random() * total;
    for (const r of rows) {
        roll -= Number(r.weight);
        if (roll < 0) {
            const min = Number(r.min_qty), max = Number(r.max_qty);
            const quantity = min + Math.floor(Math.random() * (max - min + 1));
            return { item: r.item_name, quantity, words: strandWords(r, quantity) };
        }
    }
    return null;
}

// ── Absence ─────────────────────────────────────────────────────────────────

/**
 * Called when a player's socket joins, before last_seen is stamped: a player
 * who left the game while standing on an islet, and was gone longer than
 * `graceMs`, wakes in the port they sailed from with everything they carry
 * (Nathan, 2026-11-17: no one is stranded).
 */
export async function bringHomeIfAway(playerId: number, graceMs: number): Promise<boolean> {
    try {
        const p = await db('players as p').join('locations as l', 'l.id', 'p.current_location_id')
            .where('p.id', playerId).first('p.last_seen', 'l.islet_kind', 'l.region');
        if (!p?.islet_kind) return false;
        if (p.last_seen && Date.now() - new Date(p.last_seen).getTime() < graceMs) return false;
        if (await db('player_actions').where({ player_id: playerId, action_type: 'traveling' }).first()) return false;
        const voyage = await db('player_voyages').where({ player_id: playerId }).first();
        const home = voyage
            ? voyage.home_location_id
            : (await db('locations').where({ region: p.region, has_slip: true }).orderBy('id').first('id'))?.id;
        if (!home) return false;
        await db.transaction(async (trx) => {
            await trx('players').where({ id: playerId }).forNoKeyUpdate().first('id');
            await trx('player_actions').where({ player_id: playerId }).delete();
            await trx('players').where({ id: playerId }).update({ current_location_id: home });
            await trx('player_voyages').where({ player_id: playerId }).delete();
            await dropIsletFind(playerId, trx);
        });
        logger.info(`player ${playerId} was away on an islet and was brought home`);
        return true;
    } catch (err) {
        logger.error(`voyages bringHomeIfAway (player ${playerId}): ${err}`);
        return false;
    }
}
