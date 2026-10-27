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
  'items.description',
  // So the tooltip can say what a provision actually does. Read live rather
  // than written into the description, which would go stale the moment a
  // magnitude is tuned in the admin panel.
  'items.buff_effect',
  'items.buff_skill',
  'items.buff_magnitude',
  'items.buff_seconds',
  // Food that mends (docs/combat-spec.md §10), eaten from the pack too.
  'items.heal_amount'
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

    // The gem being filled at a rift has left the pack the same way
    // (services/talar.ts), so it rides along as a pinned tile too.
    const openGem = await db('player_talar_open_gem as o')
      .join('items as i', 'i.id', 'o.item_id')
      .where('o.player_id', playerId)
      .first('i.name', 'i.subtype', 'i.quality', 'i.tier', 'i.talar', 'o.filled_hundredths');
    if (openGem) {
      const filled = Math.floor(Number(openGem.filled_hundredths) / 100);
      openContainers.push({
        id: 'open-gem',
        synthetic: true,
        quantity: filled,
        capacity: Number(openGem.talar),
        item_id: null,
        name: `${openGem.name} (filling)`,
        iconName: openGem.name,
        type: 'gem',
        subtype: openGem.subtype,
        quality: openGem.quality,
        tier: openGem.tier,
        slot: null,
        level_required: 1,
        description: `A ${openGem.name.toLowerCase()} taking in light: ${filled} of ${openGem.talar} Talar so far. It stays in your hand until it is full.`,
      });
    }

    res.json({ inventory, openContainers });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;