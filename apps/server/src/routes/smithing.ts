import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import {
  getWorkstation, setupWorkstation,
  loadKiln, collectKiln, getKilnStatus, getLogCountsByQuality,
  smeltIngots, smithPart, getSmithingCost,
  canSmithHere, SMELT_RECIPES, SMITH_RECIPES,
} from '../services/smithing';
import { levelFromXp } from '../services/xp';
import { logger } from '../index';
import { botCheckGate } from '../services/botCheck';

const router = Router();

// Get smithing status at current location
router.get('/status', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  try {
    const player = await db('players').where({ id: playerId }).first();
    const locationId = player.current_location_id;
    const workstation = await getWorkstation(playerId, locationId);
    const kilnStatus = await getKilnStatus(playerId, locationId);

    // Get max logs for this player
    const smithingSkill = await db('skills').where({ name: 'Smithing' }).first();
    const playerSkill = await db('player_skills')
      .where({ player_id: playerId, skill_id: smithingSkill.id })
      .first();
    const playerLevel = playerSkill ? levelFromXp(parseInt(playerSkill.xp)) : 1;
    const maxBatches = playerLevel >= 40 ? 5
      : playerLevel >= 30 ? 4
        : playerLevel >= 20 ? 3
          : playerLevel >= 10 ? 2
            : 1;
    const maxLogs = maxBatches * 20;

    const logCounts = await getLogCountsByQuality(playerId);
    res.json({ workstation, kilnStatus, maxLogs, logCounts, kilnRates: { poor: 60, fine: 80, excellent: 100 } });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Setup workstation
router.post('/workstation/setup', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  try {
    const player = await db('players').where({ id: playerId }).first();
    const result = await setupWorkstation(playerId, player.current_location_id);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ message: 'Workstation set up successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Load kiln
router.post('/kiln/load', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const { logCount, quality } = req.body;
  try {
    const player = await db('players').where({ id: playerId }).first();
    const result = await loadKiln(playerId, player.current_location_id, logCount, quality);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ message: `Kiln loaded! Charc will be ready at ${result.readyAt}`, readyAt: result.readyAt });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Collect kiln
router.post('/kiln/collect/start', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  try {
    const player = await db('players').where({ id: playerId }).first();
    const locationId = player.current_location_id;

    const job = await db('kiln_jobs')
      .where({ player_id: playerId, location_id: locationId, is_collected: false })
      .first();

    if (!job) {
      res.status(400).json({ error: 'No active kiln job here.' });
      return;
    }

    const now = new Date();
    if (now < new Date(job.ready_at)) {
      const remaining = Math.ceil((new Date(job.ready_at).getTime() - now.getTime()) / 60000);
      res.status(400).json({ error: `Charc not ready yet. ${remaining} minutes remaining.` });
      return;
    }

    const existing = await db('player_actions').where({ player_id: playerId }).first();
    if (existing) {
      res.status(409).json({ error: 'You are already performing an action.' });
      return;
    }

    const timerSeconds = job.charc_yield;
    const completesAt = new Date(now.getTime() + timerSeconds * 1000);

    await db('player_actions').insert({
      player_id: playerId,
      action_type: 'kiln_collect',
      resource_node_id: null,
      action_data: String(job.id),
      location_id: locationId,
      started_at: now,
      completes_at: completesAt,
      auto_restart: false,
      last_bot_check: now,
      bot_check_pending: false,
    });

    res.json({ message: 'Collecting Charc...', timerSeconds, completesAt });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Start smelting action
router.post('/smelt/start', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const { metalType, actionLimit } = req.body;
  try {
    const player = await db('players').where({ id: playerId }).first();
    const locationId = player.current_location_id;
    const canSmith = await canSmithHere(playerId, locationId);
    if (!canSmith.allowed) {
      res.status(403).json({ error: canSmith.error });
      return;
    }

    const recipe = SMELT_RECIPES[metalType];
    if (!recipe) {
      res.status(400).json({ error: 'Unknown metal type.' });
      return;
    }
    for (const ingredient of recipe.ingredients) {
      const item = await db('items').where({ name: ingredient.name }).first();
      if (!item) {
        res.status(400).json({ error: `Required item not found: ${ingredient.name}` });
        return;
      }
      const inv = await db('player_inventory')
        .where({ player_id: playerId, item_id: item.id })
        .first();
      if (!inv || inv.quantity < ingredient.quantity) {
        res.status(400).json({ error: `You need ${ingredient.quantity}x ${ingredient.name} to smelt ${metalType} ingots.` });
        return;
      }
    }

    const existing = await db('player_actions').where({ player_id: playerId }).first();
    if (existing) {
      res.status(409).json({ error: 'You are already performing an action.' });
      return;
    }

    // 2x timer if using blacksmith
    const baseTimer = recipe.timer;
    const timerSeconds = canSmith.usingBlacksmith ? baseTimer * 2 : baseTimer;
    const now = new Date();
    const completesAt = new Date(now.getTime() + timerSeconds * 1000);

    await db('player_actions').insert({
      player_id: playerId,
      action_type: 'smelting',
      resource_node_id: null,
      action_data: metalType,
      location_id: locationId,
      started_at: now,
      completes_at: completesAt,
      auto_restart: true,
      last_bot_check: now,
      bot_check_pending: false,
      action_limit: actionLimit || null,
      actions_completed: 0,
      using_blacksmith: canSmith.usingBlacksmith || false,
    });

    res.json({ message: `Smelting ${metalType} ingots...`, timerSeconds, completesAt });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Start smithing part action
router.post('/smith/start', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const { partType, metalType, actionLimit } = req.body;
  try {
    const player = await db('players').where({ id: playerId }).first();
    const locationId = player.current_location_id;

    const canSmith = await canSmithHere(playerId, locationId);
    if (!canSmith.allowed) {
      res.status(403).json({ error: canSmith.error });
      return;
    }

    const existing = await db('player_actions').where({ player_id: playerId }).first();
    if (existing) {
      res.status(409).json({ error: 'You are already performing an action.' });
      return;
    }

    // Check ingredients before starting
    const recipe = SMITH_RECIPES[`${metalType}_${partType}`];
    if (!recipe) {
      res.status(400).json({ error: 'Unknown recipe.' });
      return;
    }

    for (const ingredient of recipe.ingredients) {
      const item = await db('items').where({ name: ingredient.name }).first();
      if (!item) {
        res.status(400).json({ error: `Required item not found: ${ingredient.name}` });
        return;
      }
      const inv = await db('player_inventory')
        .where({ player_id: playerId, item_id: item.id })
        .first();
      if (!inv || inv.quantity < ingredient.quantity) {
        res.status(400).json({ error: `You need ${ingredient.quantity}x ${ingredient.name}.` });
        return;
      }
    }

    const smithCost = getSmithingCost(`${metalType}_${partType}`)
    const baseTimer = smithCost.timer
    const timerSeconds = canSmith.usingBlacksmith ? baseTimer * 2 : baseTimer
    const now = new Date();
    const completesAt = new Date(now.getTime() + timerSeconds * 1000);

    await db('player_actions').insert({
      player_id: playerId,
      action_type: 'smithing',
      resource_node_id: null,
      action_data: `${metalType}_${partType}`,
      location_id: locationId,
      started_at: now,
      completes_at: completesAt,
      auto_restart: true,
      last_bot_check: now,
      bot_check_pending: false,
      action_limit: actionLimit || null,
      actions_completed: 0,
      using_blacksmith: canSmith.usingBlacksmith || false,
    });

    res.json({ message: `Smithing ${metalType} ${partType}...`, timerSeconds, completesAt });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get available recipes at current location
router.get('/recipes', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  try {
    const player = await db('players').where({ id: playerId }).first();
    const smithingSkill = await db('skills').where({ name: 'Smithing' }).first();
    const playerSkill = await db('player_skills')
      .where({ player_id: playerId, skill_id: smithingSkill.id })
      .first();
    const playerLevel = playerSkill ? levelFromXp(parseInt(playerSkill.xp)) : 1;

    // For now return Ambren recipes
    const recipes = {
      smelt: [
        {
          key: 'ambren',
          name: 'Ambren Ingot',
          ingredients: [
            { name: 'Ambren Ore', quantity: 1 },
            { name: 'Burgh Ore', quantity: 1 },
            { name: 'Charc', quantity: 2 },
          ],
          outputQuantity: 2,
          requiredLevel: 1,
          canMake: playerLevel >= 1,
        },
      ],
      smith: [
        {
          key: 'ambren_pickaxe_head',
          name: 'Ambren Pickaxe Head',
          partType: 'pickaxe_head',
          metalType: 'ambren',
          ingredients: [{ name: 'Ambren Ingot', quantity: 2 }],
          requiredLevel: 1,
          canMake: playerLevel >= 1,
        },
        {
          key: 'ambren_hatchet_head',
          name: 'Ambren Hatchet Head',
          partType: 'hatchet_head',
          metalType: 'ambren',
          ingredients: [{ name: 'Ambren Ingot', quantity: 2 }],
          requiredLevel: 1,
          canMake: playerLevel >= 1,
        },
        {
          key: 'ambren_tool_rod',
          name: 'Ambren Tool Rod',
          partType: 'tool_rod',
          metalType: 'ambren',
          ingredients: [{ name: 'Ambren Ingot', quantity: 1 }],
          requiredLevel: 1,
          canMake: playerLevel >= 1,
        },
      ],
    };

    res.json({ recipes, playerLevel });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;