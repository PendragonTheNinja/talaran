import { logger } from '../lib/logger';
import { creditGold } from './gold';

// Coins turning up in the work (docs/marketplace-spec.md §2).
//
// A second, small faucet so gold does not enter the world exclusively through
// merchant sales, and so gathering has an occasional pleasant surprise in it.
//
// ── THE MATHS, AND WHY IT NEEDS NO TUNING ───────────────────────────────────
//
//   coins = (xp / 5) × (1..MAX_MULTIPLIER)
//
// value = xp ÷ 5 is the same peg the whole economy runs on, so a drop is worth
// one to three extra units of whatever was being gathered. Because xp is itself
// round(rate × timer / 3600), the timer cancels out entirely:
//
//   gold/hr = chance × (3600/timer) × (xp/5 × avg)   and   xp = R × timer/3600
//          => gold/hr = 0.01 × R
//
// Gold per hour is exactly ONE PERCENT of xp per hour, at every level, for every
// action length, forever. Roughly 22g/hr at level 1, 29g at level 12, 70g at 50.
// Against merchant income for the same hour that is a constant 11% uplift:
// seasoning, not salary, which keeps selling the primary route and the merchants
// doing their job as a price signal.
//
// A skill added years from now gets a sensible drop with nobody touching this
// file. If it ever needs to feel richer, raise MAX_MULTIPLIER rather than
// DROP_CHANCE: frequency is what turns a surprise into income.
//
// ── WHY PASSIVE SKILLS ARE ABSENT ───────────────────────────────────────────
//
// Trapping, Husbandry and Tanning deliberately have no entries. The doctrine
// that has held this economy together is to price the ATTENTION an action costs
// and never the clock it runs on, and it has been got wrong three times already.
// Coins from a passive skill would be gold for elapsed time: the first thing in
// Talaran that pays for waiting rather than doing, and a snare line would become
// a faucet you check twice a day. Farming appears here only for till and
// harvest, which a person actually performs.

/** One action in forty. Often enough that everyone has seen it, rare enough to land. */
export const DROP_CHANCE = 0.025;

/** Coins are worth 1 to this many units of the action's own yield. */
export const MAX_MULTIPLIER = 3;

/** Ceiling, so a future high-xp action cannot drop something absurd. */
export const MAX_COINS = 250;

export interface GoldFind {
    amount: number;
    /** Replaces the main action text above the timer for this one action. */
    message: string;
}

/**
 * Flavour by action key. Several per skill on purpose: one line repeated becomes
 * wallpaper inside a day, and the entire value of this feature is the small jolt
 * of noticing something unusual.
 *
 * These REPLACE the normal completion text. The coins themselves arrive as an
 * ordinary secondary drop, so they land in the loot log like anything else.
 */
const FLAVOUR: Record<string, string[]> = {
    mining: [
        'Coins spill from a crack in the seam. Somebody hid them here and never came back for them.',
        'A few coins are wedged in the stone, worn smooth by it.',
        'The pick turns up coins along with the ore. They ring differently against the rock.',
        'Coins, packed into a seam of clay. Older than the mine, by the look of them.',
    ],
    woodcutting: [
        'Coins tumble out of a hollow in the trunk. A squirrel\'s fortune, and not a small one.',
        'Something glints in the split wood. Coins, grown into the grain years ago.',
        'A knot gives way and coins fall into the sawdust.',
        'Coins in the roots, pressed flat by a lifetime of slow growing.',
    ],
    foraging: [
        'You turn a stone over and there are coins beneath it, green with age.',
        'Coins in the leaf litter, cold and half buried.',
        'A purse, or what is left of one. The coins outlasted the leather.',
        'Coins scattered under the bracken, as though somebody left in a hurry.',
    ],
    fishing: [
        'The line comes up heavy with silt and coins. Somebody made a wish here once.',
        'Your hook brings up a knot of weed with coins tangled through it.',
        'Something clinks against the rod. Coins, and no fish at all.',
        'Coins on the hook, black with river. They have been down there a long while.',
    ],
    cut_bait: [
        'There are coins in its belly. You decide not to think about it too hard.',
        'Coins spill out as you work the knife. This fish had secrets.',
    ],
    farming: [
        'The plough turns up coins, black with earth. Fields remember things.',
        'Coins come up tangled in the roots, buried long before this was a field.',
        'The soil gives up a handful of coins. Somebody farmed here before you did.',
        'Coins in the furrow, thin as leaves and just as easy to miss.',
    ],
    hunting: [
        'The trail crosses an old camp. Coins in the ashes, long cold.',
        'Whatever you are following walked over these first. Coins, pressed into the mud.',
        'A snare that is not yours, rusted through, and coins beside it. Someone else hunted here.',
        'Coins under a flat stone at the edge of the clearing. A hunter\'s cache, forgotten.',
    ],
};

