import { Router, Response, NextFunction } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { SERVER_ERROR } from '../lib/serviceResult';

// The admin panel's Quests tab (AdminQuests.tsx): everything an NPC says and
// every quest's words, gathered by NPC so text can be touched up without a
// migration. Read-only here: every edit is saved through the content
// browser's own PATCH (/api/admin/content/table/:name/:id), so it is checked,
// logged in content_changes, and revertible the same way. Admin-only.

const router = Router();

async function adminOnly(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const player = await db('players').where({ id: req.player!.playerId }).first('is_admin');
        if (!player?.is_admin) { res.status(403).json({ error: 'Admins only.' }); return; }
        next();
    } catch (err) {
        logger.error(`admin quests gate: ${err}`);
        res.status(500).json({ error: SERVER_ERROR });
    }
}

router.use(requireAuth, adminOnly);

const parsed = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);

router.get('/', async (_req: AuthRequest, res: Response) => {
    try {
        const npcs = await db('npcs as n').leftJoin('locations as l', 'l.id', 'n.location_id')
            .orderBy('l.region').orderBy('n.name')
            .select('n.id', 'n.name', 'n.title', 'n.avatar', 'n.is_active', 'n.errand_pool', 'n.daily_skill', 'n.daily_chatter', 'l.name as location', 'l.region as island');
        const dialogues = await db('npc_dialogues').orderBy('id').select('id', 'npc_id', 'stage_key', 'text_lines', 'options');
        const rare = await db('npc_rare_lines').orderBy('id').select('id', 'npc_id', 'line', 'chance_one_in', 'is_active');
        const quests = await db('quests').orderBy('id').select('id', 'name', 'description', 'npc_name', 'location_id', 'is_active', 'stage_prefix');
        const objectives = await db('quest_objectives').orderBy(['quest_id', 'order']).select('id', 'quest_id', 'order', 'description', 'type', 'target_item', 'required_amount');
        const errands = await db('errands').orderBy('id').select('id', 'key', 'pool', 'name', 'legs', 'is_active');
        const daily = await db('daily_tasks').orderBy('id').select('id', 'npc_name', 'item_name', 'quantity', 'ask', 'thanks', 'is_active');

        res.json({
            npcs: npcs.map((n: any) => ({
                ...n,
                daily_chatter: n.daily_chatter ? parsed(n.daily_chatter) : null,
                dialogues: dialogues.filter((d: any) => d.npc_id === n.id).map((d: any) => ({ ...d, options: parsed(d.options) ?? [] })),
                rareLines: rare.filter((r: any) => r.npc_id === n.id),
                quests: quests.filter((q: any) => q.npc_name === n.name).map((q: any) => ({
                    ...q, objectives: objectives.filter((o: any) => o.quest_id === q.id),
                })),
                errands: n.errand_pool ? errands.filter((e: any) => e.pool === n.errand_pool).map((e: any) => ({ ...e, legs: parsed(e.legs) }))
                    .filter((e: any) => e.legs.some((l: any) => l.from === n.name || l.to === n.name)) : [],
                dailyTasks: daily.filter((t: any) => t.npc_name === n.name).map((t: any) => ({ ...t, ask: parsed(t.ask), thanks: parsed(t.thanks) })),
            })),
        });
    } catch (err) {
        logger.error(`admin quests read: ${err}`);
        res.status(500).json({ error: SERVER_ERROR });
    }
});

export default router;
