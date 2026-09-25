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
//  - Refunds, credits and chargebacks take back the Talers the money bought,
//    once per Paddle adjustment, never more in total than the purchase gave
//    (applyPaddleAdjustment, audit M5). A reversal can leave a balance below
//    zero; spends already refuse a balance short of their cost, so the debt
//    blocks further spending until it is covered.

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
    /** The transaction's own subtotal and currency, for working out partial refunds later. */
    currencyCode: string | null;
    subtotalMinor: number | null;
}): Promise<{ duplicate: boolean; balance: number }> {
    const { playerId, paddleTransactionId, usdCents, talers, buyerCountry, currencyCode, subtotalMinor } = params;

    const duplicate = await db.transaction(async (trx) => {
        // Insert-or-ignore on the unique transaction id. It was check-then-
        // insert, so two copies of one webhook arriving together could both
        // pass the check and the loser answered 500 on the unique key.
        const [purchase] = await trx('taler_purchases')
            .insert({
                player_id: playerId,
                paddle_transaction_id: paddleTransactionId,
                usd_cents: usdCents,
                talers,
                buyer_country: buyerCountry,
                currency_code: currencyCode,
                subtotal_minor: subtotalMinor,
                status: 'completed',
            })
            .onConflict('paddle_transaction_id')
            .ignore()
            .returning('*');
        if (!purchase) return true;

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

/** Adjustments that take Talers back, and those that undo one of them. */
const REVERSING = new Set(['refund', 'credit', 'chargeback', 'chargeback_warning']);
const RESTORING = new Set(['chargeback_reverse', 'chargeback_warning_reverse', 'credit_reverse']);

export type AdjustmentOutcome =
    | 'applied'             // Talers taken back or restored
    | 'needs_review'        // recorded, nothing moved: the share could not be worked out
    | 'duplicate'           // this adjustment was already handled
    | 'unknown_transaction' // no purchase with this transaction id (yet)
    | 'ignored';            // an action this game does not act on

/**
 * Apply an APPROVED Paddle adjustment to the purchase it belongs to (audit M5).
 *
 * Refunds, credits and chargebacks take back the share of the purchase's
 * Talers that the adjustment covers: all of them for a full adjustment, or
 * talers x (adjusted subtotal / purchase subtotal) for a partial one, both in
 * the transaction's own currency. Reversals of those give Talers back. The net
 * taken back is held between zero and what the purchase credited, so a
 * duplicate or overlapping adjustment can never take more than was bought.
 *
 * Idempotent on the adjustment id. Locks the purchase and the player row (the
 * same mutex spends use) so a spend and a reversal cannot interleave.
 */
export async function applyPaddleAdjustment(params: {
    paddleAdjustmentId: string;
    paddleTransactionId: string;
    action: string;
    type: string | null;
    subtotalMinor: number | null;
    currencyCode: string | null;
}): Promise<{ outcome: AdjustmentOutcome; talers: number; balance: number | null; playerId: number | null }> {
    const { paddleAdjustmentId, paddleTransactionId, action, type, subtotalMinor, currencyCode } = params;
    const sign = REVERSING.has(action) ? -1 : RESTORING.has(action) ? 1 : 0;
    if (!sign) return { outcome: 'ignored', talers: 0, balance: null, playerId: null };

    const result = await db.transaction(async (trx) => {
        // Lock the purchase FIRST, then ask whether this adjustment was already
        // handled. Checked the other way round, copies of one delivery that
        // land together all pass the check, queue on the lock, and every one
        // after the first fails on the unique id (a 500 to Paddle).
        const purchase = await trx('taler_purchases').where({ paddle_transaction_id: paddleTransactionId }).forUpdate().first();
        if (!purchase) return { outcome: 'unknown_transaction' as const, talers: 0, balance: null, playerId: null };

        const seen = await trx('taler_adjustments').where({ paddle_adjustment_id: paddleAdjustmentId }).first();
        if (seen) return { outcome: 'duplicate' as const, talers: 0, balance: null, playerId: seen.player_id };

        await trx('players').where({ id: purchase.player_id }).forUpdate().first();

        const credited = Number(purchase.talers);
        const [{ net }] = await trx('taler_adjustments')
            .where({ purchase_id: purchase.id, outcome: 'applied' })
            .sum('talers as net');
        const alreadyTaken = -Number(net ?? 0);   // how many Talers are currently taken back

        // The share this adjustment covers.
        let share: number | null = null;
        if (type === 'full') {
            share = credited;
        } else if (subtotalMinor !== null && purchase.subtotal_minor !== null && Number(purchase.subtotal_minor) > 0
                   && currencyCode && purchase.currency_code === currencyCode) {
            share = Math.round(credited * subtotalMinor / Number(purchase.subtotal_minor));
        }

        let talers = 0;
        let outcome: 'applied' | 'needs_review' = 'needs_review';
        if (share !== null) {
            outcome = 'applied';
            const room = sign < 0 ? credited - alreadyTaken : alreadyTaken;
            talers = sign * Math.max(0, Math.min(share, room));
        }

        const [row] = await trx('taler_adjustments')
            .insert({
                paddle_adjustment_id: paddleAdjustmentId,
                purchase_id: purchase.id,
                player_id: purchase.player_id,
                action,
                talers,
                subtotal_minor: subtotalMinor,
                currency_code: currencyCode,
                outcome,
            })
            .returning('*');

        if (talers !== 0) {
            await trx('taler_ledger').insert({
                player_id: purchase.player_id,
                delta: talers,
                reason: `paddle_${action}`,
                ref_type: 'taler_adjustment',
                ref_id: row.id,
            });
        }

        const nowTaken = alreadyTaken - talers;
        const status = nowTaken <= 0 ? 'completed'
            : nowTaken < credited ? 'partially_refunded'
            : action.startsWith('chargeback') ? 'charged_back' : 'refunded';
        await trx('taler_purchases').where({ id: purchase.id }).update({ status });

        const [{ balance }] = await trx('taler_ledger').where({ player_id: purchase.player_id }).sum('delta as balance');
        await trx('taler_adjustments').where({ id: row.id }).update({ balance_after: Number(balance ?? 0) });
        return { outcome, talers, balance: Number(balance ?? 0), playerId: purchase.player_id as number };
    });

    if (result.outcome === 'applied' && result.talers !== 0) {
        logger.info(`[talers] paddle ${action} ${paddleAdjustmentId} moved ${result.talers} for player ${result.playerId}, balance ${result.balance}`);
        if ((result.balance ?? 0) < 0) {
            logger.error(`[talers] player ${result.playerId} is ${-(result.balance ?? 0)} Talers in debt after paddle ${action} ${paddleAdjustmentId} (transaction ${paddleTransactionId}); spending is blocked until it is covered`);
        }
    } else if (result.outcome === 'needs_review') {
        logger.error(`[talers] paddle ${action} ${paddleAdjustmentId} on ${paddleTransactionId} recorded for REVIEW: partial, and the purchase has no subtotal in ${currencyCode} to work out the share. No Talers moved.`);
    }
    return result;
}

/**
 * Adjust a player's Talers by staff decision. Positive credits, negative
 * revokes. Returns { ok: false } without side effects if a revoke would take
 * the balance below zero.
 *
 * Deliberately separate from creditPurchase: that path is idempotent on a
 * Paddle transaction id because a webhook can be replayed, whereas a grant is a
 * person clicking a button and every click is meant to count.
 */
export async function adminAdjustTalers(params: {
    playerId: number;
    amount: number;
    reason: string;
}): Promise<{ ok: boolean; balance: number }> {
    const { playerId, amount, reason } = params;
    if (!Number.isInteger(amount) || amount === 0) {
        return { ok: false, balance: await getTalerBalance(playerId) };
    }

    return db.transaction(async (trx) => {
        // Lock the player row as a mutex, the same as spends do, so two grants
        // cannot both read the same balance before either has written.
        await trx('players').where({ id: playerId }).forUpdate().first();

        const [row] = await trx('taler_ledger').where({ player_id: playerId }).sum('delta as balance');
        const balance = Number(row?.balance ?? 0);
        if (balance + amount < 0) return { ok: false, balance };

        await trx('taler_ledger').insert({
            player_id: playerId,
            delta: amount,
            reason,
            ref_type: 'admin',
            ref_id: null,
        });

        const after = balance + amount;
        logger.info(`[talers] admin adjusted player ${playerId} by ${amount}, balance ${after}`);
        return { ok: true, balance: after };
    });
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
