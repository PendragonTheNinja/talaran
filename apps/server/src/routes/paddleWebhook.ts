import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import db from '../db';
import { logger } from '../lib/logger';
import { tierForPriceId } from '../config/talerTiers';
import { creditPurchase, applyPaddleAdjustment } from '../services/talers';

const router = Router();

// Paddle Billing webhook (docs/support-spec.md §5).
//
// Security model:
//  - Signature: Paddle-Signature header `ts=...;h1=...`; h1 is HMAC-SHA256
//    of `${ts}:${rawBody}` with the endpoint secret. Verified with a
//    constant-time compare against the RAW bytes (captured in index.ts).
//  - Replay: timestamps older than 5 minutes are rejected; idempotency on
//    paddle_transaction_id makes even a within-window replay a no-op.
//  - Fail-safe: if PADDLE_WEBHOOK_SECRET is unset, every request is refused.
//
// Responds 200 for handled AND safely-ignored events (Paddle retries
// non-2xx); responds 4xx only for requests that should never be retried.
//
// Events handled (audit M5):
//  - transaction.completed: credits every item at its tier times its quantity.
//    Refused, and logged for a manual refund, when the player does not exist
//    or is a guest: a guest account is swept after it expires, taking the
//    Talers with it, and checkout only keeps guests out because Paddle asks
//    for an email.
//  - adjustment.created / adjustment.updated: once APPROVED, a refund, credit
//    or chargeback takes back the Talers it covers, and a reversal of one
//    gives them back (services/talers.ts applyPaddleAdjustment). Most live
//    refunds arrive pending_approval first; the later update applies them.

const SIGNATURE_TOLERANCE_S = 300;

function verifyPaddleSignature(rawBody: Buffer, header: string | undefined, secret: string): boolean {
    if (!header) return false;
    const parts = Object.fromEntries(header.split(';').map(p => p.split('=') as [string, string]));
    const ts = parts.ts;
    const h1 = parts.h1;
    if (!ts || !h1) return false;
    const age = Math.abs(Date.now() / 1000 - Number(ts));
    if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_S) return false;

    const expected = crypto
        .createHmac('sha256', secret)
        .update(`${ts}:${rawBody.toString('utf8')}`)
        .digest('hex');
    try {
        return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(h1, 'hex'));
    } catch {
        return false;
    }
}

router.post('/webhook', async (req: Request, res: Response) => {
    const secret = process.env.PADDLE_WEBHOOK_SECRET;
    if (!secret) {
        logger.error('[paddle] webhook hit but PADDLE_WEBHOOK_SECRET is not configured');
        res.status(503).json({ error: 'Webhook not configured' });
        return;
    }

    const rawBody: Buffer | undefined = (req as any).rawBody;
    if (!rawBody || !verifyPaddleSignature(rawBody, req.header('Paddle-Signature'), secret)) {
        logger.warn('[paddle] webhook signature verification failed');
        res.status(401).json({ error: 'Invalid signature' });
        return;
    }

    try {
        const event = req.body;
        switch (event?.event_type) {
            case 'transaction.completed':
                await handleCompleted(event.data ?? {}, res);
                return;
            case 'adjustment.created':
            case 'adjustment.updated':
                await handleAdjustment(event.data ?? {}, res);
                return;
            default:
                res.status(200).json({ received: true });   // event types we don't act on
        }
    } catch (err) {
        logger.error(`[paddle] webhook processing error: ${err}`);
        res.status(500).json({ error: 'Processing error' });   // Paddle will retry
    }
});

/** A Paddle amount string ("1500") as an integer of minor units, or null. */
function minorUnits(raw: unknown): number | null {
    if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    return Number.isSafeInteger(n) ? n : null;
}

