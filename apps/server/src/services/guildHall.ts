import db from '../db';
import { logger } from '../lib/logger';
import { pushToPlayer, pushToRoom } from '../lib/realtime';
import { rungOfTier } from '../lib/tiers';
import { SERVER_ERROR } from '../lib/serviceResult';
import { addItemToInventoryWithin, takeItemsWithin } from './inventory';
import { creditGoldWithin, debitGoldWithin } from './gold';
import { missingBuildTool } from './construction';
import { activeXpForSeconds } from './farming';
import { awardXp } from './xp';
import { membershipOf } from './guildRanks';
import { noteDeed } from './chronicle';

// ── Guild halls (migration 20261102170000; Nathan, 2026-11-02) ───────────────
//
// One hall per guild per island, at a location the guild chooses (the
// leader lays the foundations where they stand). Members raise it together,
// one material at a time, with a repeating 20-second action ('guild_build',
// resolved by the tick) that pays Carpentry at the band of the tier being
// built and needs the usual mallet and saw (services/construction.ts). A
// finished tier opens or enlarges the storehouse.
//
// The storehouse counts its room in ITEMS: 300 Granite and 7 Ambren Ore take
// 307. Any member may put in; taking out is a rank permission
// (withdraw_items, withdraw_gold; services/guildRanks.ts). It also holds gold,
// without limit. Every movement is written to guild_storage_ledger.
//
// Presence is enforced here, not in the route: every hall action needs the
// player standing at their guild's hall on that island.
//
// Locks, always in this order: the player row, then the hall row, then any
// storage or progress row. Writes are relative and conditional; a refusal
// after a write throws HallAbort so the transaction rolls back (CLAUDE.md §4).

export const BUILD_SECONDS = 20;

class HallAbort extends Error {
    constructor(message: string, public status = 400) { super(message); }
}

type Ok<T> = { ok: true } & T;
type Refused = { ok: false; error: string; status: number };

function refuse(err: unknown, context: string): Refused {
    if (err instanceof HallAbort) return { ok: false, error: err.message, status: err.status };
    if ((err as { code?: string })?.code === '23505') return { ok: false, error: 'You are already performing an action', status: 409 };
    logger.error(`guildHall ${context}: ${err}`);
    return { ok: false, error: SERVER_ERROR, status: 500 };
}

interface Requirement { item: string; qty: number }

async function tierRow(tier: number, x: any = db): Promise<{ tier: number; capacity: number; requirements: Requirement[] } | null> {
    const row = await x('guild_hall_tiers').where({ tier }).first();
    if (!row) return null;
    const reqs = typeof row.requirements === 'string' ? JSON.parse(row.requirements) : row.requirements;
    return { tier: row.tier, capacity: Number(row.capacity), requirements: Array.isArray(reqs) ? reqs : [] };
}

/** How much the storehouse holds at a finished tier (0 before the first). */
async function capacityAt(tier: number, x: any = db): Promise<number> {
    if (tier < 1) return 0;
    return (await tierRow(tier, x))?.capacity ?? 0;
}

/** Room taken: what is on the shelves plus what is set aside for approved requests. */
async function usedRoom(hallId: number, x: any = db): Promise<number> {
    const [{ n }] = await x('guild_storage').where({ hall_id: hallId }).sum('quantity as n');
    const [{ m }] = await x('guild_storage_requests').where({ hall_id: hallId, status: 'approved' }).sum('quantity as m');
    return Number(n ?? 0) + Number(m ?? 0);
}

/** Where the player stands, and the island it is on. */
async function whereIs(playerId: number, x: any = db) {
    return x('players as p').join('locations as l', 'l.id', 'p.current_location_id')
        .where('p.id', playerId).first('p.username', 'p.current_location_id as location_id', 'l.name as location_name', 'l.region as island');
}

/**
 * The player's guild, and their guild's hall here: on this island, and they
 * must be standing at it. Refuses with a sentence otherwise.
 */
async function hallHere(playerId: number, x: any = db, lockHall = false) {
    const me = await membershipOf(playerId, x);
    if (!me) throw new HallAbort('You are not in a guild.', 403);
    const here = await whereIs(playerId, x);
    if (!here) throw new HallAbort('You are nowhere at all.');
    const q = x('guild_halls').where({ guild_id: me.guildId, island: here.island });
    const hall = await (lockHall ? q.forUpdate() : q).first();
    if (!hall) throw new HallAbort('Your guild has no hall on this island.');
    if (Number(hall.location_id) !== Number(here.location_id)) {
        const at = await x('locations').where({ id: hall.location_id }).first('name');
        throw new HallAbort(`Your guild's hall on this island is at ${at?.name ?? 'another place'}.`);
    }
    return { me, here, hall };
}

