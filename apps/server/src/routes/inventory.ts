import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { LIQUIDS, openUnits } from '../services/liquids';
import { chargedNameFor, cutGradeOf } from '../lib/gemGrades';

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
  'items.heal_amount',
  // Light a charged gem holds, so tapping one can say how much before it is
  // taken in (LeftPanel's confirmation).
  'items.talar'
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

    // Gems part-filled at a rift have left the pack the same way
    // (services/talar.ts), so each rides along as a pinned tile too: one per
    // kind, since a player may set one stone down and take up another.
    const openGems = await db('player_talar_open_gem as o')
      .join('items as i', 'i.id', 'o.item_id')
      .where('o.player_id', playerId)
      .orderBy([{ column: 'i.tier' }, { column: 'i.talar' }])
      .select('i.id as item_id', 'i.name', 'i.subtype', 'i.quality', 'i.tier', 'i.talar', 'o.filled_hundredths');
    for (const openGem of openGems) {
      const filled = Math.floor(Number(openGem.filled_hundredths) / 100);
      openContainers.push({
        id: `open-gem-${openGem.item_id}`,
        synthetic: true,
        quantity: filled,
        capacity: Number(openGem.talar),
        item_id: null,
        name: `${openGem.name} (filling)`,
        iconName: openGem.name,
        // What it becomes when full, so the tile can fill toward it (FillingGem.tsx).
        fillIconName: chargedNameFor(openGem.name, Math.max(0, cutGradeOf(openGem.quality))),
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