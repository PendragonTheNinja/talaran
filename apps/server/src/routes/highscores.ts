import { Router, Response, Request } from 'express';
import db from '../db';
import { logger } from '../lib/logger';
import { getWeekStart } from '../services/weeklySnapshot';
import { levelFromXp } from '../services/xp';

const router = Router();

// Get all skills for the selector
router.get('/skills', async (req: Request, res: Response) => {
    try {
        const skills = await db('skills').where('is_implemented', true).orderBy('name', 'asc').select('id', 'name');
        res.json({ skills });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

type SortBy = 'level' | 'xp' | 'weeklyXp' | 'weeklyLevels';

interface Computed {
    id: number;
    username: string;
    guildTag: string | null;
    level: number;
    xp: number;
    weeklyXp: number;
    weeklyLevels: number;
}

function sortRows(rows: Computed[], sortBy: SortBy, dir: 1 | -1): Computed[] {
    const key = (r: Computed): number => {
        switch (sortBy) {
            case 'xp': return r.xp;
            case 'weeklyXp': return r.weeklyXp;
            case 'weeklyLevels': return r.weeklyLevels;
            case 'level':
            default: return r.level;
        }
    };
    return rows.sort((a, b) => {
        const d = (key(a) - key(b)) * dir;
        if (d !== 0) return d;
        if (b.level !== a.level) return b.level - a.level;
        if (b.xp !== a.xp) return b.xp - a.xp;
        return a.username.localeCompare(b.username);
    });
}

router.get('/', async (req: Request, res: Response) => {
    try {
        const skillId = req.query.skill as string;                 // 'total' or skill id
        const mode = (req.query.mode as string) || 'alltime';      // 'alltime' or 'weekly'
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = (page - 1) * limit;

        // Default ordering: Total Level all-time, weekly XP in the weekly view.
        const requestedSort = req.query.sortBy as SortBy | undefined;
        const sortBy: SortBy = requestedSort ?? (mode === 'weekly' ? 'weeklyXp' : 'level');
        const dir: 1 | -1 = (req.query.sortDir as string) === 'asc' ? 1 : -1;

        const weekStart = mode === 'weekly' ? getWeekStart(new Date()) : null;

        if (skillId === 'total') {
            const rows = await db('player_skills')
                .join('players', 'player_skills.player_id', 'players.id')
                // Guests are hidden from the boards. A throwaway session should
                // never take a rank from someone who earned it, and the name
                // would vanish from the table a week later regardless.
                .where('players.is_guest', false)
                .select(
                    'players.id',
                    'players.username',
                    'players.guild_tag',
                    'player_skills.skill_id',
                    'player_skills.xp',
                );

            const byPlayer = new Map<number, Computed & { skills: { skill_id: number; xp: number }[] }>();
            for (const r of rows) {
                const xp = parseInt(r.xp);
                let p = byPlayer.get(r.id);
                if (!p) {
                    p = { id: r.id, username: r.username, guildTag: r.guild_tag, level: 0, xp: 0, weeklyXp: 0, weeklyLevels: 0, skills: [] };
                    byPlayer.set(r.id, p);
                }
                p.xp += xp;
                p.level += levelFromXp(xp);
                p.skills.push({ skill_id: r.skill_id, xp });
            }

            if (weekStart) {
                const snaps = await db('skill_snapshots')
                    .where({ snapshot_date: weekStart })
                    .select('player_id', 'skill_id', 'xp_at_snapshot');
                const snapMap = new Map<string, number>();
                for (const s of snaps) snapMap.set(`${s.player_id}:${s.skill_id}`, parseInt(s.xp_at_snapshot));
                for (const p of byPlayer.values()) {
                    for (const sk of p.skills) {
                        const snapXp = snapMap.get(`${p.id}:${sk.skill_id}`) || 0;
                        const gained = Math.max(0, sk.xp - snapXp);
                        p.weeklyXp += gained;
                        if (gained > 0) p.weeklyLevels += Math.max(0, levelFromXp(sk.xp) - levelFromXp(snapXp));
                    }
                }
            }

            const all = sortRows([...byPlayer.values()], sortBy, dir);
            const totalCount = all.length;
            const players = all.slice(offset, offset + limit).map((p, i) => ({
                rank: offset + i + 1,
                id: p.id,
                username: p.username,
                guildTag: p.guildTag,
                totalLevel: p.level,
                totalXp: p.xp,
                weeklyXp: p.weeklyXp,
                weeklyLevels: p.weeklyLevels,
            }));

            res.json({ players, totalCount, page, totalPages: Math.ceil(totalCount / limit) });
            return;
        }

        // Single-skill board
        const skillRows = await db('player_skills')
            .join('players', 'player_skills.player_id', 'players.id')
            .where('players.is_guest', false)
            .where('player_skills.skill_id', skillId)
            .where('player_skills.xp', '>', 0)
            .select('players.id', 'players.username', 'players.guild_tag', 'player_skills.xp');

        let snapMap = new Map<number, number>();
        if (weekStart) {
            const snaps = await db('skill_snapshots')
                .where({ skill_id: skillId, snapshot_date: weekStart })
                .select('player_id', 'xp_at_snapshot');
            snapMap = new Map(snaps.map(s => [s.player_id, parseInt(s.xp_at_snapshot)]));
        }

        let computed: Computed[] = skillRows.map(p => {
            const xp = parseInt(p.xp);
            const snapXp = snapMap.get(p.id) || 0;
            const weeklyXp = Math.max(0, xp - snapXp);
            const weeklyLevels = Math.max(0, levelFromXp(xp) - levelFromXp(snapXp));
            return { id: p.id, username: p.username, guildTag: p.guild_tag, level: levelFromXp(xp), xp, weeklyXp, weeklyLevels };
        });

        if (weekStart) computed = computed.filter(p => p.weeklyXp > 0);

        const all = sortRows(computed, sortBy, dir);
        const totalCount = all.length;
        const players = all.slice(offset, offset + limit).map((p, i) => ({
            rank: offset + i + 1,
            id: p.id,
            username: p.username,
            guildTag: p.guildTag,
            level: p.level,
            xp: p.xp,
            weeklyXp: p.weeklyXp,
            weeklyLevels: p.weeklyLevels,
        }));

        res.json({ players, totalCount, page, totalPages: Math.ceil(totalCount / limit) });
    } catch (err) {
        logger.error(`Highscores error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
