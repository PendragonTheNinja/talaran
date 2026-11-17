import db from '../db';
import { addItemToInventoryWithin } from './inventory';
import { loadDurabilityTiers, wearItem } from './durability';

// ── The sailor's set (docs/islets-plan.md §6d; Nathan, 2026-11-17) ───────────
//
// Eleven pieces, every slot but the mount, spread over the first three
// islands' sea chests (items.set_island). Each worn piece takes
// items.sea_speed_pct off a sea journey, and the whole set adds FULL_SET_BONUS.
// Each journey wears ONE random worn piece, as combat wears a few random armour
// pieces a kill, so eleven pieces never mean eleven rolls. A sea chest holds a
// piece one time in three: one never found until an island's pieces are all
// found, then any of them; certain after LUCK_GUARANTEE chests without one.

export const SET_SUBTYPE = 'sailors_set';
export const FULL_SET_BONUS_PCT = 5;
export const PIECE_CHANCE = 1 / 3;
export const LUCK_GUARANTEE = 6;

/** Which island's pieces a kind of sea chest (container_types.key) holds. */
export const SEA_CHEST_ISLAND: Record<string, string> = { sea_chest: 'Taiar Island' };

const SLOT_COLUMNS = ['head', 'neck', 'back', 'chest', 'mainhand', 'offhand', 'legs', 'hands', 'feet', 'finger', 'trophy'];

/** The set pieces the player wears now, with the slot each is in. */
async function wornPieces(playerId: number, x: any = db): Promise<{ slot: string; item: any }[]> {
    const eq = await x('player_equipment').where({ player_id: playerId }).first();
    if (!eq) return [];
    const ids = SLOT_COLUMNS.map(s => [s, eq[`${s}_item_id`]] as const).filter(([, id]) => id);
    if (!ids.length) return [];
    const items = await x('items').whereIn('id', ids.map(([, id]) => id)).where({ subtype: SET_SUBTYPE })
        .select('id', 'name', 'tier', 'sea_speed_pct', 'durability_uses', 'durability_break_pct');
    const byId = new Map(items.map((i: any) => [i.id, i]));
    return ids.filter(([, id]) => byId.has(id)).map(([slot, id]) => ({ slot, item: byId.get(id) }));
}

/** What a sea journey's time is multiplied by: 1 less each worn piece's share, and the whole set's bonus. */
export async function seaSpeedFactor(playerId: number): Promise<number> {
    const worn = await wornPieces(playerId);
    if (!worn.length) return 1;
    let pct = worn.reduce((s, w) => s + Number(w.item.sea_speed_pct ?? 0), 0);
    // The whole set fills every slot but the mount: eleven pieces, whatever
    // exists so far (Taiar's four alone are not the set).
    if (worn.length >= SLOT_COLUMNS.length) pct += FULL_SET_BONUS_PCT;
    return Math.max(0.5, 1 - pct / 100);
}

/**
 * One journey's wear, inside the arrival's transaction: one worn piece at
 * random. A piece that breaks leaves its slot and is gone; its name is
 * returned so the arrival can say so. Silent otherwise.
 */
export async function wearSailingPieceWithin(trx: any, playerId: number): Promise<string | null> {
    const worn = await wornPieces(playerId, trx);
    if (!worn.length) return null;
    const pick = worn[Math.floor(Math.random() * worn.length)];
    const broke = await wearItem(trx, playerId, pick.item, await loadDurabilityTiers(trx), Math.random);
    if (!broke) return null;
    const cleared = await trx('player_equipment').where({ player_id: playerId, [`${pick.slot}_item_id`]: pick.item.id })
        .update({ [`${pick.slot}_item_id`]: null });
    return cleared ? pick.item.name : null;
}

/**
 * A sea chest's piece, when it holds one, inside the opening's transaction
 * (the player row locked by the caller). Null when it holds none, or the
 * island has no pieces yet.
 */
export async function rollSailorPieceWithin(trx: any, playerId: number, island: string): Promise<string | null> {
    const pieces = await trx('items').where({ subtype: SET_SUBTYPE, set_island: island, is_active: true }).select('id', 'name');
    if (!pieces.length) return null;
    await trx('player_sea_chest_luck').insert({ player_id: playerId, island, chests_without: 0 })
        .onConflict(['player_id', 'island']).ignore();
    const luck = await trx('player_sea_chest_luck').where({ player_id: playerId, island }).forUpdate().first();
    const without = Number(luck?.chests_without ?? 0);
    if (without + 1 < LUCK_GUARANTEE && Math.random() >= PIECE_CHANCE) {
        await trx('player_sea_chest_luck').where({ player_id: playerId, island }).increment('chests_without', 1);
        return null;
    }
    const found = new Set((await trx('player_sailor_found').where({ player_id: playerId }).pluck('item_id')).map(Number));
    const fresh = pieces.filter((p: any) => !found.has(Number(p.id)));
    const pool = fresh.length ? fresh : pieces;
    const piece = pool[Math.floor(Math.random() * pool.length)];
    await addItemToInventoryWithin(trx, playerId, piece.id, 1);
    await trx('player_sailor_found').insert({ player_id: playerId, item_id: piece.id }).onConflict(['player_id', 'item_id']).ignore();
    await trx('player_sea_chest_luck').where({ player_id: playerId, island }).update({ chests_without: 0 });
    return piece.name;
}
