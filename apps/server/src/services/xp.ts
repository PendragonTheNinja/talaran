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

export function xpTableSummary(): { level: number; totalXp: number }[] {
  const summary = [];
  for (const level of [1, 5, 10, 12, 25, 50, 75, 100, 110, 120]) {
    summary.push({ level, totalXp: xpForLevel(level) });
  }
  return summary;
}