/** Tell every member's open hall view to refresh (GuildHallPanel listens). */
export function announce(guildId: number) {
    pushToRoom(`guild_${guildId}`, 'guild_hall_changed', {});
}

// ── Reading ─────────────────────────────────────────────────────────────────

export async function hallState(playerId: number) {
    const me = await membershipOf(playerId);
    if (!me) return { inGuild: false as const };
    const here = await whereIs(playerId);
    const halls = await db('guild_halls as h').join('locations as l', 'l.id', 'h.location_id')
        .where('h.guild_id', me.guildId).orderBy('h.island')
        .select('h.id', 'h.island', 'h.tier', 'h.location_id', 'l.name as location_name');
    const onIsland = halls.find((h: any) => h.island === here?.island) ?? null;
    const atHall = !!onIsland && Number(onIsland.location_id) === Number(here?.location_id);

    const base = {
        inGuild: true as const,
        guildName: me.guild.name,
        island: here?.island ?? null,
        locationName: here?.location_name ?? null,
        halls: halls.map((h: any) => ({ island: h.island, locationName: h.location_name, tier: h.tier })),
        hallOnIsland: onIsland ? { locationName: onIsland.location_name, tier: onIsland.tier } : null,
        atHall,
        canFound: me.isLeader && !onIsland,
        canWithdrawItems: me.can('withdraw_items'),
        canWithdrawGold: me.can('withdraw_gold'),
        canApprove: me.can('approve_requests'),
        isLeader: me.isLeader,
        // Open requests: every one for an approver, only their own for anyone else.
        // Shown wherever the player is, so an officer can answer from afar.
        requests: onIsland ? await openRequests(onIsland.id, me.can('approve_requests') ? null : playerId) : [],
    };
    if (!atHall || !onIsland) return base;

    const hall = await db('guild_halls').where({ id: onIsland.id }).first();
    const nextTier = await tierRow(hall.tier + 1);
    const delivered = new Map<number, number>((await db('guild_hall_progress').where({ hall_id: hall.id }))
        .map((r: any) => [r.item_id, Number(r.delivered)]));
    const reqNames = nextTier?.requirements.map(r => r.item) ?? [];
    const reqItems = reqNames.length ? await db('items').whereIn('name', reqNames).select('id', 'name') : [];
    const idByName = new Map<string, number>(reqItems.map((i: any) => [i.name, i.id]));
    const held = idByName.size
        ? new Map<number, number>((await db('player_inventory').where({ player_id: playerId }).whereIn('item_id', [...idByName.values()]))
            .map((r: any) => [r.item_id, Number(r.quantity)]))
        : new Map<number, number>();

    const storage = await db('guild_storage as s').join('items as i', 'i.id', 's.item_id')
        .where('s.hall_id', hall.id).where('s.quantity', '>', 0)
        .orderBy('i.name')
        .select('i.id as item_id', 'i.name', 'i.type', 'i.subtype', 'i.tier', 'i.quality', 'i.description', 's.quantity');
    const ledger = await db('guild_storage_ledger as g').leftJoin('items as i', 'i.id', 'g.item_id')
        .where('g.hall_id', hall.id).orderBy('g.id', 'desc').limit(100)
        .select('g.player_name', 'i.name as item_name', 'g.delta', 'g.created_at', 'g.approved_by_name');
    const builders = await db('guild_hall_contributions as c').join('players as p', 'p.id', 'c.player_id')
        .where('c.hall_id', hall.id).groupBy('p.username').sum('c.quantity as given')
        .select('p.username').orderBy('given', 'desc').limit(20);

    return {
        ...base,
        hall: {
            tier: hall.tier,
            maxTier: Number((await db('guild_hall_tiers').max('tier as t').first())?.t ?? 0),
            gold: Number(hall.gold),
            capacity: await capacityAt(hall.tier),
            used: await usedRoom(hall.id),
            building: nextTier ? {
                tier: nextTier.tier,
                capacityAfter: nextTier.capacity,
                xpPerPiece: activeXpForSeconds(rungOfTier(nextTier.tier), BUILD_SECONDS),
                requirements: nextTier.requirements.map(r => {
                    const id = idByName.get(r.item);
                    return {
                        item: r.item,
                        needed: r.qty,
                        delivered: id ? delivered.get(id) ?? 0 : 0,
                        // A material the world cannot make yet: the tier waits for it.
                        exists: !!id,
                        held: id ? held.get(id) ?? 0 : 0,
                    };
                }),
            } : null,
            storage: storage.map((r: any) => ({ ...r, quantity: Number(r.quantity) })),
            ledger: ledger.map((r: any) => ({ player: r.player_name, item: r.item_name ?? null, delta: Number(r.delta), at: r.created_at, approvedBy: r.approved_by_name ?? null })),
            builders: builders.map((b: any) => ({ name: b.username, given: Number(b.given) })),
        },
    };
}

