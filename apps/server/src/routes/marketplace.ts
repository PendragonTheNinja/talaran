import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import {
    WALLS,
    MerchantKey,
    merchantForItem,
    buyRateFor,
    quoteSale,
    dailyAllowance,
    getStock,
    getSoldToday,
    recordSaleWithin,
    recordPurchaseWithin,
} from '../services/marketplace';
import {
    creditGoldWithin,
    debitGoldWithin,
    getGold,
} from '../services/gold';
import {
    addItemToInventoryWithin,
    removeItemFromInventoryWithin,
    notifyInventoryChanged,
} from '../services/inventory';
import { gameDayKey } from '../lib/gameTime';

const router = Router();

// Taiar Marketplace (docs/marketplace-spec.md §3).
//
// Presence is required for every endpoint here: a player must be standing at
// the merchant's location. Checked server-side on every call, because the
// client link being hidden elsewhere is decoration, not a control.

async function requirePresence(
    playerId: number,
    merchantId: number,
): Promise<{ ok: true; merchant: any } | { ok: false; error: string; status: number }> {
    const merchant = await db('merchants').where({ id: merchantId, is_active: true }).first();
    if (!merchant) return { ok: false, error: 'No such merchant.', status: 404 };

    const player = await db('players').where({ id: playerId }).select('current_location_id').first();
    if (!player) return { ok: false, error: 'Player not found.', status: 404 };

    if (player.current_location_id !== merchant.location_id) {
        return { ok: false, error: 'You are not at that merchant.', status: 400 };
    }
    return { ok: true, merchant };
}

/** Parse and bound a requested quantity. Rejects floats, strings and absurdities. */
function parseQuantity(raw: unknown): number | null {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) return null;
    return n;
}

