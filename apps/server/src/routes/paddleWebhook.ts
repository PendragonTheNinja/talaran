import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { logger } from '../lib/logger';
import { tierForPriceId } from '../config/talerTiers';
import { creditPurchase } from '../services/talers';

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
        if (event?.event_type !== 'transaction.completed') {
            res.status(200).json({ received: true });   // event types we don't handle yet
            return;
        }

        const data = event.data ?? {};
        const paddleTransactionId = String(data.id ?? '');
        const playerId = parseInt(String(data.custom_data?.playerId ?? ''));
        const priceId = data.items?.[0]?.price?.id ? String(data.items[0].price.id) : null;
        const buyerCountry: string | null =
            data.billing_details?.address?.country_code
            ?? data.customer?.address?.country_code
            ?? null;

        if (!paddleTransactionId || !Number.isInteger(playerId) || !priceId) {
            // Malformed for our flow — log loudly, 200 so Paddle stops retrying
            logger.error(`[paddle] transaction.completed missing fields: txn=${paddleTransactionId} player=${data.custom_data?.playerId} price=${priceId}`);
            res.status(200).json({ received: true });
            return;
        }

        const tier = tierForPriceId(priceId);
        if (!tier) {
            logger.error(`[paddle] transaction ${paddleTransactionId} has unknown price id ${priceId} — NOT credited. Check PADDLE_PRICE_ID_* env vars.`);
            res.status(200).json({ received: true });
            return;
        }

        const result = await creditPurchase({
            playerId,
            paddleTransactionId,
            usdCents: tier.usdCents,
            talers: tier.talers,
            buyerCountry,
        });
        if (result.duplicate) {
            logger.info(`[paddle] duplicate webhook for ${paddleTransactionId}, ignored`);
        }
        res.status(200).json({ received: true });
    } catch (err) {
        logger.error(`[paddle] webhook processing error: ${err}`);
        res.status(500).json({ error: 'Processing error' });   // Paddle will retry
    }
});

export default router;
