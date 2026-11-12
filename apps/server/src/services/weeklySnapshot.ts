import db from '../db';
import { logger } from '../lib/logger';
import { startOfGameWeek } from '../lib/gameTime';

export async function takeWeeklySnapshot(): Promise<void> {
    try {
        const now = new Date();
        const snapshotDate = getWeekStart(now);

        const playerSkills = await db('player_skills')
            .join('players', 'player_skills.player_id', 'players.id')
            .select('player_skills.player_id', 'player_skills.skill_id', 'player_skills.xp');

        for (const ps of playerSkills) {
            await db('skill_snapshots')
                .insert({
                    player_id: ps.player_id,
                    skill_id: ps.skill_id,
                    xp_at_snapshot: ps.xp,
                    snapshot_date: snapshotDate,
                })
                .onConflict(['player_id', 'skill_id', 'snapshot_date'])
                .ignore();
        }

        logger.info(`Weekly snapshot taken for ${playerSkills.length} player skills`);
    } catch (err) {
        logger.error(`Weekly snapshot error: ${err}`);
    }
}

/** Monday midnight on the game clock (lib/gameTime.ts). */
export function getWeekStart(date: Date): Date {
    return startOfGameWeek(date);
}

/**
 * The snapshot this week's gains are counted from: the newest one taken. The
 * board used to ask for the snapshot dated exactly at this week's start, so a
 * week whose snapshot was stamped a little differently (the move to the game
 * clock shifted the stamp by five hours) showed nobody as having gained anything.
 */
export async function currentSnapshotDate(now: Date = new Date()): Promise<Date | null> {
    const row = await db('skill_snapshots').where('snapshot_date', '<=', now).max('snapshot_date as at').first();
    return row?.at ? new Date(row.at) : null;
}

/** Whether this week already has its snapshot. A day's grace covers a stamp from the old server-clock week. */
export async function weekHasSnapshot(now: Date = new Date()): Promise<boolean> {
    const at = await currentSnapshotDate(now);
    return !!at && at.getTime() >= getWeekStart(now).getTime() - 24 * 60 * 60 * 1000;
}