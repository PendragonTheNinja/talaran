import db from '../db';
import { logger } from '../lib/logger';
import { SERVER_ERROR } from '../lib/serviceResult';
import { listWords } from '../lib/listWords';
import { addItemToInventoryWithin, takeItemsWithin } from './inventory';
import { debitGoldWithin } from './gold';

// ── Geoffrey's locks (docs/islets-plan.md §6e; Nathan, 2026-11-17) ───────────
//
// Geoffrey opens the lock on a locked chest for a fee (chest_locks) and hands
// back its unlocked twin, which the player opens themselves as a nest or a
// mussel is opened (services/containers.ts). No XP for the lock. He does every
// chest the player carries that their purse can pay for, cheapest kind first.
// One transaction: the player row locked, the chests taken, the twins given,
// the gold debited with its ledger row (CLAUDE.md §4); a refusal throws.

class LockAbort extends Error {}

export async function unlockChests(playerId: number): Promise<{ ok: true; message: string } | { ok: false; error: string; status: number }> {
    try {
        const locks = await db('chest_locks').where({ is_active: true }).orderBy('fee').select('locked_item', 'unlocked_item', 'fee');
        const message = await db.transaction(async (trx) => {
            const player = await trx('players').where({ id: playerId }).forNoKeyUpdate().first('gold');
            let purse = Number(player?.gold ?? 0);
            const done: string[] = [];
            let spent = 0;
            let carried = 0;
            for (const lock of locks) {
                const item = await trx('items').where({ name: lock.locked_item }).first('id');
                const twin = await trx('items').where({ name: lock.unlocked_item }).first('id', 'name');
                if (!item || !twin) continue;
                const row = await trx('player_inventory').where({ player_id: playerId, item_id: item.id }).first('quantity');
                const held = Number(row?.quantity ?? 0);
                carried += held;
                const n = Math.min(held, Math.floor(purse / Number(lock.fee)));
                if (n < 1) continue;
                const took = await takeItemsWithin(trx, playerId, [{ name: lock.locked_item, quantity: n }]);
                if (!took.ok) throw new LockAbort('Your chests went missing while he worked.');
                await addItemToInventoryWithin(trx, playerId, twin.id, n);
                purse -= n * Number(lock.fee);
                spent += n * Number(lock.fee);
                done.push(n > 1 ? `${n} ${twin.name}s` : `a ${twin.name}`);
            }
            if (carried === 0) throw new LockAbort('"Bring me something locked and I will open it. You have nothing of the sort."');
            if (!done.length) throw new LockAbort('"Coin first, friend. I do not work locks on credit."');
            const debit = await debitGoldWithin(trx, { playerId, amount: spent, reason: 'chest_unlock' });
            if (!debit.ok) throw new LockAbort('"Coin first, friend. I do not work locks on credit."');
            return `Geoffrey works each lock open with a bent pick and a bad word, and hands back ${listWords(done)} for ${spent.toLocaleString()} gold.`;
        });
        return { ok: true, message };
    } catch (err) {
        if (err instanceof LockAbort) return { ok: false, error: err.message, status: 400 };
        logger.error(`unlockChests (player ${playerId}): ${err}`);
        return { ok: false, error: SERVER_ERROR, status: 500 };
    }
}
