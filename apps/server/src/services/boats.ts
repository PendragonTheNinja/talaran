import db from '../db';
import { logger } from '../lib/logger';
import { SERVER_ERROR } from '../lib/serviceResult';
import { BOAT_FLIPS, piecesAverage } from '../lib/buildRoll';
import { rungOfTier } from '../lib/tiers';
import { missingBuildTool } from './construction';
import { BUILD_SECONDS, buildTurnXp, carpentryLevel, takeBuildPiecesWithin } from './builds';
import { awardXp } from './xp';

// ── Boats, step 1: building one (docs/sailing-spec.md §5; Nathan, 2026-11-15) ──
//
// A boat is a row, never an item (`player_vessels`). It is raised on a slip in
// a port (`locations.has_slip`): the owner lays the keel there, then sets its
// pieces in order, each a list of materials (`vessel_types.pieces`), with a
// repeating 20-second 'vessel_build' action that sets in 1 to 5 of one
// material (lib/buildRoll.ts, more often 5 the better the carpenter) and pays
// Carpentry for the turn at the boat's tier band (services/builds.ts, shared
// with the guild hall). The hull stays on the slip between sessions; the last
// piece makes the boat the owner's.
//
// Presence is enforced here: every build action needs the player standing at
// the slip their hull is on. Locks, in order: the player row, then the build
// row, then its progress. A refusal after a write throws BoatAbort so the
// transaction rolls back (CLAUDE.md §4).
//
// Sailing it, building for hire (docs/antura-plan.md §6b), and the Cog come in
// later steps.

class BoatAbort extends Error {
    constructor(message: string, public status = 400) { super(message); }
}

type Ok<T> = { ok: true } & T;
type Refused = { ok: false; error: string; status: number };

function refuse(err: unknown, context: string): Refused {
    if (err instanceof BoatAbort) return { ok: false, error: err.message, status: err.status };
    if ((err as { code?: string })?.code === '23505') return { ok: false, error: 'You are already performing an action', status: 409 };
    logger.error(`boats ${context}: ${err}`);
    return { ok: false, error: SERVER_ERROR, status: 500 };
}

interface Material { item: string; qty: number }
interface Piece { key: string; name: string; materials: Material[] }
interface VesselType {
    id: number; key: string; name: string; tier: number; build_level: number; sail_level: number
    description: string | null; pieces: Piece[]
}

function asType(row: any): VesselType {
    const pieces = typeof row.pieces === 'string' ? JSON.parse(row.pieces) : row.pieces;
    return { ...row, tier: Number(row.tier), build_level: Number(row.build_level), sail_level: Number(row.sail_level), pieces: Array.isArray(pieces) ? pieces : [] };
}

async function vesselType(where: Record<string, unknown>, x: any = db): Promise<VesselType | null> {
    const row = await x('vessel_types').where({ ...where, is_active: true }).first();
    return row ? asType(row) : null;
}

/** Where the player stands, and whether a hull can be laid there. */
async function whereIs(playerId: number, x: any = db) {
    return x('players as p').join('locations as l', 'l.id', 'p.current_location_id')
        .where('p.id', playerId).first('p.current_location_id as location_id', 'l.name as location_name', 'l.has_slip');
}

/** Whole-word "a" or "an" before a boat's name. */
const article = (name: string) => (/^[aeiou]/i.test(name) ? 'an' : 'a');

// ── Reading ─────────────────────────────────────────────────────────────────

