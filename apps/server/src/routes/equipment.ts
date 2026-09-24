import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { levelFromXp } from '../services/xp';
import { logger } from '../lib/logger';
import { addItemToInventoryWithin, removeItemFromInventoryWithin } from '../services/inventory';

const router = Router();

// Get player equipment
// The only slots that exist. `slot` reaches a column name in both equip and
// unequip, so it must never come from the client or an item row unchecked.
const VALID_SLOTS = [
  'head', 'neck', 'back', 'chest', 'mainhand', 'offhand',
  'legs', 'hands', 'feet', 'finger', 'mount', 'trophy',
] as const;

// Which skill gates an item's level_required, by subtype.
//
// This used to cover axe and pickaxe only, with a comment saying "we'll
// generalize later". Everything else with a level requirement equipped freely.
// Subtypes come from the services that check for equipped tools: foraging.ts
// (TOOL_SLOT_COLUMN) and farming.ts (BUILD_MALLET, hoe).
const SUBTYPE_SKILL: Record<string, string> = {
  axe: 'Woodcutting',
  pickaxe: 'Mining',
  bow: 'Hunting',
  hoe: 'Farming',
  mallet: 'Carpentry',
  foraging_knife: 'Foraging',
  foraging_gloves: 'Foraging',
  foraging_basket: 'Foraging',
  fishing_rod: 'Fishing',
  fishing_net: 'Fishing',
  // Mounts are raised in Husbandry but ridden on Equitation — the dual gate.
  // Without these the Palfrey's level_required would never be checked.
  horse: 'Equitation',
  pony: 'Equitation',
};

/**
 * The player's equipment row, created if absent.
 *
 * player_equipment.player_id is unique, so a plain insert-then-select races: two
 * simultaneous requests from a brand-new player both see no row and both insert,
 * and one gets a unique violation. onConflict makes it idempotent.
 */
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

async function ensureEquipmentRow(playerId: number) {
  const existing = await db('player_equipment').where({ player_id: playerId }).first();
  if (existing) return existing;

  await db('player_equipment')
    .insert({ player_id: playerId })
    .onConflict(['player_id'])
    .ignore();

  return db('player_equipment').where({ player_id: playerId }).first();
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

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;

  try {
    const equipment = await ensureEquipmentRow(playerId);

    // One query for every equipped item rather than one per slot. This used to
    // issue up to twelve round trips on every equipment load.
    const equippedIds = VALID_SLOTS
      .map((slot) => equipment[`${slot}_item_id`])
      .filter((id): id is number => !!id);

    const items = equippedIds.length
      ? await db('items').whereIn('id', equippedIds)
      : [];

    const byId = new Map(items.map((item) => [item.id, item]));

    const equipped: Record<string, any> = {};
    for (const slot of VALID_SLOTS) {
      const itemId = equipment[`${slot}_item_id`];
      equipped[slot] = itemId ? byId.get(itemId) ?? null : null;
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

    if (item.level_required > 1) {
      const skillName = SUBTYPE_SKILL[item.subtype] ?? null;

      if (!skillName) {
        // Allowed rather than refused, so adding an item cannot silently make it
        // unequippable — but logged, because the gate is not being enforced and
        // somebody should add the subtype to SUBTYPE_SKILL.
        logger.warn(
          `Item ${item.id} (${item.name}) requires level ${item.level_required} but `
          + `subtype "${item.subtype}" maps to no skill; level gate NOT enforced`,
        );
      }

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
      const equipment = await trx('player_equipment')
        .where({ player_id: playerId })
        .forUpdate()
        .first();
      const currentItemId = equipment?.[`${item.slot}_item_id`] ?? null;

      // Already wearing this exact item. There is no dual-wielding, so the
      // right answer is to change nothing. (This branch once destroyed a spare
      // copy: the swap-out was skipped but the removal still ran.) No write has
      // happened, so returning here commits nothing.
      if (currentItemId === itemId) return { unchanged: true };

      // Take the incoming item first. If it is no longer held (spent in another
      // tab), refuse before anything has moved.
      const took = await removeItemFromInventoryWithin(trx, playerId, itemId, 1);
      if (!took) throw new EquipAbort('You do not have this item');

      // Whatever was worn goes back to the pack.
      if (currentItemId) {
        await addItemToInventoryWithin(trx, playerId, currentItemId, 1);
      }

      await trx('player_equipment')
        .where({ player_id: playerId })
        .update({ [`${item.slot}_item_id`]: itemId });

      return { unchanged: false };
    });

    if (outcome.unchanged) {
      res.json({
        message: `${item.name} is already equipped`,
        slot: item.slot,
        unchanged: true,
        equipment: await loadEquipment(playerId),
      });
      return;
    }

    logger.info(`Player ${playerId} equipped ${item.name} in ${item.slot}`);
    res.json({
      message: `${item.name} equipped`,
      slot: item.slot,
      equipment: await loadEquipment(playerId),
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
      equipment: await loadEquipment(playerId),
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