async function handleCompleted(data: any, res: Response): Promise<void> {
    const paddleTransactionId = String(data.id ?? '');
    const rawPlayer = String(data.custom_data?.playerId ?? '');
    const playerId = /^\d+$/.test(rawPlayer) ? Number(rawPlayer) : NaN;
    const items: any[] = Array.isArray(data.items) ? data.items : [];
    const buyerCountry: string | null =
        data.billing_details?.address?.country_code
        ?? data.customer?.address?.country_code
        ?? null;

    if (!paddleTransactionId || !Number.isSafeInteger(playerId) || !items.length) {
        // Malformed for our flow: log loudly, 200 so Paddle stops retrying.
        logger.error(`[paddle] transaction.completed missing fields: txn=${paddleTransactionId} player=${rawPlayer} items=${items.length}`);
        res.status(200).json({ received: true });
        return;
    }

    // Every item, at its tier times its quantity. The overlay lets a buyer
    // change the quantity unless the price is locked to 1 in the dashboard, and
    // only items[0] at one tier's worth used to be credited.
    let talers = 0;
    let usdCents = 0;
    for (const item of items) {
        const priceId = item?.price?.id ?? item?.price_id ?? null;
        const quantity = Number(item?.quantity ?? 1);
        const tier = priceId ? tierForPriceId(String(priceId)) : undefined;
        if (!tier || !Number.isSafeInteger(quantity) || quantity < 1) {
            logger.error(`[paddle] transaction ${paddleTransactionId} has an item this game cannot price (price ${priceId}, quantity ${item?.quantity}): NOT credited. Check PADDLE_PRICE_ID_* env vars.`);
            res.status(200).json({ received: true });
            return;
        }
        talers += tier.talers * quantity;
        usdCents += tier.usdCents * quantity;
    }

    const player = await db('players').where({ id: playerId }).select('id', 'is_guest').first();
    if (!player || player.is_guest) {
        logger.error(`[paddle] transaction ${paddleTransactionId} paid for ${player ? 'a GUEST account' : 'a player that does not exist'} (${playerId}): NOT credited. Refund it in the Paddle dashboard.`);
        res.status(200).json({ received: true });
        return;
    }

    const result = await creditPurchase({
        playerId,
        paddleTransactionId,
        usdCents,
        talers,
        buyerCountry,
        currencyCode: data.currency_code ?? data.details?.totals?.currency_code ?? null,
        subtotalMinor: minorUnits(data.details?.totals?.subtotal),
    });
    if (result.duplicate) {
        logger.info(`[paddle] duplicate webhook for ${paddleTransactionId}, ignored`);
    }
    res.status(200).json({ received: true });
}

async function handleAdjustment(data: any, res: Response): Promise<void> {
    // Only an approved adjustment has happened. A refund pending approval may
    // yet be rejected; its later adjustment.updated brings the approval.
    if (data.status !== 'approved') {
        res.status(200).json({ received: true });
        return;
    }
    const paddleAdjustmentId = String(data.id ?? '');
    const paddleTransactionId = String(data.transaction_id ?? '');
    if (!paddleAdjustmentId || !paddleTransactionId || typeof data.action !== 'string') {
        logger.error(`[paddle] adjustment missing fields: adj=${paddleAdjustmentId} txn=${paddleTransactionId} action=${data.action}`);
        res.status(200).json({ received: true });
        return;
    }

    const result = await applyPaddleAdjustment({
        paddleAdjustmentId,
        paddleTransactionId,
        action: data.action,
        type: typeof data.type === 'string' ? data.type : null,
        subtotalMinor: minorUnits(data.totals?.subtotal),
        currencyCode: data.totals?.currency_code ?? data.currency_code ?? null,
    });

    if (result.outcome === 'unknown_transaction') {
        // Most likely its transaction.completed has not been processed yet
        // (Paddle does not guarantee order). Ask Paddle to try again later.
        logger.warn(`[paddle] ${data.action} ${paddleAdjustmentId} is for ${paddleTransactionId}, which has no purchase yet; asking Paddle to retry`);
        res.status(500).json({ error: 'Transaction not yet recorded' });
        return;
    }
    res.status(200).json({ received: true });
}

export default router;
