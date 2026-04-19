import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { levelFromXp } from '../services/xp';
import { logger } from '../index';

const router = Router();

// Get player equipment
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;

  try {
    let equipment = await db('player_equipment').where({ player_id: playerId }).first();

    if (!equipment) {
      await db('player_equipment').insert({ player_id: playerId });
      equipment = await db('player_equipment').where({ player_id: playerId }).first();
    }

    const slots = ['head', 'neck', 'back', 'chest', 'mainhand', 'offhand', 'legs', 'hands', 'feet', 'finger', 'mount', 'trophy'];
    const equipped: Record<string, any> = {};

    for (const slot of slots) {
      const itemId = equipment[`${slot}_item_id`];
      if (itemId) {
        const item = await db('items').where({ id: itemId }).first();
        equipped[slot] = item || null;
      } else {
        equipped[slot] = null;
      }
    }

    res.json({ equipment: equipped });
  } catch (err) {
    logger.error(`Get equipment error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Equip an item
router.post('/equip', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const { itemId } = req.body;

  if (!itemId) {
    res.status(400).json({ error: 'itemId is required' });
    return;
  }

  try {
    const item = await db('items').where({ id: itemId }).first();
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    if (!item.slot) {
      res.status(400).json({ error: 'This item cannot be equipped' });
      return;
    }

    // Check item is in player inventory
    const inInventory = await db('player_inventory')
      .where({ player_id: playerId, item_id: itemId })
      .first();

    if (!inInventory) {
      res.status(400).json({ error: 'You do not have this item' });
      return;
    }

    // Check level requirement using the relevant skill
    // For now use woodcutting level for axes, we'll generalize later
    if (item.level_required > 1) {
      const skillName = item.subtype === 'axe' ? 'Woodcutting'
        : item.subtype === 'pickaxe' ? 'Mining'
        : null;

      if (skillName) {
        const skill = await db('skills').where({ name: skillName }).first();
        const playerSkill = await db('player_skills')
          .where({ player_id: playerId, skill_id: skill.id })
          .first();
        const playerLevel = levelFromXp(playerSkill?.xp ? parseInt(playerSkill.xp) : 0);

        if (playerLevel < item.level_required) {
          res.status(403).json({ error: `You need ${skillName} level ${item.level_required} to equip this` });
          return;
        }
      }
    }

    // Get or create equipment row
    let equipment = await db('player_equipment').where({ player_id: playerId }).first();
    if (!equipment) {
      await db('player_equipment').insert({ player_id: playerId });
      equipment = await db('player_equipment').where({ player_id: playerId }).first();
    }

    // If something is already in the slot, move it back to inventory
    const currentItemId = equipment[`${item.slot}_item_id`];
    if (currentItemId && currentItemId !== itemId) {
      const existingInInventory = await db('player_inventory')
        .where({ player_id: playerId, item_id: currentItemId })
        .first();

      if (existingInInventory) {
        await db('player_inventory')
          .where({ player_id: playerId, item_id: currentItemId })
          .increment('quantity', 1);
      } else {
        await db('player_inventory').insert({
          player_id: playerId,
          item_id: currentItemId,
          quantity: 1,
        });
      }
    }

    // Remove new item from inventory
    if (inInventory.quantity > 1) {
      await db('player_inventory')
        .where({ player_id: playerId, item_id: itemId })
        .decrement('quantity', 1);
    } else {
      await db('player_inventory')
        .where({ player_id: playerId, item_id: itemId })
        .delete();
    }

    // Equip the item
    await db('player_equipment')
      .where({ player_id: playerId })
      .update({ [`${item.slot}_item_id`]: itemId });

    logger.info(`Player ${playerId} equipped ${item.name} in ${item.slot}`);
    res.json({ message: `${item.name} equipped`, slot: item.slot });

  } catch (err) {
    logger.error(`Equip error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Unequip an item
router.post('/unequip', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const { slot } = req.body;

  if (!slot) {
    res.status(400).json({ error: 'slot is required' });
    return;
  }

  try {
    const equipment = await db('player_equipment').where({ player_id: playerId }).first();
    if (!equipment) {
      res.status(404).json({ error: 'No equipment found' });
      return;
    }

    const itemId = equipment[`${slot}_item_id`];
    if (!itemId) {
      res.status(400).json({ error: 'Nothing equipped in that slot' });
      return;
    }

    const item = await db('items').where({ id: itemId }).first();

    // Move item back to inventory
    const existingInInventory = await db('player_inventory')
      .where({ player_id: playerId, item_id: itemId })
      .first();

    if (existingInInventory) {
      await db('player_inventory')
        .where({ player_id: playerId, item_id: itemId })
        .increment('quantity', 1);
    } else {
      await db('player_inventory').insert({
        player_id: playerId,
        item_id: itemId,
        quantity: 1,
      });
    }

    // Clear the slot
    await db('player_equipment')
      .where({ player_id: playerId })
      .update({ [`${slot}_item_id`]: null });

    logger.info(`Player ${playerId} unequipped ${item.name} from ${slot}`);
    res.json({ message: `${item.name} unequipped`, slot });

  } catch (err) {
    logger.error(`Unequip error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;