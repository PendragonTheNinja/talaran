import db from '../db';
import { pushToPlayer } from '../lib/realtime';

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
  await incrementStats(playerId, { [stat]: amount });
}

/**
 * The one way counters move.
 *
 * Every counter in player_stats is written through here, which is what makes
 * the live feat panel possible: one emit carries the whole delta, so a chopped
 * log moves "First Timber" the moment it lands rather than when the player next
 * opens the tab. Feats are still EVALUATED lazily (see services/feats.ts) —
 * this pushes the number, not the award.
 */
export async function incrementStats(
  playerId: number,
  stats: Record<string, number>
): Promise<void> {
  await ensurePlayerStats(playerId);
  await db('player_stats')
    .where({ player_id: playerId })
    .increment(stats);

  pushToPlayer(playerId, 'stats_changed', { stats });
}