// ── Founding and abandoning ─────────────────────────────────────────────────

/** Lay a hall's foundations where the leader stands. One per island. */
export async function foundHall(playerId: number): Promise<Ok<{ locationName: string }> | Refused> {
    try {
        const me = await membershipOf(playerId);
        if (!me) throw new HallAbort('You are not in a guild.', 403);
        if (!me.isLeader) throw new HallAbort('Only the leader decides where the hall stands.', 403);
        const here = await whereIs(playerId);
        if (!here?.island) throw new HallAbort('There is nowhere to build here.');
        const inserted = await db('guild_halls')
            .insert({ guild_id: me.guildId, island: here.island, location_id: here.location_id, founded_by: playerId })
            .onConflict(['guild_id', 'island']).ignore().returning('id');
        if (!inserted.length) throw new HallAbort('Your guild already has a hall on this island.');
        announce(me.guildId);
        logger.info(`guild ${me.guildId} founded a hall at ${here.location_name} (${here.island})`);
        return { ok: true, locationName: here.location_name };
    } catch (err) {
        return refuse(err, 'found');
    }
}

/**
 * Pull the hall down, so it can be raised somewhere else from nothing. The
 * storehouse must be empty first, items and gold: nothing is ever destroyed.
 */
export async function abandonHall(playerId: number): Promise<Ok<{}> | Refused> {
    try {
        let guildId = 0;
        await db.transaction(async (trx) => {
            const { me, hall } = await hallHere(playerId, trx, true);
            if (!me.isLeader) throw new HallAbort('Only the leader can pull the hall down.', 403);
            if (Number(hall.gold) > 0 || (await usedRoom(hall.id, trx)) > 0) {
                throw new HallAbort('Empty the storehouse first, gold and all. Nothing in it is thrown away.');
            }
            await trx('guild_halls').where({ id: hall.id }).delete();
            guildId = me.guildId;
        });
        announce(guildId);
        return { ok: true };
    } catch (err) {
        return refuse(err, 'abandon');
    }
}

// ── Building ────────────────────────────────────────────────────────────────

/** Re-checked at the start and on every cycle: what one more piece of `itemName` needs. */
async function buildCheck(playerId: number, itemName: string, x: any = db) {
    const { me, here, hall } = await hallHere(playerId, x);
    const next = await tierRow(hall.tier + 1, x);
    if (!next) throw new HallAbort('The hall stands as high as it can be built.');
    const req = next.requirements.find(r => r.item === itemName);
    if (!req) throw new HallAbort(`This tier of the hall does not use ${itemName}.`);
    const item = await x('items').where({ name: itemName }).first('id', 'name');
    if (!item) throw new HallAbort(`No one in Talaran can make ${itemName} yet.`);
    const tool = await missingBuildTool(playerId, x);
    if (tool) throw new HallAbort(tool.message);
    return { me, here, hall, next, req, item };
}

