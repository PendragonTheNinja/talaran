// Durability (docs/combat-spec.md §13; migration 20261012130000_durability).
//
// A piece of gear is safe for a guaranteed number of uses, counted per player
// per item, and only after that does each use roll to break. The numbers are
// rows (durability_tiers, by the item's tier) with per-item overrides on
// items, so they are tuned from the admin panel without a deploy. A break
// resets the count, so the next copy starts safe again.
//
// Built generic: anything can call wearItem. Combat wears gear here; tools
// (services/toolWear.ts) use wearItemByRule with numbers of their own.

import type { Knex } from 'knex'
import { Rng } from '../lib/combatMath'
import { jewelryPiece, noteJewelry, payJewelry } from './jewelry'

export interface WearableItem {
    id: number
    name: string
    tier?: number | null
    durability_uses?: number | null
    durability_break_pct?: number | null
}

export interface DurabilityRule {
    guaranteedUses: number
    breakChancePct: number
}

/** Every tier's numbers, by tier. Read once per unit of work. */
export async function loadDurabilityTiers(x: Knex | Knex.Transaction): Promise<Map<number, DurabilityRule>> {
    const rows = await x('durability_tiers').select('tier', 'guaranteed_uses', 'break_chance_pct')
    return new Map(rows.map((r: any) => [Number(r.tier), { guaranteedUses: Number(r.guaranteed_uses), breakChancePct: Number(r.break_chance_pct) }]))
}

/** An item's rule: its own override where it has one, else its tier's (tier 1 when unset). */
export function durabilityRule(item: WearableItem, tiers: Map<number, DurabilityRule>): DurabilityRule {
    const tier = tiers.get(Number(item.tier) || 1) ?? tiers.get(1) ?? { guaranteedUses: 200, breakChancePct: 1 }
    return {
        guaranteedUses: item.durability_uses ?? tier.guaranteedUses,
        breakChancePct: item.durability_break_pct ?? tier.breakChancePct,
    }
}

/**
 * One use of an item, inside the caller's transaction. Counts the use (one
 * atomic upsert), and past the guarantee rolls to break; a break resets the
 * count. Returns whether it broke. The caller removes the broken copy.
 */
export async function wearItem(
    trx: Knex.Transaction,
    playerId: number,
    item: WearableItem,
    tiers: Map<number, DurabilityRule>,
    rng: Rng,
): Promise<boolean> {
    return wearItemByRule(trx, playerId, item, durabilityRule(item, tiers), rng)
}

/**
 * wearItem with the rule already decided. Tools (services/toolWear.ts) work
 * theirs out from the action's timer rather than from durability_tiers.
 */
export async function wearItemByRule(
    trx: Knex.Transaction,
    playerId: number,
    item: WearableItem,
    rule: DurabilityRule,
    rng: Rng,
): Promise<boolean> {
    // A Keeper's Band (docs/talar-spec.md §8): now and then a use does not
    // count. It pays its Talar only when it spares a use (Nathan, 2026-11-12).
    // It drew on every use it might have helped, 1 Talar per 20 for a 3% chance,
    // so a Lit Quartz bought about 60 spared uses, some 4% of a tier 1 tool
    // (audit 2026-11-09).
    const band = await jewelryPiece(trx, playerId, 'wear')
    if (band && rng() < band.strength && await payJewelry(trx, playerId)) {
        noteJewelry(trx, playerId, `Your ${band.name} spared your ${item.name} a knock.`)
        return false
    }
    const [row] = await trx('player_item_wear')
        .insert({ player_id: playerId, item_id: item.id, uses: 1 })
        .onConflict(['player_id', 'item_id'])
        .merge({ uses: trx.raw('player_item_wear.uses + 1') })
        .returning('uses')
    const uses = Number(row?.uses ?? 1)
    if (uses <= rule.guaranteedUses) return false
    if (rng() * 100 >= rule.breakChancePct) return false
    await trx('player_item_wear').where({ player_id: playerId, item_id: item.id }).update({ uses: 0 })
    return true
}
