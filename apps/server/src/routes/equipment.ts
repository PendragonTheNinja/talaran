import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { addItemToInventoryWithin } from '../services/inventory';
import { combatLevels, combatProfile, CombatProfile, COMBAT_SKILLS } from '../services/combat';
import { VALID_SLOTS, ensureEquipmentRow, equipLevelRefusal, wearFromPackWithin } from '../services/equipment';

const router = Router();

// The slots, the level gate and the swap itself live in services/equipment.ts,
// shared with gear going back on after a death (restoreDeathLoadoutWithin).

/**
 * A refusal from inside an equipment transaction.
 *
 * Returning from a db.transaction callback COMMITS it; only a throw rolls back.
 * So a transaction that decides, partway through, that the move is not allowed
 * throws this, and the route turns it into the right status. The same pattern
 * as TradeAbort in routes/trades.ts.
 */
class EquipAbort extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/**
 * The authoritative slot map for a player.
 *
 * Shared by the GET and by both mutations. Equip and unequip used to answer
 * with a message and leave the client to re-fetch equipment and inventory as
 * two separate un-awaited calls, which is a race: if either landed late or out
 * of order, the screen kept showing the item that used to be in the slot.
 *
 * That is the shape of the bug where a Feed Pail "vanished". The pail was in
 * the pack the whole time and the slot really did hold what the server said;
 * the screen was simply describing a moment that had passed. Returning the new
 * state with the write removes the window entirely.
 */
async function loadEquipment(playerId: number): Promise<Record<string, unknown>> {
  const equipment = await ensureEquipmentRow(playerId);

  const equippedIds = VALID_SLOTS
    .map((slot) => equipment[`${slot}_item_id`])
    .filter((id): id is number => !!id);

  const items = equippedIds.length
    ? await db('items').whereIn('id', equippedIds)
    : [];

  const byId = new Map(items.map((item) => [item.id, item]));

  const equipped: Record<string, unknown> = {};
  for (const slot of VALID_SLOTS) {
    const itemId = equipment[`${slot}_item_id`];
    equipped[slot] = itemId ? byId.get(itemId) ?? null : null;
  }
  return equipped;
}

/**
 * The slot map and the fighting numbers it gives (services/combat.ts), sent
 * together by every equipment response so the panel never works them out.
 */
async function equipmentState(playerId: number): Promise<{ equipment: Record<string, any>; combat: CombatProfile }> {
  const [equipment, levels] = await Promise.all([loadEquipment(playerId), combatLevels(playerId)]);
  return { equipment, combat: combatProfile(levels, equipment as Record<string, any>) };
}

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;

  try {
    res.json(await equipmentState(playerId));
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

    // item.slot is interpolated into a column name below. A typo in a seed or in
    // the admin content editor would otherwise produce a database error rather
    // than a clean refusal.
    if (!(VALID_SLOTS as readonly string[]).includes(item.slot)) {
      logger.error(`Item ${item.id} (${item.name}) has invalid slot "${item.slot}"`);
      res.status(500).json({ error: 'That item is misconfigured and cannot be equipped.' });
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

    const refusal = await equipLevelRefusal(playerId, item);
    if (refusal) {
      res.status(403).json({ error: refusal });
      return;
    }

    // The row must exist before it can be locked: forUpdate() on a missing row
    // locks nothing.
    await ensureEquipmentRow(playerId);

    // Everything that decides the swap is read INSIDE the transaction, with the
    // equipment row locked first.
    //
    // It used to read the worn item before the transaction began. Two equips
    // sent together both saw the same item in the slot, both handed it back to
    // the pack, and only one of the two incoming items ended up worn: wearing a
    // hatchet and feeding it two cheap axes turned one hatchet into two, every
    // time (audit C2, proven). Locking the equipment row serialises a player's
    // equipment changes, so the second request waits and then sees the slot as
    // the first one left it.
    const outcome = await db.transaction(async (trx) => {
      const worn = await wearFromPackWithin(trx, playerId, item);
      // Nothing has moved on either refusal, so returning or throwing is the same.
      if (worn.status === 'missing') throw new EquipAbort('You do not have this item');
      if (worn.status === 'unchanged') return { unchanged: true, otherHandItemId: null };
      return { unchanged: false, otherHandItemId: worn.otherHandItemId };
    });

    if (outcome.unchanged) {
      res.json({
        message: `${item.name} is already equipped`,
        slot: item.slot,
        unchanged: true,
        ...(await equipmentState(playerId)),
      });
      return;
    }

    // Name what the other hand put away, so a shield that vanished from the
    // paper doll is explained. The slot's own swap is not news: that is what
    // equipping means.
    const putAway = outcome.otherHandItemId
      ? await db('items').where({ id: outcome.otherHandItemId }).first()
      : null;

    logger.info(`Player ${playerId} equipped ${item.name} in ${item.slot}`);
    res.json({
      message: putAway
        ? `${item.name} equipped. ${putAway.name} put back in your pack.`
        : `${item.name} equipped`,
      slot: item.slot,
      ...(await equipmentState(playerId)),
    });

  } catch (err) {
    if (err instanceof EquipAbort) {
      res.status(err.status).json({ error: err.message });
      return;
    }
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

  // slot comes straight from the client and is interpolated into a column name.
  if (!(VALID_SLOTS as readonly string[]).includes(slot)) {
    res.status(400).json({ error: 'Unknown equipment slot' });
    return;
  }

  try {
    // Read the slot INSIDE the transaction, with the equipment row locked.
    //
    // It used to read the worn item first and open the transaction after, so two
    // unequips sent together both found the hatchet in the slot and both put it
    // in the pack: one worn hatchet became two (audit C1, proven). With the row
    // locked, the second request waits, then finds the slot empty and refuses.
    const itemId: number = await db.transaction(async (trx) => {
      const equipment = await trx('player_equipment')
        .where({ player_id: playerId })
        .forUpdate()
        .first();
      if (!equipment) throw new EquipAbort('No equipment found', 404);

      const worn = equipment[`${slot}_item_id`];
      if (!worn) throw new EquipAbort('Nothing equipped in that slot');

      // Clear the slot and give the item back as one unit of work.
      await trx('player_equipment')
        .where({ player_id: playerId })
        .update({ [`${slot}_item_id`]: null });
      await addItemToInventoryWithin(trx, playerId, worn, 1);

      return worn;
    });

    const item = await db('items').where({ id: itemId }).first();

    logger.info(`Player ${playerId} unequipped ${item.name} from ${slot}`);
    res.json({
      message: `${item.name} unequipped`,
      slot,
      ...(await equipmentState(playerId)),
    });

  } catch (err) {
    if (err instanceof EquipAbort) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    logger.error(`Unequip error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;