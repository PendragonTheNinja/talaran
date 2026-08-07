import db from '../db';
import { logger } from '../lib/logger';
import { recordItemFirst } from './inventory';

// A drop is only worth a sparkle if it is genuinely uncommon: one in five or
// rarer. Above that it is just a by-product and reads as noise.
const NOTABLE_MAX_PERCENT = 20;
const NOTABLE_MIN_ONE_IN = 5;

export interface SecondaryDrop {
    name: string;
    quantity: number;
    notable: boolean;
    /** first time this player has ever earned it */
    firstEver?: boolean;
}

async function awardItemById(playerId: number, itemId: number, qty: number): Promise<void> {
    const existing = await db('player_inventory').where({ player_id: playerId, item_id: itemId }).first();
    if (existing) {
        await db('player_inventory').where({ player_id: playerId, item_id: itemId }).increment('quantity', qty);
    } else {
        await db('player_inventory').insert({ player_id: playerId, item_id: itemId, quantity: qty });
    }
}

/**
 * Roll a source's secondary-drop table.
 * PROVENANCE: call this ONLY from inside an action resolver at roll time —
 * never from a generic inventory-add path.
 */
export async function rollSecondaryDrops(playerId: number, sourceKey: string): Promise<SecondaryDrop[]> {
    try {
        const entries = await db('drop_table_entries')
            .join('items', 'drop_table_entries.item_id', 'items.id')
            .where({ 'drop_table_entries.source_key': sourceKey, 'drop_table_entries.is_active': true })
            .select('drop_table_entries.*', 'items.name as item_name');

        const drops: SecondaryDrop[] = [];

        for (const entry of entries) {
            let hit: boolean;
            if (entry.chance_percent !== null && entry.chance_percent !== undefined) {
                hit = Math.random() * 100 < Number(entry.chance_percent);
            } else {
                hit = entry.chance_one_in <= 1 || Math.floor(Math.random() * entry.chance_one_in) === 0;
            }
            if (!hit) continue;

            const qty = entry.max_qty > entry.min_qty
                ? entry.min_qty + Math.floor(Math.random() * (entry.max_qty - entry.min_qty + 1))
                : entry.min_qty;

            // "notable" earns a sparkle, so it has to mean RARE, not merely
            // "not guaranteed". Lanai Bark comes off sawing at 50-75% depending
            // on log quality and was sparkling on most planks, which teaches
            // players to ignore the sparkle entirely.
            const notable =
                entry.chance_percent !== null && entry.chance_percent !== undefined
                    ? Number(entry.chance_percent) <= NOTABLE_MAX_PERCENT
                    : entry.chance_one_in >= NOTABLE_MIN_ONE_IN;

            await awardItemById(playerId, entry.item_id, qty);
            const { firstEver } = await recordItemFirst(playerId, entry.item_id, sourceKey);
            drops.push({ name: entry.item_name, quantity: qty, notable, firstEver });
            logger.info(`Player ${playerId} found ${qty}x ${entry.item_name} from ${sourceKey}`);
        }

        return drops;
    } catch (err) {
        logger.error(`rollSecondaryDrops error (player ${playerId}, ${sourceKey}): ${err}`);
        return [];
    }
}