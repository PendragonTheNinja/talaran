import db from '../db';
import { logger } from '../lib/logger';

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

export function getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
}