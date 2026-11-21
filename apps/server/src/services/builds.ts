import db from '../db';
import { rungOfTier } from '../lib/tiers';
import { piecesRolled } from '../lib/buildRoll';
import { activeXpForSeconds } from './farming';
import { takeItemsWithin } from './inventory';
import { levelFromXp } from './xp';
import { creditGoldWithin } from './gold';

// What every build raised a material at a time shares: a guild hall
// (services/guildHall.ts) and a boat on a slip (services/boats.ts). Each turn
// is a 20-second action that sets in 1 to N of one material (lib/buildRoll.ts)
// and pays Carpentry for 20 seconds at the band of the tier being built
// (docs/antura-plan.md §6a). What is built, where, and by whom is the caller's;
// how pieces go in is here, once (docs/sailing-spec.md §5: never a copy).

export const BUILD_SECONDS = 20;

/** The most a hired hand may be paid for one piece, on any build site. */
export const MAX_PAY_RATE = 10_000;

/** Carpentry XP for one build turn on a build of `tier`. */
export function buildTurnXp(tier: number): number {
    return activeXpForSeconds(rungOfTier(tier), BUILD_SECONDS);
}

/** The player's Carpentry level, for the roll. */
export async function carpentryLevel(playerId: number, x: any = db): Promise<number> {
    const row = await x('player_skills as ps').join('skills as s', 's.id', 'ps.skill_id')
        .where({ 'ps.player_id': playerId, 's.name': 'Carpentry' }).first('ps.xp');
    return row ? levelFromXp(Number(row.xp)) : 1;
}

/**
 * Set one turn's pieces of a material into a build, inside the caller's
 * transaction, after the caller has locked the build and read how much of
 * this material it has (`delivered`) against what it wants (`wanted`).
 * Rolls the count, cuts it to what is still wanted and what the pack holds,
 * and takes that many from the pack. Returns the count set in, or 0 when the
 * pack holds none; the caller writes its own progress and throws its own
 * refusal, so nothing here commits on its own.
 */
export async function takeBuildPiecesWithin(trx: any, args: {
    playerId: number
    item: { id: number; name: string }
    wanted: number
    delivered: number
    flips: number
    carpentry: number
    tier: number
    /**
     * Materials laid at the site for the builder to use (a hired hand's, laid
     * by the owner), taken before the builder's own: how many there are, and
     * how to take some, conditionally, inside this transaction.
     */
    stock?: { held: number; take: (n: number) => Promise<boolean> }
    /** At most this many this turn (what a hired hand's purse can still pay for). */
    cap?: number
}): Promise<number> {
    const heldRow = await trx('player_inventory').where({ player_id: args.playerId, item_id: args.item.id }).first('quantity');
    const held = Number(heldRow?.quantity ?? 0);
    const stocked = Math.max(0, args.stock?.held ?? 0);
    const room = args.wanted - args.delivered;
    if (held + stocked < 1 || room < 1) return 0;
    const pieces = Math.min(piecesRolled(args.flips, args.carpentry, rungOfTier(args.tier)), room, held + stocked, args.cap ?? Infinity);
    if (pieces < 1) return 0;
    const fromStock = Math.min(stocked, pieces);
    if (fromStock > 0 && !(await args.stock!.take(fromStock))) return 0;
    const fromPack = pieces - fromStock;
    if (fromPack > 0) {
        const taken = await takeItemsWithin(trx, args.playerId, [{ name: args.item.name, quantity: fromPack }]);
        // Nothing commits on its own: the caller throws on 0, rolling the stock back too.
        if (!taken.ok) return 0;
    }
    return pieces;
}

/**
 * Pay a hired hand for one turn's pieces from a build site's purse (a boat's
 * `vessel_builds.fund_gold`, a hall's `guild_halls.fund_gold`), inside the
 * caller's transaction: conditional and relative, so two turns can never both
 * spend the same gold (CLAUDE.md §4). Returns what is left in the purse, or
 * null when it cannot pay, and the caller throws. Pays nothing at rate 0.
 */
export async function payWageWithin(trx: any, args: {
    table: 'vessel_builds' | 'guild_halls'
    siteId: number
    fund: number
    wage: number
    playerId: number
    reason: string
}): Promise<number | null> {
    if (args.wage <= 0) return args.fund;
    const [paid] = await trx(args.table).where({ id: args.siteId }).where('fund_gold', '>=', args.wage)
        .decrement('fund_gold', args.wage).returning('fund_gold');
    if (!paid) return null;
    await creditGoldWithin(trx, { playerId: args.playerId, amount: args.wage, reason: args.reason, refType: args.table === 'vessel_builds' ? 'vessel_build' : 'guild_hall', refId: args.siteId });
    return Number(paid.fund_gold);
}
