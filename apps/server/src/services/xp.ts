import type { Knex } from 'knex';
import db from '../db';
import { logger } from '../lib/logger';
import { pushToPlayer } from '../lib/realtime';
import { incrementStats } from './stats';

// XP curve — one formula, no branches. Derivation + rate ladder: docs/xp-rebalance.md
//
// xpPerLevel(i) = round(XP_SCALE * (i + LEVEL_SHIFT)^3 * RATE_GROWTH^(i-1))
//   - the (i+30)^3 term carries pacing: early levels quick but not instant
//   - RATE_GROWTH mirrors the content ladder (earn rates x1.33 per 12 levels),
//     so time-per-level always rises, dipping ~13-18% at each tier unlock
//
// Validated milestones (optimal play, full content ladder, stepwise sim):
//   Level 2  → ~1.1 hr      Level 25  → ~83 hr
//   Level 50 → ~407 hr      Level 100 → ~2,907 hr  (~1 yr @ 8 h/day)
//   xpForLevel(50) = 1,816,585    xpForLevel(100) = 35,538,537
//
// Raw XP is always stored. Level is calculated dynamically.
// Adjusting this formula never requires a database migration.

const XP_SCALE = 0.081;                     // calibrates the journey to ~2,920 optimal hours
const LEVEL_SHIFT = 30;                     // pacing shape: keeps early levels from being instant
const RATE_GROWTH = Math.pow(1.33, 1 / 12); // ladder growth: content earn rate x1.33 per 12 levels

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += Math.round(XP_SCALE * Math.pow(i + LEVEL_SHIFT, 3) * Math.pow(RATE_GROWTH, i - 1));
  }
  return total;
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) {
    level++;
  }
  return level;
}

export function xpToNextLevel(xp: number): number {
  const currentLevel = levelFromXp(xp);
  return xpForLevel(currentLevel + 1) - xp;
}

export function xpProgressInLevel(xp: number): number {
  const currentLevel = levelFromXp(xp);
  const xpAtCurrentLevel = xpForLevel(currentLevel);
  const xpAtNextLevel = xpForLevel(currentLevel + 1);
  return Math.floor(((xp - xpAtCurrentLevel) / (xpAtNextLevel - xpAtCurrentLevel)) * 100);
}

/**
 * skill_id → name, cached in process.
 *
 * The skills table is thirteen static rows, and half the call sites below pass
 * an id because they already looked the row up. The live feat panel needs the
 * NAME, since that is what a skill feat stores as its criterion. Querying per
 * award would put a round trip on the hot path to re-read something that never
 * changes, so it is read once and kept.
 */
const skillNames = new Map<number, string>();

async function skillNameById(id: number, x: Knex | Knex.Transaction): Promise<string | null> {
    const cached = skillNames.get(id);
    if (cached) return cached;
    const row = await x('skills').where({ id }).first();
    if (!row) return null;
    skillNames.set(id, row.name);
    return row.name;
}

// ---------------------------------------------------------------------------
// The one way XP is awarded
// ---------------------------------------------------------------------------
//
// Everything above is pure math. This is the only function in the codebase that
// writes to player_skills, and every skill goes through it.
//
// It exists because `.where(...).increment('xp', n)` on a row that does not
// exist updates nothing, reports no error, and returns 0. The action still
// completes, the item still lands in the inventory, the result card still
// renders, and the XP goes nowhere. Registration seeds a row for every skill
// that exists AT SIGNUP, so any skill added later is missing a row for every
// older account: Hunting, Agility and Equitation never got a backfill, and
// Carpentry only got one because someone noticed.
//
// Sixteen call sites did the bare increment and eight more carried their own
// copy of the upsert, which is eight chances to write the fifth copy slightly
// wrong. One upsert, one place to fix.
//
// `onConflict().merge()` makes this a single statement, so two actions
// finishing in the same tick cannot read-then-write over each other, and it
// works identically inside a transaction. `returning` hands back the new total
// from that same statement, which is what makes the live push below free.
export async function awardXp(
    playerId: number,
    skill: string | number,
    amount: number,
    x: Knex | Knex.Transaction = db,
): Promise<void> {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const xp = Math.round(amount);

    let skillId: number;
    let skillName: string | null;
    if (typeof skill === 'number') {
        skillId = skill;
        skillName = await skillNameById(skill, x);
    } else {
        const row = await x('skills').where({ name: skill }).first();
        if (!row) {
            // The action has already happened and the payout is already in the
            // player's hands, so throwing here would lose the whole result to
            // roll back one number. Loud in the log, silent to the player.
            logger.error(`awardXp: no skill named "${skill}" — ${xp} XP not awarded to player ${playerId}`);
            return;
        }
        skillId = row.id;
        skillName = row.name;
        skillNames.set(row.id, row.name);
    }

    const [row] = await x('player_skills')
        .insert({ player_id: playerId, skill_id: skillId, xp })
        .onConflict(['player_id', 'skill_id'])
        .merge({ xp: x.raw('player_skills.xp + excluded.xp') })
        .returning('xp');

    const total = Number(row?.xp ?? xp);

    // Lifetime XP earned, counted HERE for the same reason the award itself is.
    //
    // It was a key each service had to remember to pass to incrementStats, and
    // several never did: travel, quest rewards, exploration discoveries, the
    // kiln, trapping, and every woodcutting chop after a node's first. So the
    // counter drifted below the sum of the player's skills, and "The Million"
    // sat still while the Skills page climbed past it. Anything that awards XP
    // comes through this function, so anything that awards XP now counts.
    await incrementStats(playerId, { total_xp_earned: xp });

    if (!skillName) return;

    // The level BEFORE this award, derived rather than re-read: the award is
    // the only thing that changed the total.
    const leveledUp = levelFromXp(total - xp) < levelFromXp(total);
    pushToPlayer(playerId, 'skill_xp_changed', {
        skillName,
        xp: total,
        level: levelFromXp(total),
        delta: xp,
        leveledUp,
    });
}