export async function boatState(playerId: number) {
    const here = await whereIs(playerId);
    const carpentry = await carpentryLevel(playerId);
    const types = (await db('vessel_types').where({ is_active: true }).orderBy(['tier', 'name'])).map(asType);
    const owned = await db('player_vessels as v').join('vessel_types as t', 't.id', 'v.vessel_type_id')
        .where('v.player_id', playerId).orderBy('t.tier').select('t.key', 't.name', 'v.built_at');
    const builds = await db('vessel_builds as b').join('locations as l', 'l.id', 'b.location_id')
        .where('b.player_id', playerId).select('b.*', 'l.name as location_name');

    const itemNames = [...new Set(types.flatMap(t => t.pieces.flatMap(p => p.materials.map(m => m.item))))];
    const items = itemNames.length ? await db('items').whereIn('name', itemNames).select('id', 'name') : [];
    const idByName = new Map<string, number>(items.map((i: any) => [i.name, i.id]));
    const held = idByName.size
        ? new Map<number, number>((await db('player_inventory').where({ player_id: playerId }).whereIn('item_id', [...idByName.values()]))
            .map((r: any) => [r.item_id, Number(r.quantity)]))
        : new Map<number, number>();

    const hull = async (b: any, t: VesselType) => {
        const piece = t.pieces[b.piece_index] ?? null;
        const delivered = new Map<number, number>((await db('vessel_build_progress').where({ build_id: b.id }))
            .map((r: any) => [r.item_id, Number(r.delivered)]));
        return {
            locationName: b.location_name,
            atSlip: Number(b.location_id) === Number(here?.location_id),
            pieceNumber: Number(b.piece_index) + 1,
            pieceCount: t.pieces.length,
            pieceName: piece?.name ?? null,
            piecesDone: t.pieces.slice(0, b.piece_index).map(p => p.name),
            requirements: (piece?.materials ?? []).map(m => {
                const id = idByName.get(m.item);
                return {
                    item: m.item,
                    needed: m.qty,
                    delivered: id ? delivered.get(id) ?? 0 : 0,
                    exists: !!id,
                    held: id ? held.get(id) ?? 0 : 0,
                };
            }),
        };
    };

    return {
        locationName: here?.location_name ?? null,
        hasSlip: !!here?.has_slip,
        carpentryLevel: carpentry,
        boats: await Promise.all(types.map(async t => {
            const build = builds.find((b: any) => Number(b.vessel_type_id) === t.id);
            return {
                key: t.key,
                name: t.name,
                tier: t.tier,
                buildLevel: t.build_level,
                sailLevel: t.sail_level,
                description: t.description,
                owned: owned.some((o: any) => o.key === t.key),
                canBuild: carpentry >= t.build_level,
                xpPerTurn: buildTurnXp(t.tier),
                piecesPerTurn: Math.round(piecesAverage(BOAT_FLIPS, carpentry, rungOfTier(t.tier)) * 10) / 10,
                materials: t.pieces.map(p => ({ name: p.name, materials: p.materials })),
                hull: build ? await hull(build, t) : null,
            };
        })),
    };
}

// ── Laying the keel ─────────────────────────────────────────────────────────

/** Start a hull of `typeKey` on the slip where the player stands. Nothing is taken yet. */
export async function layKeel(playerId: number, typeKeyRaw: unknown): Promise<Ok<{ name: string }> | Refused> {
    try {
        const typeKey = typeof typeKeyRaw === 'string' ? typeKeyRaw : '';
        const t = await vesselType({ key: typeKey });
        if (!t) throw new BoatAbort('There is no such boat.');
        const here = await whereIs(playerId);
        if (!here?.has_slip) throw new BoatAbort('There is no slip here to build on.');
        if ((await carpentryLevel(playerId)) < t.build_level) throw new BoatAbort(`You need Carpentry ${t.build_level} to build ${article(t.name)} ${t.name}.`);
        if (await db('player_vessels').where({ player_id: playerId, vessel_type_id: t.id }).first()) {
            throw new BoatAbort(`You already have ${article(t.name)} ${t.name}.`);
        }
        const inserted = await db('vessel_builds')
            .insert({ player_id: playerId, vessel_type_id: t.id, location_id: here.location_id })
            .onConflict(['player_id', 'vessel_type_id']).ignore().returning('id');
        if (!inserted.length) throw new BoatAbort(`You already have ${article(t.name)} ${t.name} on a slip.`);
        logger.info(`player ${playerId} laid the keel of a ${t.name} at ${here.location_name}`);
        return { ok: true, name: t.name };
    } catch (err) {
        return refuse(err, 'layKeel');
    }
}

// ── Building ────────────────────────────────────────────────────────────────

