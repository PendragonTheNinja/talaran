import db from '../db';
import { logger } from '../lib/logger';

// Gold, the earned currency (docs/marketplace-spec.md §2).
//
// Rules this module enforces:
//  - players.gold is the balance; gold_ledger is the audit trail. Nothing
//    writes one without the other, in the same transaction, ever.
//  - A balance may never go negative. Debits refuse rather than clamp.
//  - The *Within functions take the player row lock themselves, so a caller
//    cannot forget. Re-locking a row already held in the same transaction is
//    free, so this is safe to call after your own forUpdate.
//
// ── DEADLOCK RULE, read this before writing any two-player path ─────────────
// Any transaction touching TWO players' gold (a trade, a shop sale) must lock
// both player rows UP FRONT, in ASCENDING player id order, before calling
// anything here. Two transactions grabbing the same pair in opposite orders
// will deadlock under load, and it will happen at the worst possible time.
// Use lockPlayersInOrder() below and the ordering is handled for you.

// pg returns bigint as a string. Everything leaving this module is a Number;
// gold will not approach 2^53 in this game's lifetime.
function toNum(v: unknown): number {
    return Number(v ?? 0);
}

export interface GoldMovement {
    playerId: number;
    amount: number;          // always positive; direction is the function you call
    reason: string;          // spec §2.2
    refType?: string | null;
    refId?: number | null;
}

export async function getGold(playerId: number): Promise<number> {
    const row = await db('players').where({ id: playerId }).select('gold').first();
    return toNum(row?.gold);
}

/**
 * Lock the given players' rows in ascending id order. Call this FIRST in any
 * transaction that will move gold between two players. Duplicate ids are fine.
 */
export async function lockPlayersInOrder(trx: any, playerIds: number[]): Promise<void> {
    const ordered = [...new Set(playerIds)].sort((a, b) => a - b);
    for (const id of ordered) {
        await trx('players').where({ id }).forUpdate().first();
    }
}

/**
 * Credit gold inside an existing transaction. Returns the new balance.
 * Throws on a non-positive or non-integer amount: a caller that computed a
 * bad number should fail loudly, not silently pay nothing.
 */
export async function creditGoldWithin(trx: any, m: GoldMovement): Promise<number> {
    const { playerId, amount, reason, refType, refId } = m;
    if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error(`creditGoldWithin: bad amount ${amount} for player ${playerId} (${reason})`);
    }

    const player = await trx('players').where({ id: playerId }).forUpdate().first();
    if (!player) throw new Error(`creditGoldWithin: no player ${playerId}`);

    const balanceAfter = toNum(player.gold) + amount;
    await trx('players').where({ id: playerId }).update({ gold: balanceAfter });
    await trx('gold_ledger').insert({
        player_id: playerId,
        delta: amount,
        balance_after: balanceAfter,
        reason,
        ref_type: refType ?? null,
        ref_id: refId ?? null,
    });

    return balanceAfter;
}

/**
 * Debit gold inside an existing transaction.
 * Returns { ok: false } WITHOUT side effects if the balance is insufficient —
 * this is an expected outcome (the player spent elsewhere in another tab), not
 * an error, so it does not throw.
 */
export async function debitGoldWithin(
    trx: any,
    m: GoldMovement,
): Promise<{ ok: boolean; balance: number }> {
    const { playerId, amount, reason, refType, refId } = m;
    if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error(`debitGoldWithin: bad amount ${amount} for player ${playerId} (${reason})`);
    }

    const player = await trx('players').where({ id: playerId }).forUpdate().first();
    if (!player) return { ok: false, balance: 0 };

    const balance = toNum(player.gold);
    if (balance < amount) return { ok: false, balance };

    const balanceAfter = balance - amount;
    await trx('players').where({ id: playerId }).update({ gold: balanceAfter });
    await trx('gold_ledger').insert({
        player_id: playerId,
        delta: -amount,
        balance_after: balanceAfter,
        reason,
        ref_type: refType ?? null,
        ref_id: refId ?? null,
    });

    return { ok: true, balance: balanceAfter };
}

/** Credit gold in its own transaction. For simple single-player grants. */
export async function creditGold(m: GoldMovement): Promise<number> {
    const balance = await db.transaction((trx) => creditGoldWithin(trx, m));
    logger.info(`[gold] +${m.amount} to player ${m.playerId} (${m.reason}), balance ${balance}`);
    return balance;
}

/** Debit gold in its own transaction. For simple single-player spends. */
export async function debitGold(m: GoldMovement): Promise<{ ok: boolean; balance: number }> {
    const result = await db.transaction((trx) => debitGoldWithin(trx, m));
    if (result.ok) {
        logger.info(`[gold] −${m.amount} from player ${m.playerId} (${m.reason}), balance ${result.balance}`);
    }
    return result;
}

/**
 * Move gold between two players atomically, locking both rows in id order.
 * Returns false without side effects if the payer cannot afford it.
 */
export async function transferGoldWithin(
    trx: any,
    params: {
        fromPlayerId: number;
        toPlayerId: number;
        amount: number;
        reason: string;
        refType?: string | null;
        refId?: number | null;
    },
): Promise<boolean> {
    const { fromPlayerId, toPlayerId, amount, reason, refType, refId } = params;
    if (fromPlayerId === toPlayerId) return false;

    await lockPlayersInOrder(trx, [fromPlayerId, toPlayerId]);

    const taken = await debitGoldWithin(trx, { playerId: fromPlayerId, amount, reason, refType, refId });
    if (!taken.ok) return false;

    await creditGoldWithin(trx, { playerId: toPlayerId, amount, reason, refType, refId });
    return true;
}

/**
 * Reconciliation: every player whose gold column disagrees with the sum of
 * their ledger. Should always return an empty array. If it ever does not, some
 * code path is writing a balance without a ledger row and needs finding.
 * Surfaced in the admin panel; cheap enough to run on demand.
 */
export async function reconcileGold(): Promise<
    Array<{ playerId: number; username: string; balance: number; ledgerSum: number; drift: number }>
> {
    const rows = await db('players')
        .leftJoin('gold_ledger', 'gold_ledger.player_id', 'players.id')
        .groupBy('players.id', 'players.username', 'players.gold')
        .select(
            'players.id as playerId',
            'players.username as username',
            'players.gold as balance',
        )
        .sum('gold_ledger.delta as ledgerSum');

    return rows
        .map((r: any) => {
            const balance = toNum(r.balance);
            const ledgerSum = toNum(r.ledgerSum);
            return { playerId: r.playerId, username: r.username, balance, ledgerSum, drift: balance - ledgerSum };
        })
        .filter((r) => r.drift !== 0);
}
