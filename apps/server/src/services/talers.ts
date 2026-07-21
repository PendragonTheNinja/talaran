import db from '../db';
import { logger } from '../lib/logger';

// Taler economy core (docs/support-spec.md §5-6).
//
// Rules this module enforces:
//  - The ledger is append-only; balance = SUM(delta).
//  - Credits from purchases are idempotent (unique paddle_transaction_id):
//    a replayed webhook is a no-op, never a double credit.
//  - Spends lock the player row as a mutex, re-check the balance inside the
//    transaction, and never let a balance go negative.
//  - Talers are only ever credited here, from verified webhooks or explicit
//    admin grants — never from any client-facing code path.

export async function getTalerBalance(playerId: number): Promise<number> {
    const [row] = await db('taler_ledger').where({ player_id: playerId }).sum('delta as balance');
    return Number(row?.balance ?? 0);
}

/**
 * Credit a completed Paddle purchase. Idempotent: if this transaction id has
 * been recorded before, returns { duplicate: true } and changes nothing.
 */
export async function creditPurchase(params: {
    playerId: number;
    paddleTransactionId: string;
    usdCents: number;
    talers: number;
    buyerCountry: string | null;
}): Promise<{ duplicate: boolean; balance: number }> {
    const { playerId, paddleTransactionId, usdCents, talers, buyerCountry } = params;

    const duplicate = await db.transaction(async (trx) => {
        const existing = await trx('taler_purchases').where({ paddle_transaction_id: paddleTransactionId }).first();
        if (existing) return true;

        const [purchase] = await trx('taler_purchases')
            .insert({
                player_id: playerId,
                paddle_transaction_id: paddleTransactionId,
                usd_cents: usdCents,
                talers,
                buyer_country: buyerCountry,
                status: 'completed',
            })
            .returning('*');

        await trx('taler_ledger').insert({
            player_id: playerId,
            delta: talers,
            reason: 'purchase',
            ref_type: 'taler_purchase',
            ref_id: purchase.id,
        });
        return false;
    });

    const balance = await getTalerBalance(playerId);
    if (!duplicate) {
        logger.info(`[talers] credited ${talers} to player ${playerId} (paddle ${paddleTransactionId}), balance ${balance}`);
    }
    return { duplicate, balance };
}

/**
 * Debit Talers inside an existing transaction. The caller must hold the
 * player-row lock (forUpdate) before calling. Returns false (no insert) if
 * the balance is insufficient.
 */
export async function spendTalersWithin(trx: any, params: {
    playerId: number;
    amount: number;
    reason: string;
    refType?: string;
    refId?: number;
}): Promise<boolean> {
    const { playerId, amount, reason, refType, refId } = params;
    if (!Number.isInteger(amount) || amount <= 0) return false;

    const [row] = await trx('taler_ledger').where({ player_id: playerId }).sum('delta as balance');
    const balance = Number(row?.balance ?? 0);
    if (balance < amount) return false;

    await trx('taler_ledger').insert({
        player_id: playerId,
        delta: -amount,
        reason,
        ref_type: refType ?? null,
        ref_id: refId ?? null,
    });
    return true;
}

/**
 * Spend Talers atomically. Returns { ok: false } without side effects if the
 * balance is insufficient. refType/refId link the debit to what it bought.
 */
export async function spendTalers(params: {
    playerId: number;
    amount: number;
    reason: string;
    refType?: string;
    refId?: number;
}): Promise<{ ok: boolean; balance: number }> {
    const { playerId } = params;

    const ok = await db.transaction(async (trx) => {
        // Player row lock serializes concurrent spends for this player
        const player = await trx('players').where({ id: playerId }).forUpdate().first();
        if (!player) return false;
        return spendTalersWithin(trx, params);
    });

    const balance = await getTalerBalance(playerId);
    if (ok) logger.info(`[talers] player ${playerId} spent ${params.amount} on ${params.reason}, balance ${balance}`);
    return { ok, balance };
}
