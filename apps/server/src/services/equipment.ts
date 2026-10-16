import type { Knex } from 'knex';
import db from '../db';
import { levelFromXp } from './xp';
import { logger } from '../lib/logger';
import { addItemToInventoryWithin, removeItemFromInventoryWithin } from './inventory';
import { holdsBothHands } from './combat';
import { gateSkill } from './equipGates';

// Putting a piece on, as one rule, for every way it happens: the equip button
// (routes/equipment.ts) and gear going back on after a death
// (restoreDeathLoadoutWithin below). The swap used to live only in the route.

/**
 * The only slots that exist. A slot name reaches a column name in equip and
 * unequip, so it must never come from the client or an item row unchecked.
 */
export const VALID_SLOTS = [
    'head', 'neck', 'back', 'chest', 'mainhand', 'offhand',
    'legs', 'hands', 'feet', 'finger', 'mount', 'trophy',
] as const;

/**
 * The player's equipment row, created if absent.
 *
 * player_equipment.player_id is unique, so a plain insert-then-select races: two
 * simultaneous requests from a brand-new player both see no row and both insert,
 * and one gets a unique violation. onConflict makes it idempotent. It must exist
 * before it can be locked: forUpdate() on a missing row locks nothing.
 */
export async function ensureEquipmentRow(playerId: number, x: Knex | Knex.Transaction = db) {
    const existing = await x('player_equipment').where({ player_id: playerId }).first();
    if (existing) return existing;
    await x('player_equipment').insert({ player_id: playerId }).onConflict(['player_id']).ignore();
    return x('player_equipment').where({ player_id: playerId }).first();
}

/**
 * Why this player cannot wear this item, or null when they can: the level gate
 * of whichever skill owns it (services/equipGates.ts).
 */
export async function equipLevelRefusal(playerId: number, item: any, x: Knex | Knex.Transaction = db): Promise<string | null> {
    if (!(item.level_required > 1)) return null;
    const skillName = gateSkill(item);
    if (!skillName) {
        // Allowed rather than refused, so adding an item cannot silently make it
        // unequippable, but logged, because the gate is not being enforced and
        // somebody should add the subtype to SUBTYPE_SKILL.
        logger.warn(
            `Item ${item.id} (${item.name}) requires level ${item.level_required} but `
            + `subtype "${item.subtype}" maps to no skill; level gate NOT enforced`,
        );
        return null;
    }
    const skill = await x('skills').where({ name: skillName }).first();
    const row = skill ? await x('player_skills').where({ player_id: playerId, skill_id: skill.id }).first() : null;
    const level = levelFromXp(row?.xp ? parseInt(row.xp) : 0);
    return level < item.level_required ? `You need ${skillName} level ${item.level_required} to equip this` : null;
}

export type WearOutcome =
    | { status: 'missing' }
    | { status: 'unchanged' }
    | { status: 'worn'; replacedItemId: number | null; otherHandItemId: number | null };

/**
 * Take one of `item` from the pack and put it on, inside a transaction.
 *
 * Whatever was in its slot goes back to the pack, and so does the other hand
 * when a two-handed weapon is involved (docs/combat-spec.md §6). Everything that
 * decides the swap is read here, with the equipment row LOCKED: reading the slot
 * before the transaction let two equips both hand back the same worn item (audit
 * C2). Lock order is equipment, then pack, as in every caller.
 *
 * Returns 'missing' with nothing changed when the item is not in the pack, and
 * 'unchanged' when it is already worn: a caller that must roll back throws.
 */