export async function startBuild(playerId: number, itemNameRaw: unknown): Promise<Ok<{ timerSeconds: number }> | Refused> {
    try {
        const itemName = typeof itemNameRaw === 'string' ? itemNameRaw : '';
        const { here, hall, req, item } = await buildCheck(playerId, itemName);
        const progress = await db('guild_hall_progress').where({ hall_id: hall.id, item_id: item.id }).first();
        if (Number(progress?.delivered ?? 0) >= req.qty) throw new HallAbort(`The hall has all the ${itemName} this tier needs.`);
        const held = await db('player_inventory').where({ player_id: playerId, item_id: item.id }).first();
        if (!held || Number(held.quantity) < 1) throw new HallAbort(`You have no ${itemName} to give.`);
        if (await db('player_actions').where({ player_id: playerId }).first()) {
            throw new HallAbort('You are already performing an action', 409);
        }
        const now = new Date();
        await db('player_actions').insert({
            player_id: playerId,
            action_type: 'guild_build',
            action_data: itemName,
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
        return refuse(err, 'startBuild');
    }
}

export interface BuildCycleResult {
    success: boolean
    error?: string
    xpAwarded?: number
    skillName?: string
    message?: string
    /** Go on: more of this material is wanted and the player has some. */
    carryOn?: boolean
}

/** One piece set into the hall, for the tick. Every precondition is re-checked. */
export async function resolveBuildCycle(playerId: number, itemName: string): Promise<BuildCycleResult> {
    try {
        let guildId = 0;
        const outcome = await db.transaction(async (trx) => {
            await trx('players').where({ id: playerId }).forNoKeyUpdate().first();
            const { me, hall: unlocked, next, req, item } = await buildCheck(playerId, itemName, trx);
            guildId = me.guildId;
            const hall = await trx('guild_halls').where({ id: unlocked.id }).forUpdate().first();
            if (!hall || hall.tier !== unlocked.tier) throw new HallAbort('The hall changed while you worked. Look again.');

            await trx('guild_hall_progress').insert({ hall_id: hall.id, item_id: item.id, delivered: 0 })
                .onConflict(['hall_id', 'item_id']).ignore();
            const progress = await trx('guild_hall_progress').where({ hall_id: hall.id, item_id: item.id }).forUpdate().first();
            if (Number(progress.delivered) >= req.qty) throw new HallAbort(`The hall has all the ${itemName} this tier needs.`);

            const taken = await takeItemsWithin(trx, playerId, [{ name: item.name, quantity: 1 }]);
            if (!taken.ok) throw new HallAbort(`You have no ${itemName} left to give.`);

            const delivered = Number(progress.delivered) + 1;
            await trx('guild_hall_progress').where({ hall_id: hall.id, item_id: item.id }).increment('delivered', 1);
            await trx('guild_hall_contributions').insert({ hall_id: hall.id, player_id: playerId, item_id: item.id, quantity: 1 })
                .onConflict(['hall_id', 'player_id', 'item_id']).merge({ quantity: trx.raw('guild_hall_contributions.quantity + 1') });

            const xp = activeXpForSeconds(rungOfTier(next.tier), BUILD_SECONDS);
            await awardXp(playerId, 'Carpentry', xp, trx);

            // Is the whole tier in? Every requirement, this one counted.
            const ids = await trx('items').whereIn('name', next.requirements.map(r => r.item)).select('id', 'name');
            const doneByName = new Map<string, number>();
            for (const row of await trx('guild_hall_progress').where({ hall_id: hall.id })) {
                const name = ids.find((i: any) => i.id === row.item_id)?.name;
                if (name) doneByName.set(name, Number(row.delivered));
            }
            const finished = ids.length === next.requirements.length
                && next.requirements.every(r => (doneByName.get(r.item) ?? 0) >= r.qty);
            if (finished) {
                await trx('guild_halls').where({ id: hall.id, tier: hall.tier }).update({ tier: next.tier, updated_at: trx.fn.now() });
                await trx('guild_hall_progress').where({ hall_id: hall.id }).delete();
                // The Chronicle: the guild's deed, and the hand that set the last piece.
                const place = await trx('locations').where({ id: hall.location_id }).first('name');
                noteDeed(trx, {
                    // The guild's deed: written even if the hand that finished it
                    // has opted out; the page leaves an opted-out name unsaid.
                    kind: 'guild_hall_tier', guildId: me.guildId,
                    data: { tier: next.tier, place: place?.name ?? null, island: hall.island, byPlayerId: playerId },
                });
            }

            const more = await trx('player_inventory').where({ player_id: playerId, item_id: item.id }).first('quantity');
            return {
                xp,
                finished,
                tier: next.tier,
                carryOn: !finished && delivered < req.qty && Number(more?.quantity ?? 0) > 0,
                message: finished
                    ? (next.tier === 1
                        ? 'The last piece goes in. The hall stands, and its storehouse is open.'
                        : `The last piece goes in. The hall's tier ${next.tier} is finished, and the storehouse grows.`)
                    : `${item.name}: ${delivered.toLocaleString()} of ${req.qty.toLocaleString()} set into the hall.`,
            };
        });
        announce(guildId);
        return { success: true, xpAwarded: outcome.xp, skillName: 'Carpentry', message: outcome.message, carryOn: outcome.carryOn };
    } catch (err) {
        if (err instanceof HallAbort) return { success: false, error: err.message };
        logger.error(`guildHall build cycle (player ${playerId}): ${err}`);
        return { success: false, error: SERVER_ERROR };
    }
}

// ── The storehouse ──────────────────────────────────────────────────────────

/** Whole, positive, finite, or null (CLAUDE.md §4 rule 9). */
function count(raw: unknown): number | null {
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) && n > 0 ? n : null;
}

/** One storehouse ledger row (gold when itemId is null). Exported for the Chronicle's ballads, paid from the storehouse. */
export async function ledger(trx: any, hallId: number, playerId: number, playerName: string, itemId: number | null, delta: number) {
    await trx('guild_storage_ledger').insert({ hall_id: hallId, player_id: playerId, player_name: playerName, item_id: itemId, delta });
}

/** Put items from the pack into the storehouse, as many as there is room for. */
export async function depositItems(playerId: number, itemIdRaw: unknown, qtyRaw: unknown): Promise<Ok<{ moved: number }> | Refused> {
    try {
        const itemId = count(itemIdRaw), want = count(qtyRaw);
        if (!itemId || !want) throw new HallAbort('Choose something to put in, and how many.');
        let guildId = 0;
        const moved = await db.transaction(async (trx) => {
            await trx('players').where({ id: playerId }).forNoKeyUpdate().first();
            const { me, here, hall } = await hallHere(playerId, trx, true);
            guildId = me.guildId;
            const capacity = await capacityAt(hall.tier, trx);
            if (capacity < 1) throw new HallAbort('The storehouse is not built yet. The hall\'s first tier opens it.');
            const room = capacity - (await usedRoom(hall.id, trx));
            const item = await trx('items').where({ id: itemId }).first('id', 'name');
            if (!item) throw new HallAbort('No such item.');
            const stack = await trx('player_inventory').where({ player_id: playerId, item_id: itemId }).forUpdate().first();
            const take = Math.min(want, Number(stack?.quantity ?? 0), room);
            if (room < 1) throw new HallAbort('The storehouse is full.');
            if (take < 1) throw new HallAbort(`You have no ${item.name}.`);
            const taken = await takeItemsWithin(trx, playerId, [{ name: item.name, quantity: take }]);
            if (!taken.ok) throw new HallAbort(taken.error);
            await trx('guild_storage').insert({ hall_id: hall.id, item_id: itemId, quantity: take })
                .onConflict(['hall_id', 'item_id']).merge({ quantity: trx.raw('guild_storage.quantity + ?', [take]) });
            await ledger(trx, hall.id, playerId, here.username, itemId, take);
            return take;
        });
        announce(guildId);
        return { ok: true, moved };
    } catch (err) {
        return refuse(err, 'deposit');
    }
}

/** Take items out of the storehouse into the pack. Needs withdraw_items. */
export async function withdrawItems(playerId: number, itemIdRaw: unknown, qtyRaw: unknown): Promise<Ok<{ moved: number }> | Refused> {
    try {
        const itemId = count(itemIdRaw), want = count(qtyRaw);
        if (!itemId || !want) throw new HallAbort('Choose something to take out, and how many.');
        let guildId = 0;
        const moved = await db.transaction(async (trx) => {
            await trx('players').where({ id: playerId }).forNoKeyUpdate().first();
            const { me, here, hall } = await hallHere(playerId, trx, true);
            guildId = me.guildId;
            if (!me.can('withdraw_items')) throw new HallAbort('Your rank cannot take items from the storehouse.', 403);
            const row = await trx('guild_storage').where({ hall_id: hall.id, item_id: itemId }).forUpdate().first();
            const take = Math.min(want, Number(row?.quantity ?? 0));
            if (take < 1) throw new HallAbort('The storehouse has none of that.');
            if (take === Number(row.quantity)) await trx('guild_storage').where({ hall_id: hall.id, item_id: itemId }).delete();
            else await trx('guild_storage').where({ hall_id: hall.id, item_id: itemId }).decrement('quantity', take);
            await addItemToInventoryWithin(trx, playerId, itemId, take);
            await ledger(trx, hall.id, playerId, here.username, itemId, -take);
            return take;
        });
        announce(guildId);
        return { ok: true, moved };
    } catch (err) {
        return refuse(err, 'withdraw');
    }
}

/** Gold from the purse into the storehouse. Any member. */
export async function depositGold(playerId: number, amountRaw: unknown): Promise<Ok<{ gold: number }> | Refused> {
    try {
        const amount = count(amountRaw);
        if (!amount) throw new HallAbort('How much gold?');
        let guildId = 0;
        const gold = await db.transaction(async (trx) => {
            // The player row first (debitGoldWithin locks it), then the hall.
            await trx('players').where({ id: playerId }).forUpdate().first();
            const { me, here, hall } = await hallHere(playerId, trx, true);
            guildId = me.guildId;
            if (hall.tier < 1) throw new HallAbort('The storehouse is not built yet. The hall\'s first tier opens it.');
            const paid = await debitGoldWithin(trx, { playerId, amount, reason: 'guild_deposit', refType: 'guild_hall', refId: hall.id });
            if (!paid.ok) throw new HallAbort('You do not have that much gold.');
            const [row] = await trx('guild_halls').where({ id: hall.id })
                .update({ gold: trx.raw('gold + ?', [amount]), updated_at: trx.fn.now() }).returning('gold');
            await ledger(trx, hall.id, playerId, here.username, null, amount);
            return Number(row.gold);
        });
        announce(guildId);
        return { ok: true, gold };
    } catch (err) {
        return refuse(err, 'depositGold');
    }
}

/** Gold from the storehouse into the purse. Needs withdraw_gold. */
export async function withdrawGold(playerId: number, amountRaw: unknown): Promise<Ok<{ gold: number }> | Refused> {
    try {
        const amount = count(amountRaw);
        if (!amount) throw new HallAbort('How much gold?');
        let guildId = 0;
        const gold = await db.transaction(async (trx) => {
            await trx('players').where({ id: playerId }).forUpdate().first();
            const { me, here, hall } = await hallHere(playerId, trx, true);
            guildId = me.guildId;
            if (!me.can('withdraw_gold')) throw new HallAbort('Your rank cannot take gold from the storehouse.', 403);
            // Conditional and relative: never below zero, never a lost update.
            const [row] = await trx('guild_halls').where({ id: hall.id }).where('gold', '>=', amount)
                .update({ gold: trx.raw('gold - ?', [amount]), updated_at: trx.fn.now() }).returning('gold');
            if (!row) throw new HallAbort('The storehouse does not hold that much gold.');
            await creditGoldWithin(trx, { playerId, amount, reason: 'guild_withdraw', refType: 'guild_hall', refId: hall.id });
            await ledger(trx, hall.id, playerId, here.username, null, -amount);
            return Number(row.gold);
        });
        announce(guildId);
        return { ok: true, gold };
    } catch (err) {
        return refuse(err, 'withdrawGold');
    }
}

/** True while any of the guild's storehouses holds anything (disbanding waits for this). */
export async function guildStorehousesHoldAnything(guildId: number): Promise<boolean> {
    const halls = await db('guild_halls').where({ guild_id: guildId }).select('id', 'gold');
    if (halls.some((h: any) => Number(h.gold) > 0)) return true;
    if (!halls.length) return false;
    for (const h of halls) if ((await usedRoom(h.id)) > 0) return true;
    return false;
}

// ── Requests ────────────────────────────────────────────────────────────────
//
// For members whose rank cannot take from the storehouse. pending -> approved
// (the items are taken off the shelves and held in the request) -> collected
// at the hall; or denied, or cancelled. Every step is a conditional update on
// the request's status, so two approvals, or a collect and a cancel, cannot
// both happen.

const OPEN_REQUESTS_PER_PLAYER = 10;

async function openRequests(hallId: number, onlyPlayerId: number | null) {
    const q = db('guild_storage_requests as r').join('items as i', 'i.id', 'r.item_id')
        .where('r.hall_id', hallId).whereIn('r.status', ['pending', 'approved'])
        .orderBy('r.id')
        .select('r.id', 'r.player_id', 'r.player_name', 'i.name as item', 'r.item_id', 'r.quantity', 'r.status', 'r.decided_by_name', 'r.created_at');
    if (onlyPlayerId !== null) q.where('r.player_id', onlyPlayerId);
    return (await q).map((r: any) => ({
        id: r.id, playerId: r.player_id, player: r.player_name, item: r.item, itemId: r.item_id,
        quantity: Number(r.quantity), status: r.status, approvedBy: r.decided_by_name, at: r.created_at,
    }));
}

/** The request, locked, with the hall it belongs to; refuses unless it is the acting player's guild's. */
async function lockedRequest(trx: any, requestId: number, guildId: number) {
    const req = await trx('guild_storage_requests').where({ id: requestId }).forUpdate().first();
    if (!req) throw new HallAbort('No such request.', 404);
    const hall = await trx('guild_halls').where({ id: req.hall_id }).first();
    if (!hall || hall.guild_id !== guildId) throw new HallAbort('No such request.', 404);
    return { req, hall };
}

/** Put a request's set-aside items back on the shelves. */
async function returnToShelves(trx: any, req: any) {
    await trx('guild_storage').insert({ hall_id: req.hall_id, item_id: req.item_id, quantity: req.quantity })
        .onConflict(['hall_id', 'item_id']).merge({ quantity: trx.raw('guild_storage.quantity + ?', [req.quantity]) });
}

/** Ask for items from the storehouse. At the hall; for ranks that cannot simply take them. */
export async function requestItems(playerId: number, itemIdRaw: unknown, qtyRaw: unknown): Promise<Ok<{ id: number }> | Refused> {
    try {
        const itemId = count(itemIdRaw), qty = count(qtyRaw);
        if (!itemId || !qty) throw new HallAbort('Choose something to ask for, and how many.');
        let guildId = 0;
        const id = await db.transaction(async (trx) => {
            await trx('players').where({ id: playerId }).forNoKeyUpdate().first();
            const { me, here, hall } = await hallHere(playerId, trx, true);
            guildId = me.guildId;
            if (me.can('withdraw_items')) throw new HallAbort('Your rank may take it from the storehouse yourself.');
            const row = await trx('guild_storage').where({ hall_id: hall.id, item_id: itemId }).first('quantity');
            if (Number(row?.quantity ?? 0) < qty) throw new HallAbort('The storehouse does not hold that many.');
            const [{ n }] = await trx('guild_storage_requests').where({ player_id: playerId }).whereIn('status', ['pending', 'approved']).count('* as n');
            if (Number(n) >= OPEN_REQUESTS_PER_PLAYER) throw new HallAbort(`You have ${OPEN_REQUESTS_PER_PLAYER} requests open already. Collect or cancel one first.`);
            const [created] = await trx('guild_storage_requests')
                .insert({ hall_id: hall.id, player_id: playerId, player_name: here.username, item_id: itemId, quantity: qty })
                .returning('id');
            return Number(created.id ?? created);
        });
        announce(guildId);
        return { ok: true, id };
    } catch (err) {
        return refuse(err, 'request');
    }
}

/** Yes to a request: its items come off the shelves and wait for the member. From anywhere. */
export async function approveRequest(playerId: number, requestIdRaw: unknown): Promise<Ok<{}> | Refused> {
    try {
        const requestId = count(requestIdRaw);
        if (!requestId) throw new HallAbort('Which request?');
        const me = await membershipOf(playerId);
        if (!me) throw new HallAbort('You are not in a guild.', 403);
        if (!me.can('approve_requests')) throw new HallAbort('Your rank cannot approve requests.', 403);
        let requester: number | null = null;
        await db.transaction(async (trx) => {
            const name = (await trx('players').where({ id: playerId }).first('username'))?.username ?? '';
            const pre = await trx('guild_storage_requests').where({ id: requestId }).first('hall_id');
            if (pre) await trx('guild_halls').where({ id: pre.hall_id }).forUpdate().first();
            const { req } = await lockedRequest(trx, requestId, me.guildId);
            if (req.status !== 'pending') throw new HallAbort('That request has already been answered.', 409);
            const stock = await trx('guild_storage').where({ hall_id: req.hall_id, item_id: req.item_id }).forUpdate().first();
            if (Number(stock?.quantity ?? 0) < req.quantity) throw new HallAbort('The storehouse no longer holds that many.');
            if (Number(stock.quantity) === req.quantity) await trx('guild_storage').where({ hall_id: req.hall_id, item_id: req.item_id }).delete();
            else await trx('guild_storage').where({ hall_id: req.hall_id, item_id: req.item_id }).decrement('quantity', req.quantity);
            const moved = await trx('guild_storage_requests').where({ id: requestId, status: 'pending' })
                .update({ status: 'approved', decided_by: playerId, decided_by_name: name, decided_at: trx.fn.now() });
            if (moved !== 1) throw new HallAbort('That request has already been answered.', 409);
            requester = req.player_id;
        });
        announce(me.guildId);
        if (requester) pushToPlayerSafe(requester, 'guild_request_approved');
        return { ok: true };
    } catch (err) {
        return refuse(err, 'approve');
    }
}

/**
 * No to a request, by an approver: a pending one is turned down; an approved
 * one not yet collected is withdrawn, its items going back on the shelves.
 */
export async function denyRequest(playerId: number, requestIdRaw: unknown): Promise<Ok<{}> | Refused> {
    return closeRequest(playerId, requestIdRaw, 'deny');
}

/** The requester calls off their own request, pending or approved. */
export async function cancelRequest(playerId: number, requestIdRaw: unknown): Promise<Ok<{}> | Refused> {
    return closeRequest(playerId, requestIdRaw, 'cancel');
}

async function closeRequest(playerId: number, requestIdRaw: unknown, how: 'deny' | 'cancel'): Promise<Ok<{}> | Refused> {
    try {
        const requestId = count(requestIdRaw);
        if (!requestId) throw new HallAbort('Which request?');
        const me = await membershipOf(playerId);
        if (!me) throw new HallAbort('You are not in a guild.', 403);
        await db.transaction(async (trx) => {
            const name = (await trx('players').where({ id: playerId }).first('username'))?.username ?? '';
            const pre = await trx('guild_storage_requests').where({ id: requestId }).first('hall_id');
            if (pre) await trx('guild_halls').where({ id: pre.hall_id }).forUpdate().first();
            const { req } = await lockedRequest(trx, requestId, me.guildId);
            if (how === 'deny' && !me.can('approve_requests')) throw new HallAbort('Your rank cannot answer requests.', 403);
            if (how === 'cancel' && req.player_id !== playerId) throw new HallAbort('That is not your request.', 403);
            if (req.status !== 'pending' && req.status !== 'approved') throw new HallAbort('That request is already closed.', 409);
            const closed = await trx('guild_storage_requests').where({ id: requestId, status: req.status })
                .update({
                    status: how === 'deny' ? 'denied' : 'cancelled',
                    closed_at: trx.fn.now(),
                    ...(how === 'deny' && req.status === 'pending' ? { decided_by: playerId, decided_by_name: name, decided_at: trx.fn.now() } : {}),
                });
            if (closed !== 1) throw new HallAbort('That request is already closed.', 409);
            if (req.status === 'approved') await returnToShelves(trx, req);
        });
        announce(me.guildId);
        return { ok: true };
    } catch (err) {
        return refuse(err, how);
    }
}

/** Take an approved request's items into the pack. At the hall. */
export async function collectRequest(playerId: number, requestIdRaw: unknown): Promise<Ok<{ moved: number }> | Refused> {
    try {
        const requestId = count(requestIdRaw);
        if (!requestId) throw new HallAbort('Which request?');
        let guildId = 0;
        const moved = await db.transaction(async (trx) => {
            await trx('players').where({ id: playerId }).forNoKeyUpdate().first();
            const { me, here, hall } = await hallHere(playerId, trx, true);
            guildId = me.guildId;
            const { req } = await lockedRequest(trx, requestId, me.guildId);
            if (req.player_id !== playerId) throw new HallAbort('That is not your request.', 403);
            if (req.hall_id !== hall.id) throw new HallAbort('That request is for another of your guild\'s halls.');
            if (req.status !== 'approved') throw new HallAbort(req.status === 'pending' ? 'That request is still waiting for an answer.' : 'That request is closed.', 409);
            const done = await trx('guild_storage_requests').where({ id: requestId, status: 'approved' })
                .update({ status: 'collected', closed_at: trx.fn.now() });
            if (done !== 1) throw new HallAbort('That request is closed.', 409);
            await addItemToInventoryWithin(trx, playerId, req.item_id, req.quantity);
            await trx('guild_storage_ledger').insert({
                hall_id: hall.id, player_id: playerId, player_name: here.username, item_id: req.item_id,
                delta: -req.quantity, approved_by_name: req.decided_by_name,
            });
            return Number(req.quantity);
        });
        announce(guildId);
        return { ok: true, moved };
    } catch (err) {
        return refuse(err, 'collect');
    }
}

/** A push that can never break the caller. */
function pushToPlayerSafe(playerId: number, event: string) {
    try { pushToPlayer(playerId, event, {}); } catch { /* best effort */ }
}

