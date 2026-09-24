import type { Knex } from 'knex';
import db from '../db';
import { pushToPlayerAfterCommit } from '../lib/realtime';

type Executor = Knex | Knex.Transaction;

/**
 * Make sure the player's stats row exists.
 *
 * A single upsert rather than read-then-insert: two first actions landing
 * together both saw no row and both inserted, and the second hit the unique
 * constraint on player_id.
 */
export async function ensurePlayerStats(playerId: number, x: Executor = db): Promise<void> {
  await x('player_stats')
    .insert({ player_id: playerId })
    .onConflict('player_id')
    .ignore();
}

export async function incrementStat(
  playerId: number,
  stat: string,
  amount: number = 1,
  x: Executor = db,
): Promise<void> {
  await incrementStats(playerId, { [stat]: amount }, x);
}

/**
 * The one way counters move.
 *
 * Every counter in player_stats is written through here, which is what makes
 * the live feat panel possible: one emit carries the whole delta, so a chopped
 * log moves "First Timber" the moment it lands rather than when the player next
 * opens the tab. Feats are still EVALUATED lazily (see services/feats.ts) —
 * this pushes the number, not the award.
 *
 * Pass the transaction when there is one. The counters then commit or roll back
 * with the work they count, the write uses the caller's connection instead of
 * borrowing a second from the pool mid-transaction, and the push waits for the
 * commit (audit N-1).
 */
export async function incrementStats(
  playerId: number,
  stats: Record<string, number>,
  x: Executor = db,
): Promise<void> {
  await ensurePlayerStats(playerId, x);
  await x('player_stats')
    .where({ player_id: playerId })
    .increment(stats);

  pushToPlayerAfterCommit(x, playerId, 'stats_changed', { stats });
}