export async function wearFromPackWithin(trx: Knex.Transaction, playerId: number, item: any): Promise<WearOutcome> {
    const equipment = await trx('player_equipment').where({ player_id: playerId }).forUpdate().first();
    const currentItemId: number | null = equipment?.[`${item.slot}_item_id`] ?? null;

    // Already wearing this exact item. A pair of daggers is one item, so the
    // right answer is to change nothing. (This branch once destroyed a spare
    // copy: the swap-out was skipped but the removal still ran.)
    if (currentItemId === item.id) return { status: 'unchanged' };

    // Take the incoming item first. If it is no longer held (spent in another
    // tab), stop before anything has moved.
    if (!(await removeItemFromInventoryWithin(trx, playerId, item.id, 1))) return { status: 'missing' };

    if (currentItemId) await addItemToInventoryWithin(trx, playerId, currentItemId, 1);
    const update: Record<string, number | null> = { [`${item.slot}_item_id`]: item.id };

    // Dual and two-hand weapons take both hands: a weapon going into the main
    // hand empties the offhand, and anything going into the offhand puts such a
    // weapon away. Either way it lands in the pack.
    let otherHand: 'offhand' | 'mainhand' | null = null;
    if (item.slot === 'mainhand' && holdsBothHands(item)) {
        otherHand = 'offhand';
    } else if (item.slot === 'offhand' && equipment?.mainhand_item_id) {
        const held = await trx('items').where({ id: equipment.mainhand_item_id }).first();
        if (holdsBothHands(held)) otherHand = 'mainhand';
    }
    const otherHandItemId: number | null = otherHand ? equipment?.[`${otherHand}_item_id`] ?? null : null;
    if (otherHand && otherHandItemId) {
        await addItemToInventoryWithin(trx, playerId, otherHandItemId, 1);
        update[`${otherHand}_item_id`] = null;
    }

    await trx('player_equipment').where({ player_id: playerId }).update(update);
    return { status: 'worn', replacedItemId: currentItemId, otherHandItemId };
}

/**
 * Put back on whatever the player wore when they died, for the stacks of that
 * death they have just taken back into the pack (Nathan, 2026-10-17).
 *
 * `claimed` is what the caller moved from the ground to the pack in this same
 * transaction, and only the caller decides it was the player's own and still
 * private (the take-back route and a single pickup both check). A stack belongs
 * to the death when its dropped_at is the death's own moment, so a sword the
 * player dropped by hand never gets put on. A remembered piece REPLACES what is
 * worn now (Nathan): that goes to the pack.
 *
 * The caller must lock the equipment row BEFORE touching the pack, as the equip
 * button does, or a take-back and an equip sent together could deadlock.
 * Returns the names of what went back on.
 */
export async function restoreDeathLoadoutWithin(
    trx: Knex.Transaction,
    playerId: number,
    locationId: number,
    claimed: { item_id: number; quantity: number; dropped_at: Date | string }[],
): Promise<string[]> {
    if (!claimed.length) return [];
    const loadout: { slot: string; item_id: number; died_at: Date }[] = await trx('death_loadouts')
        .where({ player_id: playerId, location_id: locationId })
        .select('slot', 'item_id', 'died_at');
    if (!loadout.length) return [];

    // Units of each item that came back from THIS death.
    const diedAt = new Date(loadout[0].died_at).getTime();
    const units = new Map<number, number>();
    for (const c of claimed) {
        if (new Date(c.dropped_at).getTime() !== diedAt) continue;
        units.set(c.item_id, (units.get(c.item_id) ?? 0) + Number(c.quantity));
    }

    // The main hand first, so a one-handed weapon and a shield both go back
    // on, and a two-hander never displaces a shield it was not worn with.
    const order = (slot: string) => (slot === 'mainhand' ? 0 : slot === 'offhand' ? 1 : 2);
    const restored: string[] = [];
    for (const row of [...loadout].sort((a, b) => order(a.slot) - order(b.slot))) {
        const left = units.get(row.item_id) ?? 0;
        if (left < 1) continue;
        const item = await trx('items').where({ id: row.item_id }).first();
        if (!item || item.slot !== row.slot || await equipLevelRefusal(playerId, item, trx)) {
            await trx('death_loadouts').where({ player_id: playerId, slot: row.slot }).delete();
            continue;
        }
        const worn = await wearFromPackWithin(trx, playerId, item);
        if (worn.status === 'missing') continue;
        units.set(row.item_id, left - 1);
        await trx('death_loadouts').where({ player_id: playerId, slot: row.slot }).delete();
        if (worn.status === 'worn') restored.push(item.name);
    }
    return restored;
}