// ── The merchants standing here ──────────────────────────────────────────────
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const player = await db('players').where({ id: playerId }).select('current_location_id').first();
        if (!player) {
            res.status(404).json({ error: 'Player not found.' });
            return;
        }

        const merchants = await db('merchants')
            .where({ location_id: player.current_location_id, is_active: true })
            .orderBy('display_order')
            .select('id', 'key', 'name', 'title', 'greeting', 'buy_rate', 'buys_anything', 'sells');

        res.json({
            gold: await getGold(playerId),
            dayKey: gameDayKey(),
            merchants: merchants.map((m: any) => ({
                id: m.id,
                key: m.key,
                name: m.name,
                title: m.title,
                greeting: m.greeting,
                buyRate: Number(m.buy_rate),
                buysAnything: Boolean(m.buys_anything),
                sells: Boolean(m.sells),
            })),
        });
    } catch (err) {
        logger.error(`Marketplace list error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── What this merchant is selling today ──────────────────────────────────────
router.get('/:merchantId/stock', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const merchantId = Number(req.params.merchantId);
    try {
        const presence = await requirePresence(playerId, merchantId);
        if (!presence.ok) {
            res.status(presence.status).json({ error: presence.error });
            return;
        }

        res.json({
            gold: await getGold(playerId),
            stock: presence.merchant.sells ? await getStock(merchantId, playerId) : [],
        });
    } catch (err) {
        logger.error(`Marketplace stock error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── What this merchant will buy off you, with today's rate already applied ───
router.get('/:merchantId/sellable', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const merchantId = Number(req.params.merchantId);
    try {
        const presence = await requirePresence(playerId, merchantId);
        if (!presence.ok) {
            res.status(presence.status).json({ error: presence.error });
            return;
        }

        const merchantKey = presence.merchant.key as MerchantKey;
        const dayKey = gameDayKey();

        const rows = await db('player_inventory')
            .join('items', 'items.id', 'player_inventory.item_id')
            .where('player_inventory.player_id', playerId)
            .whereNotNull('items.value')
            .select(
                'items.id as itemId',
                'items.name as name',
                'items.icon as icon',
                'items.type as type',
                'items.subtype as subtype',
                'items.value as value',
                'player_inventory.quantity as held',
            );

        const sold = await db('npc_sale_daily')
            .where({ player_id: playerId, sale_date: dayKey })
            .select('item_id', 'units_sold');
        const soldBy = new Map<number, number>(sold.map((s: any) => [s.item_id, Number(s.units_sold)]));

        const sellable = rows
            .map((r: any) => {
                const rate = buyRateFor(merchantKey, merchantForItem(r));
                if (rate === null) return null;   // not this merchant's trade

                const value = Number(r.value);
                const soldToday = soldBy.get(r.itemId) ?? 0;
                const allowance = dailyAllowance(value);

                // Quote the whole held stack, which is what a player usually
                // wants, and is also the case most likely to cross a band.
                const quote = quoteSale({
                    value,
                    baseRate: rate,
                    quantity: Number(r.held),
                    soldToday,
                });

                return {
                    itemId: r.itemId,
                    name: r.name,
                    icon: r.icon ?? null,
                    held: Number(r.held),
                    value,
                    rate,
                    unitAtFullRate: quote.unitAtFullRate,
                    allowance,
                    soldToday,
                    remainingAtFullRate: Math.max(0, allowance - soldToday),
                    stackTotal: quote.total,
                    stackSteppedDown: quote.steppedDown,
                };
            })
            .filter(Boolean);

        res.json({ gold: await getGold(playerId), rate: merchantKey === 'pawnbroker' ? WALLS.PAWN_BUY_RATE : WALLS.BUY_RATE, sellable });
    } catch (err) {
        logger.error(`Marketplace sellable error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── Price a sale before committing to it ─────────────────────────────────────
//
// The confirm screen calls this. It returns the band breakdown so the client can
// show WHY a total is lower than the headline unit price, and echoes a total the
// sell endpoint will then be held to.
router.post('/quote', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { merchantId, itemId } = req.body ?? {};
    const quantity = parseQuantity(req.body?.quantity);
    try {
        if (quantity === null) {
            res.status(400).json({ error: 'Invalid quantity.' });
            return;
        }

        const presence = await requirePresence(playerId, Number(merchantId));
        if (!presence.ok) {
            res.status(presence.status).json({ error: presence.error });
            return;
        }

        const item = await db('items').where({ id: Number(itemId) }).first();
        if (!item || item.value === null || item.value === undefined) {
            res.status(400).json({ error: 'That cannot be sold.' });
            return;
        }

        const rate = buyRateFor(presence.merchant.key as MerchantKey, merchantForItem(item));
        if (rate === null) {
            res.status(400).json({ error: 'That is not this merchant\'s trade.' });
            return;
        }

        const soldToday = await getSoldToday(playerId, item.id);
        const quote = quoteSale({ value: Number(item.value), baseRate: rate, quantity, soldToday });

        res.json({
            itemId: item.id,
            name: item.name,
            quantity,
            total: quote.total,
            bands: quote.bands,
            steppedDown: quote.steppedDown,
            unitAtFullRate: quote.unitAtFullRate,
            allowance: quote.allowance,
            soldToday,
        });
    } catch (err) {
        logger.error(`Marketplace quote error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── Sell ─────────────────────────────────────────────────────────────────────
router.post('/sell', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { merchantId, itemId, expectedTotal } = req.body ?? {};
    const quantity = parseQuantity(req.body?.quantity);

    try {
        if (quantity === null) {
            res.status(400).json({ error: 'Invalid quantity.' });
            return;
        }

        const presence = await requirePresence(playerId, Number(merchantId));
        if (!presence.ok) {
            res.status(presence.status).json({ error: presence.error });
            return;
        }

        const item = await db('items').where({ id: Number(itemId) }).first();
        if (!item || item.value === null || item.value === undefined) {
            res.status(400).json({ error: 'That cannot be sold.' });
            return;
        }

        const rate = buyRateFor(presence.merchant.key as MerchantKey, merchantForItem(item));
        if (rate === null) {
            res.status(400).json({ error: 'That is not this merchant\'s trade.' });
            return;
        }

        const outcome = await db.transaction(async (trx) => {
            // Re-read the day's counter inside the transaction. Two tabs selling
            // the same item at once would otherwise both price against the same
            // stale figure and both get the full rate.
            const counter = await trx('npc_sale_daily')
                .where({ player_id: playerId, item_id: item.id, sale_date: gameDayKey() })
                .forUpdate()
                .first();
            const soldToday = Number(counter?.units_sold ?? 0);

            const quote = quoteSale({ value: Number(item.value), baseRate: rate, quantity, soldToday });

            // The client showed the player a number. If the true total is lower
            // than what they agreed to, refuse and hand back the new quote
            // rather than quietly paying less. Being paid less than the screen
            // promised is the kind of thing a player forgives once.
            if (expectedTotal !== undefined && expectedTotal !== null) {
                const expected = Math.floor(Number(expectedTotal));
                if (Number.isFinite(expected) && quote.total < expected) {
                    return { ok: false as const, requote: quote, error: 'The price changed. Check the new total.' };
                }
            }

            const took = await removeItemFromInventoryWithin(trx, playerId, item.id, quantity);
            if (!took) return { ok: false as const, error: 'You no longer have that many.' };

            await creditGoldWithin(trx, {
                playerId,
                amount: quote.total,
                reason: 'npc_sale',
                refType: 'merchant',
                refId: presence.merchant.id,
            });

            await recordSaleWithin(trx, playerId, item.id, quantity);

            return { ok: true as const, quote };
        });

        if (!outcome.ok) {
            res.status(400).json({ error: outcome.error, requote: outcome.requote ?? null });
            return;
        }

        notifyInventoryChanged(playerId);
        res.json({
            sold: quantity,
            name: item.name,
            total: outcome.quote.total,
            bands: outcome.quote.bands,
            steppedDown: outcome.quote.steppedDown,
            gold: await getGold(playerId),
        });
    } catch (err) {
        logger.error(`Marketplace sell error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── Buy ──────────────────────────────────────────────────────────────────────
router.post('/buy', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { merchantId, itemId } = req.body ?? {};
    const quantity = parseQuantity(req.body?.quantity);

    try {
        if (quantity === null) {
            res.status(400).json({ error: 'Invalid quantity.' });
            return;
        }

        const presence = await requirePresence(playerId, Number(merchantId));
        if (!presence.ok) {
            res.status(presence.status).json({ error: presence.error });
            return;
        }
        if (!presence.merchant.sells) {
            res.status(400).json({ error: 'That merchant does not sell anything.' });
            return;
        }

        // Today's shelf is the authority on what exists and how much of it. A
        // request naming an item the rotation did not stock is refused here,
        // not merely hidden by the client.
        const stock = await getStock(Number(merchantId), playerId);
        const line = stock.find((s) => s.itemId === Number(itemId));
        if (!line) {
            res.status(400).json({ error: 'That is not for sale today.' });
            return;
        }

        const outcome = await db.transaction(async (trx) => {
            const counter = await trx('npc_purchase_daily')
                .where({ player_id: playerId, item_id: line.itemId, purchase_date: gameDayKey() })
                .forUpdate()
                .first();
            const boughtToday = Number(counter?.units_bought ?? 0);
            const remaining = Math.max(0, line.dailyLimit - boughtToday);

            if (quantity > remaining) {
                return {
                    ok: false as const,
                    error: remaining === 0
                        ? `${presence.merchant.name} has no more ${line.name} for you today.`
                        : `Only ${remaining} left for you today.`,
                };
            }

            const cost = line.price * quantity;
            const paid = await debitGoldWithin(trx, {
                playerId,
                amount: cost,
                reason: 'npc_purchase',
                refType: 'merchant',
                refId: presence.merchant.id,
            });
            if (!paid.ok) return { ok: false as const, error: 'You cannot afford that.' };

            await addItemToInventoryWithin(trx, playerId, line.itemId, quantity);
            await recordPurchaseWithin(trx, playerId, line.itemId, quantity);

            return { ok: true as const, cost };
        });

        if (!outcome.ok) {
            res.status(400).json({ error: outcome.error });
            return;
        }

        notifyInventoryChanged(playerId);
        res.json({
            bought: quantity,
            name: line.name,
            unitPrice: line.price,
            cost: outcome.cost,
            gold: await getGold(playerId),
        });
    } catch (err) {
        logger.error(`Marketplace buy error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
