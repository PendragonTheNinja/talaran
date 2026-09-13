import db from '../db';
import { buffRareBonus, buffDoubleChance } from './buffs';
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
export async function rollSecondaryDrops(
    playerId: number,
    sourceKey: string,
    /**
     * The skill this roll belongs to, so a Foraging provision only helps
     * foraging. Optional: a caller that does not pass it simply gets no buff,
     * which is the safe default rather than a buff leaking across skills.
     */
    skill?: string,
): Promise<SecondaryDrop[]> {
    try {
        // A PROPORTIONAL bonus, not percentage points.
        //
        // Adding points warps rare drops beyond recognition: +1.5 points takes a
        // 1-in-650 wild hive from 0.15% to 1.65%, which is eleven times as
        // likely, while doing almost nothing to a 1-in-4 common. A multiplier
        // treats every entry alike, so a 10% buff is a 10% better chance whether
        // the drop is common or the rarest thing in the game.
        const rareBonus = skill ? await buffRareBonus(playerId, skill) : 0;
        const rareMult = 1 + Math.max(0, rareBonus) / 100;
        const doubleChance = skill ? await buffDoubleChance(playerId, skill) : 0;
        const entries = await db('drop_table_entries')
            .join('items', 'drop_table_entries.item_id', 'items.id')
            .where({ 'drop_table_entries.source_key': sourceKey, 'drop_table_entries.is_active': true })
            .select('drop_table_entries.*', 'items.name as item_name');

        const drops: SecondaryDrop[] = [];

        for (const entry of entries) {
            let hit: boolean;
            if (entry.chance_percent !== null && entry.chance_percent !== undefined) {
                hit = Math.random() * 100 < Number(entry.chance_percent) * rareMult;
            } else {
                // Converted to a percentage so the multiplier applies in the same
                // units as the other branch.
                const pct = (100 / Math.max(1, entry.chance_one_in)) * rareMult;
                hit = entry.chance_one_in <= 1 || Math.random() * 100 < pct;
            }
            if (!hit) continue;

            let qty = entry.max_qty > entry.min_qty
                ? entry.min_qty + Math.floor(Math.random() * (entry.max_qty - entry.min_qty + 1))
                : entry.min_qty;

            if (doubleChance > 0 && Math.random() * 100 < doubleChance) qty *= 2;

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