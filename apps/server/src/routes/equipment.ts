import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { levelFromXp } from '../services/xp';
import { logger } from '../index';

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
async function ensureEquipmentRow(playerId: number) {
  const existing = await db('player_equipment').where({ player_id: playerId }).first();
  if (existing) return existing;

  await db('player_equipment')
    .insert({ player_id: playerId })
    .onConflict(['player_id'])
    .ignore();

  return db('player_equipment').where({ player_id: playerId }).first();
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

    // Get or create equipment row
    const equipment = await ensureEquipmentRow(playerId);
    const currentItemId = equipment[`${item.slot}_item_id`];

    // Already wearing this exact item.
    //
    // This branch destroyed items before it existed. The swap-out below was
    // skipped when currentItemId === itemId, but the inventory removal still
    // ran, so a spare copy was decremented or deleted with nothing given back.
    // Reported against Foraging Baskets; this handler is slot-agnostic, so it
    // applied to every equippable in the game.
    //
    // There is no dual-wielding: a slot holds one item. So the correct answer is
    // to change nothing at all.
    if (currentItemId === itemId) {
      res.json({ message: `${item.name} is already equipped`, slot: item.slot, unchanged: true });
      return;
    }

    // Items move between inventory and equipment across several statements, so
    // the whole swap is one transaction: a failure partway would otherwise leave
    // an item in neither place.
    await db.transaction(async (trx) => {
      // Whatever was in the slot goes back to the pack.
      if (currentItemId) {
        const existingInInventory = await trx('player_inventory')
          .where({ player_id: playerId, item_id: currentItemId })
          .first();

        if (existingInInventory) {
          await trx('player_inventory')
            .where({ player_id: playerId, item_id: currentItemId })
            .increment('quantity', 1);
        } else {
          await trx('player_inventory').insert({
            player_id: playerId,
            item_id: currentItemId,
            quantity: 1,
          });
        }
      }

      // Re-read under the transaction: the check above was outside it, and the
      // quantity could have changed in between.
      const held = await trx('player_inventory')
        .where({ player_id: playerId, item_id: itemId })
        .forUpdate()
        .first();

      if (!held || Number(held.quantity) < 1) {
        throw new Error('item no longer held');
      }

      if (Number(held.quantity) > 1) {
        await trx('player_inventory')
          .where({ player_id: playerId, item_id: itemId })
          .decrement('quantity', 1);
      } else {
        await trx('player_inventory')
          .where({ player_id: playerId, item_id: itemId })
          .delete();
      }

      await trx('player_equipment')
        .where({ player_id: playerId })
        .update({ [`${item.slot}_item_id`]: itemId });
    });

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

  // slot comes straight from the client and is interpolated into a column name.
  if (!(VALID_SLOTS as readonly string[]).includes(slot)) {
    res.status(400).json({ error: 'Unknown equipment slot' });
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

    // One transaction: giving the item back and clearing the slot were two
    // separate writes, so a failure between them left the item in the pack AND
    // still equipped — the mirror of the equip bug, duplicating instead of
    // destroying.
    await db.transaction(async (trx) => {
      const existingInInventory = await trx('player_inventory')
        .where({ player_id: playerId, item_id: itemId })
        .forUpdate()
        .first();

      if (existingInInventory) {
        await trx('player_inventory')
          .where({ player_id: playerId, item_id: itemId })
          .increment('quantity', 1);
      } else {
        await trx('player_inventory').insert({
          player_id: playerId,
          item_id: itemId,
          quantity: 1,
        });
      }

      await trx('player_equipment')
        .where({ player_id: playerId })
        .update({ [`${slot}_item_id`]: null });
    });

    logger.info(`Player ${playerId} unequipped ${item.name} from ${slot}`);
    res.json({ message: `${item.name} unequipped`, slot });

  } catch (err) {
    logger.error(`Unequip error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;