import db from '../db';
import { logger } from '../lib/logger';
import { pushToPlayer, pushToRoom } from '../lib/realtime';
import { rungOfTier } from '../lib/tiers';
import { SERVER_ERROR } from '../lib/serviceResult';
import { addItemToInventoryWithin, takeItemsWithin } from './inventory';
import { creditGoldWithin, debitGoldWithin } from './gold';
import { missingBuildTool } from './construction';
import { awardXp } from './xp';
import { membershipOf } from './guildRanks';
import { noteDeed } from './chronicle';
import { HALL_FLIPS, piecesAverage } from '../lib/buildRoll';
import { BUILD_SECONDS, buildTurnXp, carpentryLevel, MAX_PAY_RATE, payWageWithin, takeBuildPiecesWithin } from './builds';

// ── Guild halls (migration 20261102170000; Nathan, 2026-11-02) ───────────────
//
// One hall per guild per island, at a location the guild chooses (the
// leader lays the foundations where they stand). Members raise it together,
// 1 to 3 pieces of a material at a time (more often 3 the better the
// carpenter, lib/buildRoll.ts; Nathan, 2026-11-16), with a repeating
// 20-second action ('guild_build',
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
// Building for hire (docs/antura-plan.md §6b; migration 20261121160000): as
// on a boat's slip, the guild names hands from outside it (guild_hall_hands),
// pays them by the piece from a wage purse at the hall (`fund_gold`, apart
// from the storehouse's `gold`), and lays materials there for any builder to
// use before their own (guild_hall_stock). The leader, or a rank that may take
// gold, names hands, sets the pay, and takes the purse back; any member may
// add to the purse or lay materials; taking materials back wants
// withdraw_items. A hand's action carries `<item>|hall:<id>`. Purse and stock
// carry over from tier to tier. The wage and the stock are taken by the
// helpers in services/builds.ts, shared with the boats.
//
// Locks, always in this order: the player row, then the hall row, then any
// storage or progress row. Writes are relative and conditional; a refusal
// after a write throws HallAbort so the transaction rolls back (CLAUDE.md §4).

export { BUILD_SECONDS };

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