/**
 * Raw XP to everything a skill row shows.
 *
 * routes/player.ts had two copies of this: the player's own skills computed
 * level, xpToNext and progress, while the profile route computed only level, so
 * another player's skills could not show the same tooltip. One function, both
 * callers, and adding a field means adding it once.
 */
export function skillProgress(xp: number): {
    level: number
    xpToNext: number
    progress: number
    xpIntoLevel: number
    xpLevelSpan: number
} {
    const level = levelFromXp(xp);
    const base = xpForLevel(level);
    return {
        level,
        xpToNext: xpToNextLevel(xp),
        progress: xpProgressInLevel(xp),
        xpIntoLevel: xp - base,
        xpLevelSpan: xpForLevel(level + 1) - base,
    };
}

/**
 * Which skills count toward a player's total level and total XP.
 *
 * The one rule, in one place. Three surfaces answered this differently: the
 * Skills tab filtered on `is_implemented`, while the Feats snapshot joined
 * player_skills to skills without the filter and the Highscores total query
 * never joined skills at all. Anything banked in an unshipped skill therefore
 * counted on two screens and not the third, which is why a player read 315 on
 * Feats and Highscores and 306 on Skills and reasonably asked which was real.
 *
 * Unshipped means unshipped: XP banked against a skill nobody can train yet is
 * not a level anyone has earned.
 */
export async function countedSkillIds(x: Knex | Knex.Transaction = db): Promise<Set<number>> {
    const rows = await x('skills')
        .where({ is_active: true, is_implemented: true })
        .select('id');
    return new Set(rows.map((r: any) => Number(r.id)));
}

/**
 * How much a task far below the player still teaches them.
 *
 * In full until the task's required level is TAPER_GRACE_LEVELS below the
 * player, then in proportion to the gap. A level 7 crop at Farming 57 teaches
 * (7 + 15) / 57 = 39% of its XP; at Farming 22 it teaches in full.
 *
 * Shared by the passive skills, because they share the problem it solves. Each
 * pays per unit processed — a seed, a young animal, a day's feed — and each has
 * capacity that grows faster than the XP band: plots multiply twenty-fold from
 * Farming 1 to 57, pens twelve-fold, while the band grows about four. Left
 * alone, a full farm of an early crop or a full paddock of an early animal
 * outruns the band late on. With the taper it cannot, and a player who has
 * outgrown what they are working is told so plainly — which is the signal for
 * the next crop or animal on the ladder, not a wall.
 *
 * Deliberately not a cap. Nothing is taken away, and more fields or pens are
 * always more XP; it is the ordinary MMO rule that easy work teaches less.
 */
export const TAPER_GRACE_LEVELS = 15;

export function levelTaper(requiredLevel: number, level: number): number {
    return Math.min(1, (Math.max(1, requiredLevel) + TAPER_GRACE_LEVELS) / Math.max(1, level));
}

export function xpTableSummary(): { level: number; totalXp: number }[] {
  const summary = [];
  for (const level of [1, 5, 10, 12, 25, 50, 75, 100, 110, 120]) {
    summary.push({ level, totalXp: xpForLevel(level) });
  }
  return summary;
}