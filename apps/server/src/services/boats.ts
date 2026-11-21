import db from '../db';
import { logger } from '../lib/logger';
import { SERVER_ERROR } from '../lib/serviceResult';
import { BOAT_FLIPS, piecesAverage } from '../lib/buildRoll';
import { rungOfTier } from '../lib/tiers';
import { missingBuildTool } from './construction';
import { BUILD_SECONDS, buildTurnXp, carpentryLevel, MAX_PAY_RATE, payWageWithin, takeBuildPiecesWithin } from './builds';
import { awardXp } from './xp';
import { creditGoldWithin, debitGoldWithin, lockPlayersInOrder } from './gold';
import { addItemToInventoryWithin, takeItemsWithin } from './inventory';
import { pushToPlayer } from '../lib/realtime';

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
// Building for hire (docs/antura-plan.md §6b): the owner names hands, pays
// them by the piece from a purse at the slip, and may lay materials there for
// them (below). The Cog comes with Antura.

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

    const idOf = (name: string) => idByName.get(name) ?? -1;
    const hull = async (b: any, t: VesselType) => {
        const piece = t.pieces[b.piece_index] ?? null;
        const delivered = new Map<number, number>((await db('vessel_build_progress').where({ build_id: b.id }))
            .map((r: any) => [r.item_id, Number(r.delivered)]));
        const stock = new Map<number, number>((await db('vessel_build_stock').where({ build_id: b.id }))
            .map((r: any) => [r.item_id, Number(r.quantity)]));
        const hands = await db('vessel_build_hands as h').join('players as p', 'p.id', 'h.player_id')
            .where('h.build_id', b.id).orderBy('h.named_at').pluck('p.username');
        // Everything laid at the slip, by name, for taking back.
        const laid = (await db('vessel_build_stock as s').join('items as i', 'i.id', 's.item_id')
            .where('s.build_id', b.id).where('s.quantity', '>', 0).select('i.name', 's.quantity'))
            .map((r: any) => ({ item: r.name, quantity: Number(r.quantity) }));
        const wanted = await stillWanted(db, t, b);
        return {
            hire: {
                rate: Number(b.pay_rate ?? 0), purse: Number(b.fund_gold ?? 0), hands, laid,
                // Per material: still wanted across every piece left, and how many more may be laid.
                materials: [...wanted].map(([item, qty]) => ({ item, wanted: qty, laid: stock.get(idOf(item)) ?? 0, room: Math.max(0, qty - (stock.get(idOf(item)) ?? 0)) })),
            },
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
                    stocked: id ? stock.get(id) ?? 0 : 0,
                };
            }),
        };
    };

    // Hulls of other players' that this player has been asked to work on.
    const asked = await db('vessel_build_hands as h').join('vessel_builds as b', 'b.id', 'h.build_id')
        .join('players as p', 'p.id', 'b.player_id').join('locations as l', 'l.id', 'b.location_id')
        .where('h.player_id', playerId).select('b.*', 'p.username as owner_name', 'l.name as location_name');
    const hires = (await Promise.all(asked.map(async (b: any) => {
        const t = types.find(x => x.id === Number(b.vessel_type_id));
        if (!t) return null;
        const h = await hull(b, t);
        return {
            ownerId: Number(b.player_id),
            ownerName: b.owner_name,
            key: t.key,
            name: t.name,
            buildLevel: t.build_level,
            canBuild: carpentry >= t.build_level,
            xpPerTurn: buildTurnXp(t.tier),
            piecesPerTurn: Math.round(piecesAverage(BOAT_FLIPS, carpentry, rungOfTier(t.tier)) * 10) / 10,
            hull: { ...h, hire: { rate: h.hire.rate, purse: h.hire.purse, hands: [], laid: [], materials: [] } },
        };
    }))).filter(Boolean);

    return {
        locationName: here?.location_name ?? null,
        hasSlip: !!here?.has_slip,
        carpentryLevel: carpentry,
        hires,
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

/**
 * Start a hull of `typeKey` on the slip where the player stands. Nothing is
 * taken yet. The owner founds the site and needs no Carpentry for it
 * (docs/antura-plan.md §6b): whoever builds needs the level, the owner or a
 * hand they name.
 */
export async function layKeel(playerId: number, typeKeyRaw: unknown): Promise<Ok<{ name: string }> | Refused> {
    try {
        const typeKey = typeof typeKeyRaw === 'string' ? typeKeyRaw : '';
        const t = await vesselType({ key: typeKey });
        if (!t) throw new BoatAbort('There is no such boat.');
        const here = await whereIs(playerId);
        if (!here?.has_slip) throw new BoatAbort('There is no slip here to build on.');
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

// ── Hiring hands (docs/antura-plan.md §6b) ──────────────────────────────────
//
// The owner names who may build on their hull, sets what each piece placed
// pays, and lays gold and materials at the slip. Gold laid there is the
// purse: the owner's ledger is debited as it goes in, a hand's credited as
// they are paid, the owner's again for what comes back. Locks: the owner's
// row, then the build row; a build turn by a hand locks both players first,
// in id order (services/gold.ts), then the build, so the two never cross.

/** The most a piece may pay, so a slip of a finger is not a fortune. */
export { MAX_PAY_RATE };

function wholePositive(raw: unknown): number | null {
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) && n > 0 ? n : null;
}

/** The owner's hull of `typeKey`, locked when asked. */
async function ownHull(x: any, ownerId: number, typeKeyRaw: unknown, lock = false) {
    const typeKey = typeof typeKeyRaw === 'string' ? typeKeyRaw : '';
    const t = await vesselType({ key: typeKey }, x);
    if (!t) throw new BoatAbort('There is no such boat.');
    const q = x('vessel_builds').where({ player_id: ownerId, vessel_type_id: t.id });
    const build = await (lock ? q.forUpdate() : q).first();
    if (!build) throw new BoatAbort(`You have no ${t.name} on a slip.`);
    return { t, build };
}

/** The owner must stand at the slip to lay or take back anything there. */
async function atOwnSlip(x: any, ownerId: number, build: any, name: string) {
    const here = await whereIs(ownerId, x);
    if (Number(build.location_id) !== Number(here?.location_id)) {
        const at = await x('locations').where({ id: build.location_id }).first('name');
        throw new BoatAbort(`Your ${name} is on the slip at ${at?.name ?? 'another port'}.`);
    }
}

export async function nameHand(ownerId: number, typeKeyRaw: unknown, usernameRaw: unknown): Promise<Ok<{ name: string }> | Refused> {
    try {
        const username = typeof usernameRaw === 'string' ? usernameRaw.trim() : '';
        if (!username) throw new BoatAbort('Name the carpenter you want to work on it.');
        const { t, build } = await ownHull(db, ownerId, typeKeyRaw);
        const hand = await db('players').whereRaw('lower(username) = lower(?)', [username]).first('id', 'username');
        if (!hand) throw new BoatAbort(`There is nobody called ${username}.`);
        if (Number(hand.id) === ownerId) throw new BoatAbort(`It is your own ${t.name}: you may always work on it.`);
        await db('vessel_build_hands').insert({ build_id: build.id, player_id: hand.id }).onConflict(['build_id', 'player_id']).ignore();
        return { ok: true, name: hand.username };
    } catch (err) {
        return refuse(err, 'nameHand');
    }
}

export async function dropHand(ownerId: number, typeKeyRaw: unknown, usernameRaw: unknown): Promise<Ok<{}> | Refused> {
    try {
        const username = typeof usernameRaw === 'string' ? usernameRaw.trim() : '';
        const { build } = await ownHull(db, ownerId, typeKeyRaw);
        const hand = await db('players').whereRaw('lower(username) = lower(?)', [username]).first('id');
        if (hand) await db('vessel_build_hands').where({ build_id: build.id, player_id: hand.id }).delete();
        return { ok: true };
    } catch (err) {
        return refuse(err, 'dropHand');
    }
}

export async function setPayRate(ownerId: number, typeKeyRaw: unknown, rateRaw: unknown): Promise<Ok<{ rate: number }> | Refused> {
    try {
        const rate = Math.floor(Number(rateRaw));
        if (!Number.isFinite(rate) || rate < 0) throw new BoatAbort('A piece pays a whole number of gold, or nothing.');
        if (rate > MAX_PAY_RATE) throw new BoatAbort(`A piece can pay at most ${MAX_PAY_RATE.toLocaleString('en-US')} gold.`);
        const { build } = await ownHull(db, ownerId, typeKeyRaw);
        await db('vessel_builds').where({ id: build.id }).update({ pay_rate: rate });
        return { ok: true, rate };
    } catch (err) {
        return refuse(err, 'setPayRate');
    }
}

/** Lay gold in the purse at the slip, from the owner's own. */
export async function layPurse(ownerId: number, typeKeyRaw: unknown, amountRaw: unknown): Promise<Ok<{ fund: number }> | Refused> {
    try {
        const amount = wholePositive(amountRaw);
        if (!amount) throw new BoatAbort('Lay a whole number of gold.');
        return await db.transaction(async (trx) => {
            await trx('players').where({ id: ownerId }).forUpdate().first('id');
            const { t, build } = await ownHull(trx, ownerId, typeKeyRaw, true);
            await atOwnSlip(trx, ownerId, build, t.name);
            const paid = await debitGoldWithin(trx, { playerId: ownerId, amount, reason: 'boat_purse_lay', refType: 'vessel_build', refId: build.id });
            if (!paid.ok) throw new BoatAbort(`You have only ${paid.balance.toLocaleString('en-US')} gold.`);
            const [row] = await trx('vessel_builds').where({ id: build.id }).increment('fund_gold', amount).returning('fund_gold');
            return { ok: true as const, fund: Number(row.fund_gold) };
        });
    } catch (err) {
        return refuse(err, 'layPurse');
    }
}

/** Take gold back out of the purse. */
export async function takePurse(ownerId: number, typeKeyRaw: unknown, amountRaw: unknown): Promise<Ok<{ fund: number }> | Refused> {
    try {
        const amount = wholePositive(amountRaw);
        if (!amount) throw new BoatAbort('Take a whole number of gold.');
        return await db.transaction(async (trx) => {
            await trx('players').where({ id: ownerId }).forUpdate().first('id');
            const { t, build } = await ownHull(trx, ownerId, typeKeyRaw, true);
            await atOwnSlip(trx, ownerId, build, t.name);
            // Conditional and relative (CLAUDE.md §4 rule 1).
            const [row] = await trx('vessel_builds').where({ id: build.id }).where('fund_gold', '>=', amount)
                .decrement('fund_gold', amount).returning('fund_gold');
            if (!row) throw new BoatAbort(`The purse holds only ${Number(build.fund_gold).toLocaleString('en-US')} gold.`);
            await creditGoldWithin(trx, { playerId: ownerId, amount, reason: 'boat_purse_take', refType: 'vessel_build', refId: build.id });
            return { ok: true as const, fund: Number(row.fund_gold) };
        });
    } catch (err) {
        return refuse(err, 'takePurse');
    }
}

/**
 * How many of each material the hull still wants, by name: what is left of
 * the piece under way, and every later piece in full. Laying at the slip is
 * capped by it, less what is laid there already (Nathan, 2026-11-20).
 */
async function stillWanted(x: any, t: VesselType, build: any): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const done = new Map<number, number>((await x('vessel_build_progress').where({ build_id: build.id }))
        .map((r: any) => [Number(r.item_id), Number(r.delivered)]));
    const ids = new Map<string, number>((await x('items').whereIn('name', t.pieces.flatMap(p => p.materials.map(m => m.item))).select('id', 'name'))
        .map((r: any) => [r.name, Number(r.id)]));
    t.pieces.forEach((p, i) => {
        if (i < Number(build.piece_index)) return;
        for (const m of p.materials) {
            const left = i === Number(build.piece_index) ? Math.max(0, m.qty - (done.get(ids.get(m.item) ?? -1) ?? 0)) : m.qty;
            out.set(m.item, (out.get(m.item) ?? 0) + left);
        }
    });
    return out;
}

/** The materials this boat uses anywhere in its build, by name. */
function usesMaterial(t: VesselType, itemName: string): boolean {
    return t.pieces.some(p => p.materials.some(m => m.item === itemName));
}

/** Lay materials from the owner's pack at the slip, for the hands to use. */
export async function layStock(ownerId: number, typeKeyRaw: unknown, itemRaw: unknown, qtyRaw: unknown): Promise<Ok<{ stocked: number }> | Refused> {
    try {
        const qty = wholePositive(qtyRaw);
        const itemName = typeof itemRaw === 'string' ? itemRaw : '';
        if (!qty) throw new BoatAbort('Lay a whole number of them.');
        return await db.transaction(async (trx) => {
            await trx('players').where({ id: ownerId }).forNoKeyUpdate().first('id');
            const { t, build } = await ownHull(trx, ownerId, typeKeyRaw, true);
            await atOwnSlip(trx, ownerId, build, t.name);
            if (!usesMaterial(t, itemName)) throw new BoatAbort(`No ${itemName} goes into ${article(t.name)} ${t.name}.`);
            const item = await trx('items').where({ name: itemName }).first('id');
            if (!item) throw new BoatAbort(`No one in Talaran can make ${itemName} yet.`);
            // Never more than the hull still wants. Read under the build's lock, so two layings at once cannot both fit.
            const wanted = (await stillWanted(trx, t, build)).get(itemName) ?? 0;
            const laid = Number((await trx('vessel_build_stock').where({ build_id: build.id, item_id: item.id }).first('quantity'))?.quantity ?? 0);
            const room = Math.max(0, wanted - laid);
            if (qty > room) {
                throw new BoatAbort(room > 0
                    ? `The ${t.name} needs only ${room.toLocaleString('en-US')} more ${itemName} than is laid here already.`
                    : `Enough ${itemName} is laid here already to finish the ${t.name}.`);
            }
            const taken = await takeItemsWithin(trx, ownerId, [{ name: itemName, quantity: qty }]);
            if (!taken.ok) throw new BoatAbort(`You do not have ${qty.toLocaleString('en-US')} ${itemName}.`);
            const [row] = await trx('vessel_build_stock').insert({ build_id: build.id, item_id: item.id, quantity: qty })
                .onConflict(['build_id', 'item_id']).merge({ quantity: trx.raw('vessel_build_stock.quantity + ?', [qty]) })
                .returning('quantity');
            return { ok: true as const, stocked: Number(row.quantity) };
        });
    } catch (err) {
        return refuse(err, 'layStock');
    }
}

/** Take materials laid at the slip back into the owner's pack, while they are not yet built in. */
export async function takeStock(ownerId: number, typeKeyRaw: unknown, itemRaw: unknown, qtyRaw: unknown): Promise<Ok<{ stocked: number }> | Refused> {
    try {
        const qty = wholePositive(qtyRaw);
        const itemName = typeof itemRaw === 'string' ? itemRaw : '';
        if (!qty) throw new BoatAbort('Take a whole number of them.');
        return await db.transaction(async (trx) => {
            await trx('players').where({ id: ownerId }).forNoKeyUpdate().first('id');
            const { t, build } = await ownHull(trx, ownerId, typeKeyRaw, true);
            await atOwnSlip(trx, ownerId, build, t.name);
            const item = await trx('items').where({ name: itemName }).first('id');
            if (!item) throw new BoatAbort(`There is no ${itemName} at the slip.`);
            const [row] = await trx('vessel_build_stock').where({ build_id: build.id, item_id: item.id }).where('quantity', '>=', qty)
                .decrement('quantity', qty).returning('quantity');
            if (!row) throw new BoatAbort(`There are not ${qty.toLocaleString('en-US')} ${itemName} at the slip.`);
            await addItemToInventoryWithin(trx, ownerId, item.id, qty);
            return { ok: true as const, stocked: Number(row.quantity) };
        });
    } catch (err) {
        return refuse(err, 'takeStock');
    }
}

// ── Building ────────────────────────────────────────────────────────────────

/** The action's data: which boat, which material, and whose hull (the builder's own when absent). */
function parseData(data: unknown): { typeKey: string; itemName: string; ownerId: number | null } | null {
    if (typeof data !== 'string') return null;
    const [typeKey, itemName, owner] = data.split('|');
    if (!typeKey || !itemName) return null;
    const ownerId = owner ? Math.floor(Number(owner)) : null;
    return { typeKey, itemName, ownerId: ownerId && Number.isFinite(ownerId) && ownerId > 0 ? ownerId : null };
}

/**
 * Re-checked at the start and on every turn: what one more turn of `itemName`
 * on `ownerId`'s hull needs from `builderId`. The builder is the owner or a
 * hand the owner named, stands at the slip, has the Carpentry for the boat,
 * and holds a mallet and saw.
 */
async function buildCheck(builderId: number, ownerId: number, typeKey: string, itemName: string, x: any = db, lock = false) {
    const t = await vesselType({ key: typeKey }, x);
    if (!t) throw new BoatAbort('There is no such boat.');
    const own = builderId === ownerId;
    const q = x('vessel_builds').where({ player_id: ownerId, vessel_type_id: t.id });
    const build = await (lock ? q.forUpdate() : q).first();
    const ownerName = own ? null : (await x('players').where({ id: ownerId }).first('username'))?.username ?? 'its owner';
    const whose = own ? `Your ${t.name}` : `${ownerName}'s ${t.name}`;
    if (!build) throw new BoatAbort(own ? `You have no ${t.name} on a slip.` : `${ownerName} has no ${t.name} on a slip.`);
    if (!own && !(await x('vessel_build_hands').where({ build_id: build.id, player_id: builderId }).first())) {
        throw new BoatAbort(`${ownerName} has not asked you to work on their ${t.name}.`);
    }
    const here = await whereIs(builderId, x);
    if (Number(build.location_id) !== Number(here?.location_id)) {
        const at = await x('locations').where({ id: build.location_id }).first('name');
        throw new BoatAbort(`${whose} is on the slip at ${at?.name ?? 'another port'}.`);
    }
    if ((await carpentryLevel(builderId, x)) < t.build_level) {
        throw new BoatAbort(`You need Carpentry ${t.build_level} to work on ${article(t.name)} ${t.name}.`);
    }
    const piece = t.pieces[build.piece_index];
    if (!piece) throw new BoatAbort(`${whose} has every piece it needs.`);
    const need = piece.materials.find(m => m.item === itemName);
    if (!need) throw new BoatAbort(`No ${itemName} goes into the ${piece.name.toLowerCase()}.`);
    const item = await x('items').where({ name: itemName }).first('id', 'name');
    if (!item) throw new BoatAbort(`No one in Talaran can make ${itemName} yet.`);
    const tool = await missingBuildTool(builderId, x);
    if (tool) throw new BoatAbort(tool.message);
    const rate = own ? 0 : Number(build.pay_rate);
    if (rate > 0 && Number(build.fund_gold) < rate) throw new BoatAbort(`The purse at ${ownerName}'s slip is empty.`);
    return { t, build, piece, need, item, here, own, ownerName, rate };
}

/** How many of a material are laid at the slip for a hull. */
async function stockOf(x: any, buildId: number, itemId: number): Promise<number> {
    const row = await x('vessel_build_stock').where({ build_id: buildId, item_id: itemId }).first('quantity');
    return Number(row?.quantity ?? 0);
}

export async function startBoatBuild(playerId: number, typeKeyRaw: unknown, itemNameRaw: unknown, ownerRaw?: unknown): Promise<Ok<{ timerSeconds: number }> | Refused> {
    try {
        const typeKey = typeof typeKeyRaw === 'string' ? typeKeyRaw : '';
        const itemName = typeof itemNameRaw === 'string' ? itemNameRaw : '';
        const asked = ownerRaw === undefined || ownerRaw === null || ownerRaw === '' ? null : Math.floor(Number(ownerRaw));
        const ownerId = asked && Number.isFinite(asked) && asked > 0 ? asked : playerId;
        const { build, need, item, here } = await buildCheck(playerId, ownerId, typeKey, itemName);
        const progress = await db('vessel_build_progress').where({ build_id: build.id, item_id: item.id }).first();
        if (Number(progress?.delivered ?? 0) >= need.qty) throw new BoatAbort(`This piece has all the ${itemName} it needs.`);
        const held = await db('player_inventory').where({ player_id: playerId, item_id: item.id }).first();
        if (Number(held?.quantity ?? 0) + await stockOf(db, build.id, item.id) < 1) {
            throw new BoatAbort(`You have no ${itemName}, and there is none laid at the slip.`);
        }
        if (await db('player_actions').where({ player_id: playerId }).first()) {
            throw new BoatAbort('You are already performing an action', 409);
        }
        const now = new Date();
        await db('player_actions').insert({
            player_id: playerId,
            action_type: 'vessel_build',
            action_data: ownerId === playerId ? `${typeKey}|${itemName}` : `${typeKey}|${itemName}|${ownerId}`,
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
    /** Go on: more of this material is wanted and the builder can still place some. */
    carryOn?: boolean
}

const plural = (n: number, word: string) => `${n.toLocaleString('en-US')} ${word}`;

/** One turn on the hull, for the tick: 1 to 5 of the material set in. Every precondition is re-checked. */
export async function resolveBoatBuildCycle(playerId: number, data: unknown): Promise<BoatBuildResult> {
    try {
        const parsed = parseData(data);
        if (!parsed) return { success: false, error: 'Your building stopped.' };
        const ownerId = parsed.ownerId ?? playerId;
        const carpentry = await carpentryLevel(playerId);
        const outcome = await db.transaction(async (trx) => {
            // A hand's turn may pay them and, on the last piece, hand the
            // owner what is left: both players first, in id order, then the build.
            if (ownerId === playerId) await trx('players').where({ id: playerId }).forNoKeyUpdate().first();
            else await lockPlayersInOrder(trx, [playerId, ownerId]);
            const { t, build, piece, need, item, own, ownerName, rate } = await buildCheck(playerId, ownerId, parsed.typeKey, parsed.itemName, trx, true);

            await trx('vessel_build_progress').insert({ build_id: build.id, item_id: item.id, delivered: 0 })
                .onConflict(['build_id', 'item_id']).ignore();
            const progress = await trx('vessel_build_progress').where({ build_id: build.id, item_id: item.id }).forUpdate().first();
            if (Number(progress.delivered) >= need.qty) throw new BoatAbort(`This piece has all the ${item.name} it needs.`);

            const stocked = await stockOf(trx, build.id, item.id);
            const fund = Number(build.fund_gold);
            const pieces = await takeBuildPiecesWithin(trx, {
                playerId, item, wanted: need.qty, delivered: Number(progress.delivered), flips: BOAT_FLIPS, carpentry, tier: t.tier,
                stock: {
                    held: stocked,
                    take: async (n) => (await trx('vessel_build_stock').where({ build_id: build.id, item_id: item.id })
                        .where('quantity', '>=', n).decrement('quantity', n)) === 1,
                },
                // A hand is paid for every piece they place, so they place no more than the purse pays for.
                cap: rate > 0 ? Math.floor(fund / rate) : undefined,
            });
            if (pieces < 1) throw new BoatAbort(`You have no ${item.name} left, and there is none laid at the slip.`);
            const delivered = Number(progress.delivered) + pieces;
            await trx('vessel_build_progress').where({ build_id: build.id, item_id: item.id }).increment('delivered', pieces);

            // The wage, from the purse, now (docs/antura-plan.md §6b).
            const wage = rate * pieces;
            const left = await payWageWithin(trx, { table: 'vessel_builds', siteId: build.id, fund, wage, playerId, reason: 'boat_wage' });
            if (left === null) throw new BoatAbort(`The purse at ${ownerName}'s slip is empty.`);
            const fundLeft = left;

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
                    // The last piece: the hull leaves the slip as the owner's
                    // boat, and what is left at the slip goes back to the owner.
                    const left = await trx('vessel_build_stock').where({ build_id: build.id }).where('quantity', '>', 0).select('item_id', 'quantity');
                    const moved = await trx('vessel_builds').where({ id: build.id, piece_index: build.piece_index }).delete();
                    if (moved !== 1) throw new BoatAbort('The hull changed while you worked. Look again.');
                    for (const s of left) await addItemToInventoryWithin(trx, ownerId, s.item_id, Number(s.quantity));
                    if (fundLeft > 0) {
                        await creditGoldWithin(trx, { playerId: ownerId, amount: fundLeft, reason: 'boat_purse_return', refType: 'vessel_build', refId: build.id });
                    }
                    await trx('player_vessels').insert({ player_id: ownerId, vessel_type_id: t.id });
                    finished = true;
                    carryOn = false;
                } else {
                    const moved = await trx('vessel_builds').where({ id: build.id, piece_index: build.piece_index }).update({ piece_index: nextIndex });
                    if (moved !== 1) throw new BoatAbort('The hull changed while you worked. Look again.');
                    // Carry on into the next piece if it wants the same material.
                    carryOn = t.pieces[nextIndex].materials.some(m => m.item === item.name);
                }
            }
            let purseEmpty = false;
            if (carryOn) {
                const more = await trx('player_inventory').where({ player_id: playerId, item_id: item.id }).first('quantity');
                carryOn = Number(more?.quantity ?? 0) + await stockOf(trx, build.id, item.id) > 0;
                // Told before the next turn, not after it (docs/antura-plan.md §6b).
                if (carryOn && rate > 0 && fundLeft < rate) { carryOn = false; purseEmpty = true; }
            }

            const into = own ? `the ${piece.name.toLowerCase()}` : `the ${piece.name.toLowerCase()} of ${ownerName}'s ${t.name}`;
            const paidLine = wage > 0 ? ` ${ownerName} pays you ${plural(wage, 'gold')}.` : '';
            const message = (finished
                ? own
                    ? `The last of the ${piece.name.toLowerCase()} goes in. Your ${t.name} is finished, and it is yours to sail.`
                    : `The last of the ${piece.name.toLowerCase()} goes in. ${ownerName}'s ${t.name} is finished.`
                : pieceDone
                    ? `${plural(pieces, item.name)} set in. That finishes ${into}; next comes the ${t.pieces[Number(build.piece_index) + 1].name.toLowerCase()}.`
                    : `${plural(pieces, item.name)} set into ${into}: ${delivered.toLocaleString('en-US')} of ${need.qty.toLocaleString('en-US')}.`)
                + paidLine
                + (purseEmpty ? ` The purse at the slip cannot pay for another piece, so you stop.` : '');
            return { xp, carryOn, message, finished, name: t.name, own };
        });
        if (outcome.finished) {
            logger.info(`player ${playerId} finished a ${outcome.name}${outcome.own ? '' : ` for player ${ownerId}`}`);
            if (!outcome.own) pushToPlayer(ownerId, 'boats_changed', { finished: outcome.name });
        }
        return { success: true, xpAwarded: outcome.xp, skillName: 'Carpentry', message: outcome.message, carryOn: outcome.carryOn };
    } catch (err) {
        if (err instanceof BoatAbort) return { success: false, error: err.message };
        logger.error(`boats build cycle (player ${playerId}): ${err}`);
        return { success: false, error: SERVER_ERROR };
    }
}
