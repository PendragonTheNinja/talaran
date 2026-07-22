import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { botCheckGate } from '../services/botCheck';
import { logger } from '../index';
import {
    getForagingHabitats,
    canForageHere,
    calculateForageTimer,
    bestToolTier,
} from '../services/foraging';
import { levelFromXp } from '../services/xp';

const router = Router();

// Habitats at the player's current location, with unlock + discovery state.
router.get('/habitats', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const player = await db('players').where({ id: playerId }).select('current_location_id').first();
        if (!player) { res.status(404).json({ error: 'Player not found' }); return; }
        const data = await getForagingHabitats(playerId, player.current_location_id);
        res.json(data);
    } catch (err) {
        logger.error(`Get foraging habitats error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Begin foraging a habitat (auto-repeats via the game tick).
router.post('/start', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { habitatId } = req.body;
    try {
        const existing = await db('player_actions').where({ player_id: playerId }).first();
        if (existing) {
            res.status(409).json({ error: 'You are already performing an action' });
            return;
        }

        const { allowed, reason } = await canForageHere(playerId, habitatId);
        if (!allowed) { res.status(403).json({ error: reason }); return; }

        const habitat = await db('foraging_habitats').where({ id: habitatId }).first();
        const foragingSkill = await db('skills').where({ name: 'Foraging' }).first();
        const playerSkill = await db('player_skills')
            .where({ player_id: playerId, skill_id: foragingSkill.id }).first();
        const playerLevel = playerSkill ? levelFromXp(playerSkill.xp) : 1;
        const knifeTier = await bestToolTier(playerId, 'foraging_knife');

        const timerSeconds = calculateForageTimer(
            habitat.base_timer, habitat.min_timer, playerLevel, habitat.required_level, knifeTier
        );

        const now = new Date();
        const completesAt = new Date(now.getTime() + timerSeconds * 1000);

        await db('player_actions').insert({
            player_id: playerId,
            action_type: 'foraging',
            action_data: String(habitatId),
            location_id: habitat.location_id,
            started_at: now,
            completes_at: completesAt,
            auto_restart: true,
            last_bot_check: now,
            bot_check_pending: false,
        });

        logger.info(`Player ${playerId} started foraging habitat ${habitatId}`);
        res.json({ message: 'Foraging started', timerSeconds, completesAt });
    } catch (err) {
        logger.error(`Start foraging error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