/** The action's data: which boat, and which material. */
function parseData(data: unknown): { typeKey: string; itemName: string } | null {
    if (typeof data !== 'string') return null;
    const bar = data.indexOf('|');
    if (bar < 1) return null;
    return { typeKey: data.slice(0, bar), itemName: data.slice(bar + 1) };
}

/** Re-checked at the start and on every turn: what one more turn of `itemName` on this boat needs. */
async function buildCheck(playerId: number, typeKey: string, itemName: string, x: any = db, lock = false) {
    const t = await vesselType({ key: typeKey }, x);
    if (!t) throw new BoatAbort('There is no such boat.');
    const q = x('vessel_builds').where({ player_id: playerId, vessel_type_id: t.id });
    const build = await (lock ? q.forUpdate() : q).first();
    if (!build) throw new BoatAbort(`You have no ${t.name} on a slip.`);
    const here = await whereIs(playerId, x);
    if (Number(build.location_id) !== Number(here?.location_id)) {
        const at = await x('locations').where({ id: build.location_id }).first('name');
        throw new BoatAbort(`Your ${t.name} is on the slip at ${at?.name ?? 'another port'}.`);
    }
    const piece = t.pieces[build.piece_index];
    if (!piece) throw new BoatAbort(`Your ${t.name} has every piece it needs.`);
    const need = piece.materials.find(m => m.item === itemName);
    if (!need) throw new BoatAbort(`No ${itemName} goes into the ${piece.name.toLowerCase()}.`);
    const item = await x('items').where({ name: itemName }).first('id', 'name');
    if (!item) throw new BoatAbort(`No one in Talaran can make ${itemName} yet.`);
    const tool = await missingBuildTool(playerId, x);
    if (tool) throw new BoatAbort(tool.message);
    return { t, build, piece, need, item, here };
}

export async function startBoatBuild(playerId: number, typeKeyRaw: unknown, itemNameRaw: unknown): Promise<Ok<{ timerSeconds: number }> | Refused> {
    try {
        const typeKey = typeof typeKeyRaw === 'string' ? typeKeyRaw : '';
        const itemName = typeof itemNameRaw === 'string' ? itemNameRaw : '';
        const { build, need, item, here } = await buildCheck(playerId, typeKey, itemName);
        const progress = await db('vessel_build_progress').where({ build_id: build.id, item_id: item.id }).first();
        if (Number(progress?.delivered ?? 0) >= need.qty) throw new BoatAbort(`This piece has all the ${itemName} it needs.`);
        const held = await db('player_inventory').where({ player_id: playerId, item_id: item.id }).first();
        if (!held || Number(held.quantity) < 1) throw new BoatAbort(`You have no ${itemName}.`);
        if (await db('player_actions').where({ player_id: playerId }).first()) {
            throw new BoatAbort('You are already performing an action', 409);
        }
        const now = new Date();
        await db('player_actions').insert({
            player_id: playerId,
            action_type: 'vessel_build',
            action_data: `${typeKey}|${itemName}`,
            location_id: here.location_id,
            started_at: now,
            completes_at: new Date(now.getTime() + BUILD_SECONDS * 1000),
            auto_restart: true,
            last_timer_seconds: BUILD_SECONDS,
            last_bot_check: now,
            bot_check_pending: false,
        });
        return { ok: true, timerSeconds: BUILD_SECONDS };
    } catch (err) {
        return refuse(err, 'startBoatBuild');
    }
}

export interface BoatBuildResult {
    success: boolean
    error?: string
    xpAwarded?: number
    skillName?: string
    message?: string
    /** Go on: more of this material is wanted and the player has some. */
    carryOn?: boolean
}

