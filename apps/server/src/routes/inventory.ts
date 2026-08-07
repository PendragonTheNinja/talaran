import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { LIQUIDS, openUnits } from '../services/liquids';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;

  try {
    const inventory = await db('player_inventory')
      .join('items', 'player_inventory.item_id', 'items.id')
      .where({ 'player_inventory.player_id': playerId })
      .select(
  'player_inventory.id',
  'player_inventory.quantity',
  'items.id as item_id',
  'items.name',
  'items.type',
  'items.subtype',
  'items.quality',
  'items.tier',
  'items.slot',
  'items.level_required',
  'items.description'
);

    // The open container has no player_inventory row — it is a bucket in use, not
    // a bucket held. It rides along as a synthetic tile so the pack shows the
    // whole picture, and because it has no row it cannot be stored, traded or
    // dropped: the "partials don't travel" rule enforces itself.
    const openContainers = [];
    for (const def of Object.values(LIQUIDS)) {
      const units = await openUnits(playerId, def.liquid);
      if (units > 0) {
        openContainers.push({
          id: `open-${def.liquid}`,
          synthetic: true,
          quantity: units,
          capacity: def.per,
          item_id: null,
          name: `${def.empty} (open)`,
          iconName: def.sealed,
          type: 'material',
          subtype: 'liquid_open',
          quality: null,
          tier: 1,
          slot: null,
          level_required: 1,
          description: `An opened bucket with ${units} of ${def.per} measures of ${def.liquid.toLowerCase()} left. It stays with you until it is emptied or filled.`,
        });
      }
    }

    res.json({ inventory, openContainers });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;