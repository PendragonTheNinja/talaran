import db from '../db';
import { rungOfTier } from '../lib/tiers';
import { piecesRolled } from '../lib/buildRoll';
import { activeXpForSeconds } from './farming';
import { takeItemsWithin } from './inventory';
import { levelFromXp } from './xp';

// What every build raised a material at a time shares: a guild hall
// (services/guildHall.ts) and a boat on a slip (services/boats.ts). Each turn
// is a 20-second action that sets in 1 to N of one material (lib/buildRoll.ts)
// and pays Carpentry for 20 seconds at the band of the tier being built
// (docs/antura-plan.md §6a). What is built, where, and by whom is the caller's;
// how pieces go in is here, once (docs/sailing-spec.md §5: never a copy).

export const BUILD_SECONDS = 20;

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
}): Promise<number> {
    const heldRow = await trx('player_inventory').where({ player_id: args.playerId, item_id: args.item.id }).first('quantity');
    const held = Number(heldRow?.quantity ?? 0);
    const room = args.wanted - args.delivered;
    if (held < 1 || room < 1) return 0;
    const pieces = Math.min(piecesRolled(args.flips, args.carpentry, rungOfTier(args.tier)), room, held);
    const taken = await takeItemsWithin(trx, args.playerId, [{ name: args.item.name, quantity: pieces }]);
    return taken.ok ? pieces : 0;
}