/** One turn on the hull, for the tick: 1 to 5 of the material set in. Every precondition is re-checked. */
export async function resolveBoatBuildCycle(playerId: number, data: unknown): Promise<BoatBuildResult> {
    try {
        const parsed = parseData(data);
        if (!parsed) return { success: false, error: 'Your building stopped.' };
        const carpentry = await carpentryLevel(playerId);
        const outcome = await db.transaction(async (trx) => {
            await trx('players').where({ id: playerId }).forNoKeyUpdate().first();
            const { t, build, piece, need, item } = await buildCheck(playerId, parsed.typeKey, parsed.itemName, trx, true);

            await trx('vessel_build_progress').insert({ build_id: build.id, item_id: item.id, delivered: 0 })
                .onConflict(['build_id', 'item_id']).ignore();
            const progress = await trx('vessel_build_progress').where({ build_id: build.id, item_id: item.id }).forUpdate().first();
            if (Number(progress.delivered) >= need.qty) throw new BoatAbort(`This piece has all the ${item.name} it needs.`);

            const pieces = await takeBuildPiecesWithin(trx, {
                playerId, item, wanted: need.qty, delivered: Number(progress.delivered), flips: BOAT_FLIPS, carpentry, tier: t.tier,
            });
            if (pieces < 1) throw new BoatAbort(`You have no ${item.name} left.`);
            const delivered = Number(progress.delivered) + pieces;
            await trx('vessel_build_progress').where({ build_id: build.id, item_id: item.id }).increment('delivered', pieces);

            const xp = buildTurnXp(t.tier);
            await awardXp(playerId, 'Carpentry', xp, trx);

            // Is the piece finished? Every material, this one counted.
            const ids = await trx('items').whereIn('name', piece.materials.map(m => m.item)).select('id', 'name');
            const doneByName = new Map<string, number>();
            for (const row of await trx('vessel_build_progress').where({ build_id: build.id })) {
                const name = ids.find((i: any) => i.id === row.item_id)?.name;
                if (name) doneByName.set(name, Number(row.delivered));
            }
            const pieceDone = ids.length === piece.materials.length
                && piece.materials.every(m => (doneByName.get(m.item) ?? 0) >= m.qty);

            let finished = false;
            let carryOn = !pieceDone && delivered < need.qty;
            if (pieceDone) {
                await trx('vessel_build_progress').where({ build_id: build.id }).delete();
                const nextIndex = Number(build.piece_index) + 1;
                if (nextIndex >= t.pieces.length) {
                    // The last piece: the hull leaves the slip as the owner's boat.
                    const moved = await trx('vessel_builds').where({ id: build.id, piece_index: build.piece_index }).delete();
                    if (moved !== 1) throw new BoatAbort('The hull changed while you worked. Look again.');
                    await trx('player_vessels').insert({ player_id: playerId, vessel_type_id: t.id });
                    finished = true;
                    carryOn = false;
                } else {
                    const moved = await trx('vessel_builds').where({ id: build.id, piece_index: build.piece_index }).update({ piece_index: nextIndex });
                    if (moved !== 1) throw new BoatAbort('The hull changed while you worked. Look again.');
                    // Carry on into the next piece if it wants the same material.
                    carryOn = t.pieces[nextIndex].materials.some(m => m.item === item.name);
                }
            }
            if (carryOn) {
                const more = await trx('player_inventory').where({ player_id: playerId, item_id: item.id }).first('quantity');
                carryOn = Number(more?.quantity ?? 0) > 0;
            }

            const message = finished
                ? `The last of the ${piece.name.toLowerCase()} goes in. Your ${t.name} is finished, and it is yours to sail.`
                : pieceDone
                    ? `${pieces} ${item.name} set in. That finishes the ${piece.name.toLowerCase()}; next comes the ${t.pieces[Number(build.piece_index) + 1].name.toLowerCase()}.`
                    : `${pieces} ${item.name} set into the ${piece.name.toLowerCase()}: ${delivered.toLocaleString()} of ${need.qty.toLocaleString()}.`;
            return { xp, carryOn, message, finished, name: t.name };
        });
        if (outcome.finished) logger.info(`player ${playerId} finished a ${outcome.name}`);
        return { success: true, xpAwarded: outcome.xp, skillName: 'Carpentry', message: outcome.message, carryOn: outcome.carryOn };
    } catch (err) {
        if (err instanceof BoatAbort) return { success: false, error: err.message };
        logger.error(`boats build cycle (player ${playerId}): ${err}`);
        return { success: false, error: SERVER_ERROR };
    }
}
