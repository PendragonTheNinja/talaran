// XP curve designed specifically for Talaran's pacing.
// Calibrated against real action timers (Lanai trees = 1,200 XP/hr at level 1).
//
// Target milestones for a dedicated player (6hr/day, optimal actions):
//   Level 12  → ~2-3 days
//   Level 25  → ~2 weeks
//   Level 50  → ~2 months
//   Level 100 → ~6 months
//
// Raw XP is always stored. Level is calculated dynamically.
// Adjusting this formula never requires a database migration.

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let i = 1; i < level; i++) {
    const base = i <= 50
      ? Math.floor(120 * Math.pow(1.09, i))
      : Math.floor(120 * Math.pow(1.09, 50) * Math.pow(1.055, i - 50));
    total += base;
  }
  return Math.floor(total);
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