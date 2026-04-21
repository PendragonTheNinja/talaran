import db from '../db';

export async function ensurePlayerStats(playerId: number): Promise<void> {
  const existing = await db('player_stats').where({ player_id: playerId }).first();
  if (!existing) {
    await db('player_stats').insert({ player_id: playerId });
  }
}

export async function incrementStat(
  playerId: number,
  stat: string,
  amount: number = 1
): Promise<void> {
  await ensurePlayerStats(playerId);
  await db('player_stats')
    .where({ player_id: playerId })
    .increment(stat, amount);
}

export async function incrementStats(
  playerId: number,
  stats: Record<string, number>
): Promise<void> {
  await ensurePlayerStats(playerId);
  await db('player_stats')
    .where({ player_id: playerId })
    .increment(stats);
}