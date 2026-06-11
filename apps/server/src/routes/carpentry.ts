import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { botCheckGate } from '../services/botCheck';
import {
    getCarpentryWorkstation, setupCarpentryWorkstation, canSawHere,
    SAW_RECIPES, WOODWORK_RECIPES,
} from '../services/carpentry';
import { levelFromXp } from '../services/xp';

const router = Router();

async function carpentryLevel(playerId: number): Promise<number> {
    const skill = await db('skills').where({ name: 'Carpentry' }).first();
    const ps = await db('player_skills').where({ player_id: playerId, skill_id: skill.id }).first();
    return ps ? levelFromXp(parseInt(ps.xp)) : 1;
}

// Status at current location
router.get('/status', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const player = await db('players').where({ id: playerId }).first();
        const locationId = player.current_location_id;
        const workstation = await getCarpentryWorkstation(playerId, locationId);
        const access = await canSawHere(playerId, locationId);
        const level = await carpentryLevel(playerId);
        let questStatus = 'none';
        const quest = await db('quests').where({ name: "The Carpenter's Commission" }).first();
        if (quest) {
            const pq = await db('player_quests').where({ player_id: playerId, quest_id: quest.id }).first();
            if (pq) questStatus = pq.status;
        }
        res.json({ workstation, canSaw: access.allowed, usingBench: access.usingBench || false, level, questStatus });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Available recipes + current level
router.get('/recipes', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const level = await carpentryLevel(playerId);
        res.json({ sawRecipes: SAW_RECIPES, woodworkRecipes: WOODWORK_RECIPES, level });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Setup workstation
router.post('/workstation/setup', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const player = await db('players').where({ id: playerId }).first();
        const result = await setupCarpentryWorkstation(playerId, player.current_location_id);
        if (!result.success) {
            res.status(400).json({ error: result.error });
            return;
        }
        res.json({ message: 'Carpentry workstation set up successfully!' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Start sawing logs -> planks
router.post('/saw/start', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { sawKey, actionLimit } = req.body;
    try {
        const player = await db('players').where({ id: playerId }).first();
        const locationId = player.current_location_id;

        const access = await canSawHere(playerId, locationId);
        if (!access.allowed) {
            res.status(403).json({ error: access.error });
            return;
        }

        const recipe = SAW_RECIPES[sawKey];
        if (!recipe) {
            res.status(400).json({ error: 'Unknown wood type.' });
            return;
        }

        const level = await carpentryLevel(playerId);
        if (level < recipe.requiredLevel) {
            res.status(400).json({ error: `You need Carpentry level ${recipe.requiredLevel} to saw this wood.` });
            return;
        }

        for (const ingredient of recipe.ingredients) {
            const item = await db('items').where({ name: ingredient.name }).first();
            if (!item) {
                res.status(400).json({ error: `Required item not found: ${ingredient.name}` });
                return;
            }
            const inv = await db('player_inventory').where({ player_id: playerId, item_id: item.id }).first();
            if (!inv || inv.quantity < ingredient.quantity) {
                res.status(400).json({ error: `You need ${ingredient.quantity}x ${ingredient.name}.` });
                return;
            }
        }

        const existing = await db('player_actions').where({ player_id: playerId }).first();
        if (existing) {
            res.status(409).json({ error: 'You are already performing an action.' });
            return;
        }

        const timerSeconds = access.usingBench ? recipe.timer * 2 : recipe.timer;
        const now = new Date();
        const completesAt = new Date(now.getTime() + timerSeconds * 1000);

        await db('player_actions').insert({
            player_id: playerId,
            action_type: 'sawing',
            resource_node_id: null,
            action_data: sawKey,
            location_id: locationId,
            started_at: now,
            completes_at: completesAt,
            auto_restart: true,
            last_bot_check: now,
            bot_check_pending: false,
            action_limit: actionLimit || null,
            actions_completed: 0,
            using_blacksmith: access.usingBench || false,
        });

        res.json({ message: 'Sawing planks...', timerSeconds, completesAt });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Start woodworking planks -> items
router.post('/woodwork/start', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { recipeKey, actionLimit } = req.body;
    try {
        const player = await db('players').where({ id: playerId }).first();
        const locationId = player.current_location_id;

        const access = await canSawHere(playerId, locationId);
        if (!access.allowed) {
            res.status(403).json({ error: access.error });
            return;
        }

        const recipe = WOODWORK_RECIPES[recipeKey];
        if (!recipe) {
            res.status(400).json({ error: 'Unknown recipe.' });
            return;
        }

        const level = await carpentryLevel(playerId);
        if (level < recipe.requiredLevel) {
            res.status(400).json({ error: `You need Carpentry level ${recipe.requiredLevel}.` });
            return;
        }

        for (const ingredient of recipe.ingredients) {
            const item = await db('items').where({ name: ingredient.name }).first();
            if (!item) {
                res.status(400).json({ error: `Required item not found: ${ingredient.name}` });
                return;
            }
            const inv = await db('player_inventory').where({ player_id: playerId, item_id: item.id }).first();
            if (!inv || inv.quantity < ingredient.quantity) {
                res.status(400).json({ error: `You need ${ingredient.quantity}x ${ingredient.name}.` });
                return;
            }
        }

        const existing = await db('player_actions').where({ player_id: playerId }).first();
        if (existing) {
            res.status(409).json({ error: 'You are already performing an action.' });
            return;
        }

        const timerSeconds = access.usingBench ? recipe.timer * 2 : recipe.timer;
        const now = new Date();
        const completesAt = new Date(now.getTime() + timerSeconds * 1000);

        await db('player_actions').insert({
            player_id: playerId,
            action_type: 'woodworking',
            resource_node_id: null,
            action_data: recipeKey,
            location_id: locationId,
            started_at: now,
            completes_at: completesAt,
            auto_restart: true,
            last_bot_check: now,
            bot_check_pending: false,
            action_limit: actionLimit || null,
            actions_completed: 0,
            using_blacksmith: access.usingBench || false,
        });

        res.json({ message: `Crafting ${recipe.output}...`, timerSeconds, completesAt });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;