/** Action keys that can turn up coins. Anything absent simply never does. */
export function canFindGold(actionKey: string): boolean {
    return actionKey in FLAVOUR;
}

/**
 * Roll for coins at the end of an action. Returns null the overwhelming
 * majority of the time.
 *
 * The gold is credited HERE rather than by the caller, so an action cannot
 * report a find it did not actually pay out. Never throws: a failed coin drop
 * must not take an otherwise good action down with it.
 */
/**
 * Roll a find for one action, priced from the XP it paid.
 *
 * A thin call into rollGoldFinds, so there is one rule for the chance and the
 * amount however many units an action covers.
 */
export async function rollGoldFind(
    playerId: number,
    actionKey: string,
    xpAwarded: number,
): Promise<GoldFind | null> {
    return rollGoldFinds(playerId, actionKey, [xpAwarded]);
}

/**
 * Roll a find for each UNIT of work in an action, and pay the total once.
 *
 * A bulk action covers many units — Harvest All brings in twenty fields in one
 * action. Rolled once, it got a single 2.5% chance where twenty separate
 * harvests got twenty, and one MAX_COINS ceiling where they got twenty: about a
 * twentieth of the gold, for pressing the convenient button. Rolled per unit it
 * pays exactly what doing the units one by one would, in expectation, which is
 * the whole guarantee the maths above makes.
 *
 * Each entry of unitXps is the XP ONE unit should price its roll from, and it
 * must be the ATTENTION that unit cost, not everything it paid — see the note on
 * passive skills above. A farm harvest's total XP is mostly per-seed XP for the
 * growing wait; pricing gold from that would be gold for elapsed time.
 *
 * The finds are credited as one ledger entry, and the player sees one message.
 */
export async function rollGoldFinds(
    playerId: number,
    actionKey: string,
    unitXps: number[],
): Promise<GoldFind | null> {
    try {
        const lines = FLAVOUR[actionKey];
        if (!lines || !lines.length) return null;

        let amount = 0;
        for (const xp of unitXps) {
            if (!xp || xp <= 0) continue;
            if (Math.random() >= DROP_CHANCE) continue;
            const unitValue = Math.max(1, Math.round(xp / 5));
            const multiplier = 1 + Math.floor(Math.random() * MAX_MULTIPLIER);
            amount += Math.min(MAX_COINS, unitValue * multiplier);
        }
        if (amount <= 0) return null;

        await creditGold({
            playerId,
            amount,
            reason: 'found_coins',
            refType: 'action',
            refId: null,
        });

        return { amount, message: lines[Math.floor(Math.random() * lines.length)] };
    } catch (err) {
        logger.error(`rollGoldFinds error (${actionKey}): ${err}`);
        return null;
    }
}

/**
 * The item row coins are reported as, so the result card and loot log can show
 * them like any other drop. Seeded by
 * 20260810200000_seed_gold_item.ts, with a null value so no merchant will ever
 * offer to buy your gold.
 */
export const GOLD_DROP_NAME = 'Gold';
