import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import {
  getWorkstation, setupWorkstation,
  loadKiln, collectKiln, getKilnStatus,
  smeltIngots, smithPart, combineTool,
  canSmithHere, SMELT_RECIPES,
} from '../services/smithing';
import { levelFromXp } from '../services/xp';
import { logger } from '../index';

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

    res.json({ workstation, kilnStatus, maxLogs });
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
  const { logCount } = req.body;
  try {
    const player = await db('players').where({ id: playerId }).first();
    const result = await loadKiln(playerId, player.current_location_id, logCount);
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
router.post('/kiln/collect/start', requireAuth, async (req: AuthRequest, res: Response) => {
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
router.post('/smelt/start', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const { metalType } = req.body;
  console.log('Smelt start called, playerId:', playerId, 'metalType:', metalType);
  
  try {
    const player = await db('players').where({ id: playerId }).first();
    const locationId = player.current_location_id;
    console.log('Location ID:', locationId);

    const canSmith = await canSmithHere(playerId, locationId);
    console.log('Can smith:', canSmith);
    if (!canSmith.allowed) {
      res.status(403).json({ error: canSmith.error });
      return;
    }

    // Check ingredients before starting
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
console.log('Existing action:', existing);

const timerSeconds = 10;
const now = new Date();
const completesAt = new Date(now.getTime() + timerSeconds * 1000);
console.log('About to insert action');

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
});

console.log('Action inserted successfully');

    res.json({ message: `Smelting ${metalType} ingots...`, timerSeconds, completesAt });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Start smithing part action
router.post('/smith/start', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const { partType, metalType } = req.body;
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

    const timerSeconds = 20; // smithing timer — longer than smelting
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
    });

    res.json({ message: `Smithing ${metalType} ${partType}...`, timerSeconds, completesAt });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Combine tool parts into a tool instance
router.post('/combine', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const { toolName, headPartId, rodPartId } = req.body;
  try {
    const result = await combineTool(playerId, toolName, headPartId, rodPartId);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ message: `${toolName} created!`, toolInstanceId: result.toolInstanceId });
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