async function tierRow(tier: number, x: any = db): Promise<{ tier: number; capacity: number; buildLevel: number; requirements: Requirement[] } | null> {
    const row = await x('guild_hall_tiers').where({ tier }).first();
    if (!row) return null;
    const reqs = typeof row.requirements === 'string' ? JSON.parse(row.requirements) : row.requirements;
    return { tier: row.tier, capacity: Number(row.capacity), buildLevel: Number(row.build_level ?? 1), requirements: Array.isArray(reqs) ? reqs : [] };
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

/**
 * Halls of other guilds this player was named to work on (docs/antura-plan.md
 * §6b): what each tier still wants, what is laid there, and what it pays.
 */
async function hallHires(playerId: number, here: any) {
    const rows = await db('guild_hall_hands as hh').join('guild_halls as h', 'h.id', 'hh.hall_id')
        .join('guilds as g', 'g.id', 'h.guild_id').join('locations as l', 'l.id', 'h.location_id')
        .where('hh.player_id', playerId).orderBy('h.id')
        .select('h.*', 'g.name as guild_name', 'l.name as location_name');
    const carpentry = await carpentryLevel(playerId);
    const out = [];
    for (const h of rows) {
        const next = await tierRow(Number(h.tier) + 1);
        const items = next?.requirements.length ? await db('items').whereIn('name', next.requirements.map(r => r.item)).select('id', 'name') : [];
        const idOf = new Map<string, number>(items.map((i: any) => [i.name, Number(i.id)]));
        const requirements = [];
        for (const r of next?.requirements ?? []) {
            const id = idOf.get(r.item);
            requirements.push({
                item: r.item, needed: r.qty, exists: !!id,
                delivered: id ? Number((await db('guild_hall_progress').where({ hall_id: h.id, item_id: id }).first('delivered'))?.delivered ?? 0) : 0,
                held: id ? Number((await db('player_inventory').where({ player_id: playerId, item_id: id }).first('quantity'))?.quantity ?? 0) : 0,
                stocked: id ? await stockOf(db, h.id, id) : 0,
            });
        }
        out.push({
            hallId: Number(h.id), guildName: h.guild_name, locationName: h.location_name, island: h.island,
            atHall: Number(h.location_id) === Number(here?.location_id),
            rate: Number(h.pay_rate ?? 0), purse: Number(h.fund_gold ?? 0),
            building: next ? {
                tier: next.tier, buildLevel: next.buildLevel, carpentry,
                xpPerPiece: buildTurnXp(next.tier),
                piecesPerAction: Math.round(piecesAverage(HALL_FLIPS, carpentry, rungOfTier(next.tier)) * 10) / 10,
                requirements,
            } : null,
        });
    }
    return out;
}

/** A look into each finished hall's storehouse, for members away from it. */
async function storesAfar(halls: { id: number; island: string; tier: number; location_name: string }[]) {
    if (!halls.length) return [];
    const ids = halls.map(h => h.id);
    const rows = await db('guild_storage as s').join('items as i', 'i.id', 's.item_id')
        .whereIn('s.hall_id', ids).where('s.quantity', '>', 0).orderBy('i.name')
        .select('s.hall_id', 'i.id as item_id', 'i.name', 'i.type', 'i.subtype', 'i.tier', 'i.quality', 'i.description', 's.quantity');
    const gold = new Map<number, number>((await db('guild_halls').whereIn('id', ids).select('id', 'gold'))
        .map((r: any) => [Number(r.id), Number(r.gold)]));
    return Promise.all(halls.map(async h => ({
        island: h.island,
        locationName: h.location_name,
        tier: h.tier,
        gold: gold.get(h.id) ?? 0,
        capacity: await capacityAt(h.tier),
        used: await usedRoom(h.id),
        storage: rows.filter((r: any) => r.hall_id === h.id)
            .map(({ hall_id: _h, ...r }: any) => ({ ...r, quantity: Number(r.quantity) })),
    })));
}

export async function hallState(playerId: number) {
    const me = await membershipOf(playerId);
    const here = await whereIs(playerId);
    const hires = await hallHires(playerId, here);
    if (!me) return { inGuild: false as const, hires };
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
        hires,
        // What each storehouse holds, to look at from anywhere, any member
        // (forum, 2026-11-15: it saves a walk to see what is in stock). Looking
        // only: putting in and taking out still want the player at the hall.
        // The hall the player stands at sends its own, fuller, below.
        storesAfar: await storesAfar(halls.filter((h: any) => h.tier > 0 && !(atHall && h.id === onIsland?.id))),
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

    const stock = new Map<number, number>((await db('guild_hall_stock').where({ hall_id: hall.id }))
        .map((r: any) => [Number(r.item_id), Number(r.quantity)]));

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
                buildLevel: nextTier.buildLevel,
                carpentry: await carpentryLevel(playerId),
                capacityAfter: nextTier.capacity,
                xpPerPiece: buildTurnXp(nextTier.tier),
                // What one action sets in on average at this carpenter's level.
                piecesPerAction: Math.round(piecesAverage(HALL_FLIPS, await carpentryLevel(playerId), rungOfTier(nextTier.tier)) * 10) / 10,
                requirements: nextTier.requirements.map(r => {
                    const id = idByName.get(r.item);
                    return {
                        item: r.item,
                        needed: r.qty,
                        delivered: id ? delivered.get(id) ?? 0 : 0,
                        // A material the world cannot make yet: the tier waits for it.
                        exists: !!id,
                        held: id ? held.get(id) ?? 0 : 0,
                        stocked: id ? stock.get(id) ?? 0 : 0,
                    };
                }),
            } : null,
            // Building for hire (docs/antura-plan.md §6b): hands, pay, purse, and materials laid here.
            hire: {
                rate: Number(hall.pay_rate ?? 0),
                purse: Number(hall.fund_gold ?? 0),
                hands: await db('guild_hall_hands as hh').join('players as p', 'p.id', 'hh.player_id')
                    .where('hh.hall_id', hall.id).orderBy('hh.named_at').pluck('p.username'),
                canManage: canHire(me),
                canTakeStock: me.can('withdraw_items'),
                // Per material of the tier being built: what it still wants, what is laid, and room for more.
                materials: (nextTier?.requirements ?? []).map(r => {
                    const id = idByName.get(r.item);
                    const left = Math.max(0, r.qty - (id ? delivered.get(id) ?? 0 : 0));
                    const laid = id ? stock.get(id) ?? 0 : 0;
                    return { item: r.item, wanted: left, laid, room: Math.max(0, left - laid) };
                }),
                // Anything laid that this tier no longer wants, still there to take back.
                laid: (await db('guild_hall_stock as s').join('items as i', 'i.id', 's.item_id')
                    .where('s.hall_id', hall.id).where('s.quantity', '>', 0).select('i.name', 's.quantity'))
                    .map((r: any) => ({ item: r.name, quantity: Number(r.quantity) })),
            },
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
            if (await hireHoldsAnything(hall, trx)) {
                throw new HallAbort('Take back the wage purse and the materials laid at the hall first. Nothing in them is thrown away.');
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

/**
 * The hall a builder works on: their own guild's here, or, for a hand, the
 * hall that named them (`hallId`), with the hand standing at it.
 */
async function siteFor(playerId: number, hallId: number | null, x: any = db, lockHall = false) {
    if (hallId === null) {
        const { me, here, hall } = await hallHere(playerId, x, lockHall);
        return { here, hall, hand: false, guildId: Number(me.guildId) };
    }
    const q = x('guild_halls').where({ id: hallId });
    const hall = await (lockHall ? q.forUpdate() : q).first();
    if (!hall || !(await x('guild_hall_hands').where({ hall_id: hallId, player_id: playerId }).first())) {
        throw new HallAbort('Nobody has asked you to work on that hall.');
    }
    const here = await whereIs(playerId, x);
    if (Number(hall.location_id) !== Number(here?.location_id)) {
        const at = await x('locations').where({ id: hall.location_id }).first('name');
        throw new HallAbort(`That hall is at ${at?.name ?? 'another place'}.`);
    }
    return { here, hall, hand: true, guildId: Number(hall.guild_id) };
}

/** The guild's name, for a hand's lines. */
async function guildName(guildId: number, x: any = db): Promise<string> {
    return (await x('guilds').where({ id: guildId }).first('name'))?.name ?? 'the guild';
}

/** How many of a material are laid at a hall. */
async function stockOf(x: any, hallId: number, itemId: number): Promise<number> {
    return Number((await x('guild_hall_stock').where({ hall_id: hallId, item_id: itemId }).first('quantity'))?.quantity ?? 0);
}

/** Re-checked at the start and on every cycle: what one more piece of `itemName` needs. */
async function buildCheck(playerId: number, itemName: string, x: any = db, hallId: number | null = null) {
    const { here, hall, hand, guildId } = await siteFor(playerId, hallId, x);
    const next = await tierRow(hall.tier + 1, x);
    if (!next) throw new HallAbort('The hall stands as high as it can be built.');
    const req = next.requirements.find(r => r.item === itemName);
    if (!req) throw new HallAbort(`This tier of the hall does not use ${itemName}.`);
    const item = await x('items').where({ name: itemName }).first('id', 'name');
    if (!item) throw new HallAbort(`No one in Talaran can make ${itemName} yet.`);
    const tool = await missingBuildTool(playerId, x);
    if (tool) throw new HallAbort(tool.message);
    // Each tier of the hall wants its own Carpentry (guild_hall_tiers.build_level;
    // tier 2 at 22, docs/antura-plan.md §6), checked at the start and every cycle.
    if (await carpentryLevel(playerId, x) < next.buildLevel) {
        throw new HallAbort(`Building the hall's tier ${next.tier} wants Carpentry ${next.buildLevel}.`);
    }
    const rate = hand ? Number(hall.pay_rate ?? 0) : 0;
    if (rate > 0 && Number(hall.fund_gold ?? 0) < rate) throw new HallAbort(`The purse at ${await guildName(guildId, x)}'s hall is empty.`);
    return { here, hall, next, req, item, hand, guildId, rate };
}

/** A hall build action's data: the material, and the hall a hand was named for. */
function parseBuildData(data: unknown): { itemName: string; hallId: number | null } {
    const raw = typeof data === 'string' ? data : '';
    const m = /^(.*)\|hall:(\d+)$/.exec(raw);
    return m ? { itemName: m[1], hallId: Number(m[2]) } : { itemName: raw, hallId: null };
}

export async function startBuild(playerId: number, itemNameRaw: unknown, hallRaw?: unknown): Promise<Ok<{ timerSeconds: number }> | Refused> {
    try {
        const itemName = typeof itemNameRaw === 'string' ? itemNameRaw : '';
        const asked = hallRaw === undefined || hallRaw === null || hallRaw === '' ? null : Math.floor(Number(hallRaw));
        const hallId = asked && Number.isFinite(asked) && asked > 0 ? asked : null;
        const { here, hall, req, item, hand } = await buildCheck(playerId, itemName, db, hallId);
        const progress = await db('guild_hall_progress').where({ hall_id: hall.id, item_id: item.id }).first();
        if (Number(progress?.delivered ?? 0) >= req.qty) throw new HallAbort(`The hall has all the ${itemName} this tier needs.`);
        const held = await db('player_inventory').where({ player_id: playerId, item_id: item.id }).first();
        if (Number(held?.quantity ?? 0) + await stockOf(db, hall.id, item.id) < 1) {
            throw new HallAbort(`You have no ${itemName}, and there is none laid at the hall.`);
        }
        if (await db('player_actions').where({ player_id: playerId }).first()) {
            throw new HallAbort('You are already performing an action', 409);
        }
        const now = new Date();
        await db('player_actions').insert({
            player_id: playerId,
            action_type: 'guild_build',
            action_data: hand ? `${itemName}|hall:${hall.id}` : itemName,
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

/** Pieces set into the hall for the tick, 1 to 3 a cycle. Every precondition is re-checked. */
export async function resolveBuildCycle(playerId: number, data: string): Promise<BuildCycleResult> {
    try {
        let guildId = 0;
        const { itemName, hallId } = parseBuildData(data);
        const carpentry = await carpentryLevel(playerId);
        const outcome = await db.transaction(async (trx) => {
            // The player first, then the hall. A hand's wage takes this row FOR
            // UPDATE (creditGoldWithin), so a hand takes it so from the start.
            const me = trx('players').where({ id: playerId });
            await (hallId !== null ? me.forUpdate() : me.forNoKeyUpdate()).first();
            const { hall: unlocked, next, req, item, hand, rate, guildId: gid } = await buildCheck(playerId, itemName, trx, hallId);
            guildId = gid;
            const hall = await trx('guild_halls').where({ id: unlocked.id }).forUpdate().first();
            if (!hall || hall.tier !== unlocked.tier) throw new HallAbort('The hall changed while you worked. Look again.');

            await trx('guild_hall_progress').insert({ hall_id: hall.id, item_id: item.id, delivered: 0 })
                .onConflict(['hall_id', 'item_id']).ignore();
            const progress = await trx('guild_hall_progress').where({ hall_id: hall.id, item_id: item.id }).forUpdate().first();
            if (Number(progress.delivered) >= req.qty) throw new HallAbort(`The hall has all the ${itemName} this tier needs.`);

            // The roll, cut to what the tier still wants, what is laid at the
            // hall and in the pack, and what a hand's purse can pay for (services/builds.ts).
            const fund = Number(hall.fund_gold ?? 0);
            const pieces = await takeBuildPiecesWithin(trx, {
                playerId, item, wanted: req.qty, delivered: Number(progress.delivered), flips: HALL_FLIPS, carpentry, tier: next.tier,
                stock: {
                    held: await stockOf(trx, hall.id, item.id),
                    take: async (n) => (await trx('guild_hall_stock').where({ hall_id: hall.id, item_id: item.id })
                        .where('quantity', '>=', n).decrement('quantity', n)) === 1,
                },
                cap: rate > 0 ? Math.floor(fund / rate) : undefined,
            });
            if (pieces < 1) throw new HallAbort(`You have no ${itemName} left, and there is none laid at the hall.`);

            // A hand's wage, from the purse, now (docs/antura-plan.md §6b).
            const wage = rate * pieces;
            const fundLeft = await payWageWithin(trx, { table: 'guild_halls', siteId: hall.id, fund, wage, playerId, reason: 'hall_wage' });
            if (fundLeft === null) throw new HallAbort(`The purse at ${await guildName(guildId, trx)}'s hall is empty.`);

            const delivered = Number(progress.delivered) + pieces;
            await trx('guild_hall_progress').where({ hall_id: hall.id, item_id: item.id }).increment('delivered', pieces);
            await trx('guild_hall_contributions').insert({ hall_id: hall.id, player_id: playerId, item_id: item.id, quantity: pieces })
                .onConflict(['hall_id', 'player_id', 'item_id']).merge({ quantity: trx.raw('guild_hall_contributions.quantity + ?', [pieces]) });

            const xp = buildTurnXp(next.tier);
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
                    kind: 'guild_hall_tier', guildId,
                    data: { tier: next.tier, place: place?.name ?? null, island: hall.island, byPlayerId: playerId },
                });
            }

            const more = await trx('player_inventory').where({ player_id: playerId, item_id: item.id }).first('quantity');
            let carryOn = !finished && delivered < req.qty && Number(more?.quantity ?? 0) + await stockOf(trx, hall.id, item.id) > 0;
            // Told before the next turn, not after it (docs/antura-plan.md §6b).
            const purseEmpty = carryOn && rate > 0 && fundLeft < rate;
            if (purseEmpty) carryOn = false;
            const whose = hand ? `${await guildName(guildId, trx)}'s hall` : 'the hall';
            return {
                xp,
                finished,
                tier: next.tier,
                carryOn,
                message: (finished
                    ? (next.tier === 1
                        ? (hand ? `The last piece goes in. ${whose.charAt(0).toUpperCase() + whose.slice(1)} stands.` : 'The last piece goes in. The hall stands, and its storehouse is open.')
                        : `The last piece goes in. The tier ${next.tier} of ${whose} is finished.`)
                    : `${pieces} ${item.name} set into ${whose}: ${delivered.toLocaleString('en-US')} of ${req.qty.toLocaleString('en-US')}.`)
                    + (wage > 0 ? ` You are paid ${wage.toLocaleString('en-US')} gold.` : '')
                    + (purseEmpty ? ' The purse at the hall cannot pay for another piece, so you stop.' : ''),
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

// ── Building for hire: the guild's controls ────────────────────────────────

/** Whole, positive, finite, or null. */
function whole(raw: unknown): number | null {
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) && n > 0 ? n : null;
}

/** May this member hire for the hall: name hands, set pay, take the purse back? */
const canHire = (me: { isLeader: boolean; can: (p: string) => boolean }) => me.isLeader || me.can('withdraw_gold');

/** Name someone outside the guild who may build on the hall here. */
export async function nameHallHand(playerId: number, usernameRaw: unknown): Promise<Ok<{ name: string }> | Refused> {
    try {
        const username = typeof usernameRaw === 'string' ? usernameRaw.trim() : '';
        if (!username) throw new HallAbort('Name the carpenter you want to work on it.');
        const { me, hall } = await hallHere(playerId);
        if (!canHire(me)) throw new HallAbort('Your rank cannot hire for the hall.', 403);
        const hand = await db('players').whereRaw('lower(username) = lower(?)', [username]).first('id', 'username');
        if (!hand) throw new HallAbort(`There is nobody called ${username}.`);
        const theirs = await membershipOf(Number(hand.id));
        if (theirs && theirs.guildId === me.guildId) throw new HallAbort(`${hand.username} is in the guild, and may build on the hall already.`);
        await db('guild_hall_hands').insert({ hall_id: hall.id, player_id: hand.id }).onConflict(['hall_id', 'player_id']).ignore();
        announce(me.guildId);
        pushToPlayer(Number(hand.id), 'guild_hall_changed', {});
        return { ok: true, name: hand.username };
    } catch (err) {
        return refuse(err, 'nameHallHand');
    }
}

export async function dropHallHand(playerId: number, usernameRaw: unknown): Promise<Ok<{}> | Refused> {
    try {
        const username = typeof usernameRaw === 'string' ? usernameRaw.trim() : '';
        const { me, hall } = await hallHere(playerId);
        if (!canHire(me)) throw new HallAbort('Your rank cannot hire for the hall.', 403);
        const hand = await db('players').whereRaw('lower(username) = lower(?)', [username]).first('id');
        if (hand) {
            await db('guild_hall_hands').where({ hall_id: hall.id, player_id: hand.id }).delete();
            pushToPlayer(Number(hand.id), 'guild_hall_changed', {});
        }
        announce(me.guildId);
        return { ok: true };
    } catch (err) {
        return refuse(err, 'dropHallHand');
    }
}

export async function setHallPayRate(playerId: number, rateRaw: unknown): Promise<Ok<{ rate: number }> | Refused> {
    try {
        const rate = Math.floor(Number(rateRaw));
        if (!Number.isFinite(rate) || rate < 0) throw new HallAbort('A piece pays a whole number of gold, or nothing.');
        if (rate > MAX_PAY_RATE) throw new HallAbort(`A piece can pay at most ${MAX_PAY_RATE.toLocaleString('en-US')} gold.`);
        const { me, hall } = await hallHere(playerId);
        if (!canHire(me)) throw new HallAbort('Your rank cannot hire for the hall.', 403);
        await db('guild_halls').where({ id: hall.id }).update({ pay_rate: rate });
        announce(me.guildId);
        return { ok: true, rate };
    } catch (err) {
        return refuse(err, 'setHallPayRate');
    }
}

/** Gold from a member's own into the wage purse. Any member. */
export async function layHallPurse(playerId: number, amountRaw: unknown): Promise<Ok<{ fund: number }> | Refused> {
    try {
        const amount = whole(amountRaw);
        if (!amount) throw new HallAbort('Lay a whole number of gold.');
        let guildId = 0;
        const fund = await db.transaction(async (trx) => {
            await trx('players').where({ id: playerId }).forUpdate().first();
            const { me, hall } = await hallHere(playerId, trx, true);
            guildId = me.guildId;
            const paid = await debitGoldWithin(trx, { playerId, amount, reason: 'hall_purse_lay', refType: 'guild_hall', refId: hall.id });
            if (!paid.ok) throw new HallAbort(`You have only ${paid.balance.toLocaleString('en-US')} gold.`);
            const [row] = await trx('guild_halls').where({ id: hall.id }).increment('fund_gold', amount).returning('fund_gold');
            return Number(row.fund_gold);
        });
        announce(guildId);
        return { ok: true, fund };
    } catch (err) {
        return refuse(err, 'layHallPurse');
    }
}

/** Gold back out of the wage purse, to whoever may hire. */
export async function takeHallPurse(playerId: number, amountRaw: unknown): Promise<Ok<{ fund: number }> | Refused> {
    try {
        const amount = whole(amountRaw);
        if (!amount) throw new HallAbort('Take a whole number of gold.');
        let guildId = 0;
        const fund = await db.transaction(async (trx) => {
            await trx('players').where({ id: playerId }).forUpdate().first();
            const { me, hall } = await hallHere(playerId, trx, true);
            guildId = me.guildId;
            if (!canHire(me)) throw new HallAbort('Your rank cannot take gold from the purse.', 403);
            // Conditional and relative (CLAUDE.md §4 rule 1).
            const [row] = await trx('guild_halls').where({ id: hall.id }).where('fund_gold', '>=', amount)
                .decrement('fund_gold', amount).returning('fund_gold');
            if (!row) throw new HallAbort(`The purse holds only ${Number(hall.fund_gold).toLocaleString('en-US')} gold.`);
            await creditGoldWithin(trx, { playerId, amount, reason: 'hall_purse_take', refType: 'guild_hall', refId: hall.id });
            return Number(row.fund_gold);
        });
        announce(guildId);
        return { ok: true, fund };
    } catch (err) {
        return refuse(err, 'takeHallPurse');
    }
}

/**
 * Lay materials from a member's pack at the hall, for any builder to use.
 * Never more than the tier being built still wants.
 */
export async function layHallStock(playerId: number, itemRaw: unknown, qtyRaw: unknown): Promise<Ok<{ laid: number }> | Refused> {
    try {
        const qty = whole(qtyRaw);
        const itemName = typeof itemRaw === 'string' ? itemRaw : '';
        if (!qty) throw new HallAbort('Lay a whole number of them.');
        let guildId = 0;
        const laid = await db.transaction(async (trx) => {
            await trx('players').where({ id: playerId }).forNoKeyUpdate().first();
            const { me, hall } = await hallHere(playerId, trx, true);
            guildId = me.guildId;
            const next = await tierRow(hall.tier + 1, trx);
            const req = next?.requirements.find(r => r.item === itemName);
            if (!next || !req) throw new HallAbort(`The hall's next tier does not use ${itemName}.`);
            const item = await trx('items').where({ name: itemName }).first('id');
            if (!item) throw new HallAbort(`No one in Talaran can make ${itemName} yet.`);
            // Read under the hall's lock, so two layings at once cannot both fit.
            const delivered = Number((await trx('guild_hall_progress').where({ hall_id: hall.id, item_id: item.id }).first('delivered'))?.delivered ?? 0);
            const room = Math.max(0, req.qty - delivered - await stockOf(trx, hall.id, item.id));
            if (qty > room) {
                throw new HallAbort(room > 0
                    ? `The hall wants only ${room.toLocaleString('en-US')} more ${itemName} than is laid here already.`
                    : `Enough ${itemName} is laid here already to finish this tier.`);
            }
            const taken = await takeItemsWithin(trx, playerId, [{ name: itemName, quantity: qty }]);
            if (!taken.ok) throw new HallAbort(`You do not have ${qty.toLocaleString('en-US')} ${itemName}.`);
            const [row] = await trx('guild_hall_stock').insert({ hall_id: hall.id, item_id: item.id, quantity: qty })
                .onConflict(['hall_id', 'item_id']).merge({ quantity: trx.raw('guild_hall_stock.quantity + ?', [qty]) })
                .returning('quantity');
            return Number(row.quantity);
        });
        announce(guildId);
        return { ok: true, laid };
    } catch (err) {
        return refuse(err, 'layHallStock');
    }
}

/** Take laid materials back into the pack. Needs withdraw_items, as the storehouse does. */
export async function takeHallStock(playerId: number, itemRaw: unknown, qtyRaw: unknown): Promise<Ok<{ laid: number }> | Refused> {
    try {
        const qty = whole(qtyRaw);
        const itemName = typeof itemRaw === 'string' ? itemRaw : '';
        if (!qty) throw new HallAbort('Take a whole number of them.');
        let guildId = 0;
        const laid = await db.transaction(async (trx) => {
            await trx('players').where({ id: playerId }).forNoKeyUpdate().first();
            const { me, hall } = await hallHere(playerId, trx, true);
            guildId = me.guildId;
            if (!me.can('withdraw_items')) throw new HallAbort('Your rank cannot take materials back from the hall.', 403);
            const item = await trx('items').where({ name: itemName }).first('id');
            if (!item) throw new HallAbort(`There is no ${itemName} laid here.`);
            const [row] = await trx('guild_hall_stock').where({ hall_id: hall.id, item_id: item.id }).where('quantity', '>=', qty)
                .decrement('quantity', qty).returning('quantity');
            if (!row) throw new HallAbort(`There are not ${qty.toLocaleString('en-US')} ${itemName} laid here.`);
            await addItemToInventoryWithin(trx, playerId, item.id, qty);
            return Number(row.quantity);
        });
        announce(guildId);
        return { ok: true, laid };
    } catch (err) {
        return refuse(err, 'takeHallStock');
    }
}

/** True while a hall's wage purse or laid materials hold anything. */
async function hireHoldsAnything(hall: { id: number; fund_gold?: unknown }, x: any = db): Promise<boolean> {
    if (Number(hall.fund_gold ?? 0) > 0) return true;
    return !!(await x('guild_hall_stock').where({ hall_id: hall.id }).where('quantity', '>', 0).first('item_id'));
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
export async function guildStorehousesHoldAnything(guildId: number, x: any = db, lock = false): Promise<boolean> {
    // With lock, inside a transaction, the halls stay as read until commit: a
    // deposit or a gold payment takes the same hall lock, so it waits and then
    // finds the guild gone instead of landing in a hall about to be deleted
    // (disband, audit 2026-11-09, B11).
    const q = x('guild_halls').where({ guild_id: guildId }).orderBy('id').select('id', 'gold', 'fund_gold');
    const halls = await (lock ? q.forUpdate() : q);
    if (halls.some((h: any) => Number(h.gold) > 0)) return true;
    if (!halls.length) return false;
    for (const h of halls) if ((await usedRoom(h.id, x)) > 0 || (await hireHoldsAnything(h, x))) return true;
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

