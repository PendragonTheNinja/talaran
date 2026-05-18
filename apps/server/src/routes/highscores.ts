import { Router, Response, Request } from 'express';
import db from '../db';
import { logger } from '../lib/logger';
import { getWeekStart } from '../services/weeklySnapshot';

const router = Router();

function levelFromXp(xp: number): number {
    let level = 1;
    let xpNeeded = 100;
    while (xp >= xpNeeded && level < 120) {
        xp -= xpNeeded;
        level++;
        xpNeeded = Math.floor(xpNeeded * 1.15);
    }
    return level;
}

// Get all skills for the selector
router.get('/skills', async (req: Request, res: Response) => {
    try {
        const skills = await db('skills').orderBy('name', 'asc').select('id', 'name');
        res.json({ skills });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get highscores
router.get('/', async (req: Request, res: Response) => {
    try {
        const skillId = req.query.skill as string; // 'total' or skill id
        const mode = req.query.mode as string || 'alltime'; // 'alltime' or 'weekly'
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = (page - 1) * limit;
        const sortBy = req.query.sortBy as string || 'xp'; // 'xp', 'level', 'weekly_xp', 'weekly_levels'

        if (skillId === 'total') {
            // Total level leaderboard
            const players = await db('player_skills')
                .join('players', 'player_skills.player_id', 'players.id')
                .groupBy('players.id', 'players.username', 'players.guild_tag')
                .select(
                    'players.id',
                    'players.username',
                    'players.guild_tag',
                    db.raw('SUM(player_skills.xp) as total_xp'),
                    db.raw('COUNT(player_skills.skill_id) as skill_count'),
                )
                .orderBy('total_xp', 'desc')
                .limit(limit)
                .offset(offset);

            const totalCount = await db('players').count('id as count').first();

            // Calculate total levels
            const playersWithLevels = await Promise.all(players.map(async (p, i) => {
                const skills = await db('player_skills')
                    .where({ player_id: p.id })
                    .select('xp');
                const totalLevel = skills.reduce((sum, s) => sum + levelFromXp(parseInt(s.xp)), 0);

                let weeklyXp = 0;
                let weeklyLevels = 0;

                if (mode === 'weekly') {
                    const weekStart = getWeekStart(new Date());
                    const snapshots = await db('skill_snapshots')
                        .where({ player_id: p.id, snapshot_date: weekStart })
                        .select('skill_id', 'xp_at_snapshot');

                    const currentSkills = await db('player_skills')
                        .where({ player_id: p.id })
                        .select('skill_id', 'xp');

                    for (const current of currentSkills) {
                        const snap = snapshots.find(s => s.skill_id === current.skill_id);
                        const snapXp = snap ? parseInt(snap.xp_at_snapshot) : 0;
                        const currentXp = parseInt(current.xp);
                        const gained = Math.max(0, currentXp - snapXp);
                        weeklyXp += gained;
                        if (gained > 0) {
                            const levelBefore = levelFromXp(snapXp);
                            const levelAfter = levelFromXp(currentXp);
                            weeklyLevels += Math.max(0, levelAfter - levelBefore);
                        }
                    }
                }

                return {
                    rank: offset + i + 1,
                    id: p.id,
                    username: p.username,
                    guildTag: p.guild_tag,
                    totalLevel,
                    totalXp: parseInt(p.total_xp as string),
                    weeklyXp,
                    weeklyLevels,
                };
            }));

            res.json({
                players: playersWithLevels,
                totalCount: parseInt(totalCount?.count as string) || 0,
                page,
                totalPages: Math.ceil((parseInt(totalCount?.count as string) || 0) / limit),
            });

        } else {
            // Single skill leaderboard
            let query = db('player_skills')
                .join('players', 'player_skills.player_id', 'players.id')
                .join('skills', 'player_skills.skill_id', 'skills.id')
                .where('player_skills.skill_id', skillId)
                .where('player_skills.xp', '>', 0)
                .select(
                    'players.id',
                    'players.username',
                    'players.guild_tag',
                    'player_skills.xp',
                    'player_skills.skill_id',
                );

            if (mode === 'weekly') {
                const weekStart = getWeekStart(new Date());
                const snapshots = await db('skill_snapshots')
                    .where({ skill_id: skillId, snapshot_date: weekStart })
                    .select('player_id', 'xp_at_snapshot');

                const snapshotMap = new Map(snapshots.map(s => [s.player_id, parseInt(s.xp_at_snapshot)]));

                const allPlayers = await query;
                const withWeekly = allPlayers.map(p => {
                    const snapXp = snapshotMap.get(p.id) || 0;
                    const currentXp = parseInt(p.xp);
                    const weeklyXp = Math.max(0, currentXp - snapXp);
                    const levelBefore = levelFromXp(snapXp);
                    const levelAfter = levelFromXp(currentXp);
                    const weeklyLevels = Math.max(0, levelAfter - levelBefore);
                    return {
                        ...p,
                        level: levelFromXp(currentXp),
                        weeklyXp,
                        weeklyLevels,
                    };
                }).filter(p => p.weeklyXp > 0)
                    .sort((a, b) => b.weeklyXp - a.weeklyXp);

                const paginated = withWeekly.slice(offset, offset + limit);
                const ranked = paginated.map((p, i) => ({
                    rank: offset + i + 1,
                    id: p.id,
                    username: p.username,
                    guildTag: p.guild_tag,
                    level: p.level,
                    xp: parseInt(p.xp),
                    weeklyXp: p.weeklyXp,
                    weeklyLevels: p.weeklyLevels,
                }));

                res.json({
                    players: ranked,
                    totalCount: withWeekly.length,
                    page,
                    totalPages: Math.ceil(withWeekly.length / limit),
                });

            } else {
                const allPlayers = await query.orderBy('player_skills.xp', 'desc');
                const totalCount = allPlayers.length;
                const paginated = allPlayers.slice(offset, offset + limit);

                const ranked = paginated.map((p, i) => ({
                    rank: offset + i + 1,
                    id: p.id,
                    username: p.username,
                    guildTag: p.guild_tag,
                    level: levelFromXp(parseInt(p.xp)),
                    xp: parseInt(p.xp),
                    weeklyXp: 0,
                    weeklyLevels: 0,
                }));

                res.json({
                    players: ranked,
                    totalCount,
                    page,
                    totalPages: Math.ceil(totalCount / limit),
                });
            }
        }
    } catch (err) {
        logger.error(`Highscores error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;