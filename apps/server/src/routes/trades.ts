import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { requireTrusted } from '../lib/trust';
import { logger } from '../index';
import { io } from '../index';
import { getGold, lockPlayersInOrder, transferGoldWithin } from '../services/gold';

const router = Router();

const TRADING_POST_LOCATION = 'Talador';

async function cancelTrade(tradeId: number, reason: string) {
    await db('trades').where({ id: tradeId }).update({ status: 'cancelled' });
    const trade = await db('trades').where({ id: tradeId }).first();
    if (!trade) return;
    io.to(`player_${trade.player1_id}`).emit('trade_cancelled', { reason });
    io.to(`player_${trade.player2_id}`).emit('trade_cancelled', { reason });
    logger.info(`Trade ${tradeId} cancelled: ${reason}`);
}

async function getTradeData(tradeId: number) {
    const offers = await db('trade_offers')
        .where({ trade_id: tradeId })
        .join('items', 'trade_offers.item_id', 'items.id')
        .select(
            'trade_offers.player_id',
            'trade_offers.quantity',
            'items.id as item_id',
            'items.name',
            'items.type',
            'items.subtype',
        );

    const gold = await db('trade_gold').where({ trade_id: tradeId });

    return { offers, gold };
}

// Get active trade for current player
router.get('/active', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const trade = await db('trades')
            .where(function () {
                this.where({ player1_id: playerId }).orWhere({ player2_id: playerId })
            })
            .whereIn('status', ['pending', 'active'])
            .first();

        if (!trade) {
            res.json({ trade: null });
            return;
        }

        const { offers, gold } = await getTradeData(trade.id);
        const otherPlayerId = trade.player1_id === playerId ? trade.player2_id : trade.player1_id;
        const otherPlayer = await db('players').where({ id: otherPlayerId }).first();

        res.json({ trade, offers, gold, otherPlayer: { id: otherPlayer.id, username: otherPlayer.username } });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Request a trade
router.post('/request', requireAuth, requireTrusted, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { targetPlayerId } = req.body;

    try {
        const player = await db('players').where({ id: playerId }).first();
        const location = await db('locations').where({ id: player.current_location_id }).first();
        logger.info(`Trade request: player ${playerId} at ${location.name}, target ${targetPlayerId}`)

        if (location.name !== TRADING_POST_LOCATION) {
            logger.info(`Trade rejected: not at trading post`)
            res.status(400).json({ error: 'You can only trade at the Trading Post in Talador.' });
            return;
        }

        const target = await db('players').where({ id: targetPlayerId }).first();
        if (!target) {
            res.status(404).json({ error: 'Player not found.' });
            return;
        }

        if (target.current_location_id !== player.current_location_id) {
            res.status(400).json({ error: 'That player is not at your location.' });
            return;
        }

        // Check neither player is already in a trade
        const existingTrade = await db('trades')
            .where(function () {
                this.where({ player1_id: playerId }).orWhere({ player2_id: playerId })
                    .orWhere({ player1_id: targetPlayerId }).orWhere({ player2_id: targetPlayerId })
            })
            .whereIn('status', ['pending', 'active'])
            .first();

        if (existingTrade) {
            res.status(400).json({ error: 'One of you is already in a trade.' });
            return;
        }

        const [trade] = await db('trades').insert({
            player1_id: playerId,
            player2_id: targetPlayerId,
            location_id: player.current_location_id,
            status: 'pending',
        }).returning('*');

        // Initialize gold offers
        await db('trade_gold').insert([
            { trade_id: trade.id, player_id: playerId, gold_amount: 0 },
            { trade_id: trade.id, player_id: targetPlayerId, gold_amount: 0 },
        ]);

        io.to(`player_${targetPlayerId}`).emit('trade_requested', {
            tradeId: trade.id,
            fromPlayer: { id: playerId, username: player.username },
        });

        logger.info(`Player ${playerId} requested trade with ${targetPlayerId}`);
        res.json({ success: true, tradeId: trade.id });
    } catch (err) {
        logger.error(`Trade request error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Accept/decline trade request
router.post('/respond', requireAuth, requireTrusted, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { tradeId, accept } = req.body;

    try {
        const trade = await db('trades').where({ id: tradeId, player2_id: playerId, status: 'pending' }).first();
        if (!trade) {
            res.status(404).json({ error: 'Trade request not found.' });
            return;
        }

        if (!accept) {
            await cancelTrade(tradeId, 'Trade request declined.');
            res.json({ success: true });
            return;
        }

        await db('trades').where({ id: tradeId }).update({ status: 'active' });
        const { offers, gold } = await getTradeData(tradeId);
        const player = await db('players').where({ id: playerId }).first();
        const otherPlayer = await db('players').where({ id: trade.player1_id }).first();

        io.to(`player_${trade.player1_id}`).emit('trade_started', {
            tradeId,
            otherPlayer: { id: playerId, username: player.username },
            offers,
            gold,
            isPlayer1: true,
        });

        io.to(`player_${playerId}`).emit('trade_started', {
            tradeId,
            otherPlayer: { id: trade.player1_id, username: otherPlayer.username },
            offers,
            gold,
            isPlayer1: false,
        });

        logger.info(`Trade ${tradeId} started between ${trade.player1_id} and ${playerId}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Add item to trade offer
router.post('/offer/item', requireAuth, requireTrusted, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { tradeId, itemId, quantity } = req.body;

    try {
        const trade = await db('trades').where({ id: tradeId, status: 'active' }).first();
        if (!trade || (trade.player1_id !== playerId && trade.player2_id !== playerId)) {
            res.status(404).json({ error: 'Trade not found.' });
            return;
        }

        // Verify player has item
        const invItem = await db('player_inventory').where({ player_id: playerId, item_id: itemId }).first();
        if (!invItem || invItem.quantity < quantity) {
            res.status(400).json({ error: 'You do not have enough of that item.' });
            return;
        }

        // Check if already in offer
        const existing = await db('trade_offers')
            .where({ trade_id: tradeId, player_id: playerId, item_id: itemId })
            .first();

        if (existing) {
            const newQty = existing.quantity + quantity;
            // Make sure they actually have that many
            if (invItem.quantity < newQty) {
                res.status(400).json({ error: 'You do not have enough of that item.' });
                return;
            }
            await db('trade_offers').where({ id: existing.id }).update({ quantity: newQty });
        } else {
            await db('trade_offers').insert({ trade_id: tradeId, player_id: playerId, item_id: itemId, quantity });
        }

        // Reset acceptances
        await db('trades').where({ id: tradeId }).update({ player1_accepted: false, player2_accepted: false });

        const { offers, gold } = await getTradeData(tradeId);
        io.to(`player_${trade.player1_id}`).emit('trade_offer_updated', { offers, gold });
        io.to(`player_${trade.player2_id}`).emit('trade_offer_updated', { offers, gold });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Remove item from trade offer
router.post('/offer/item/remove', requireAuth, requireTrusted, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { tradeId, itemId } = req.body;

    try {
        const trade = await db('trades').where({ id: tradeId, status: 'active' }).first();
        if (!trade) {
            res.status(404).json({ error: 'Trade not found.' });
            return;
        }

        await db('trade_offers').where({ trade_id: tradeId, player_id: playerId, item_id: itemId }).delete();
        await db('trades').where({ id: tradeId }).update({ player1_accepted: false, player2_accepted: false });

        const { offers, gold } = await getTradeData(tradeId);
        io.to(`player_${trade.player1_id}`).emit('trade_offer_updated', { offers, gold });
        io.to(`player_${trade.player2_id}`).emit('trade_offer_updated', { offers, gold });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Update gold offer
router.post('/offer/gold', requireAuth, requireTrusted, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { tradeId, goldAmount } = req.body;

    try {
        // Party check. Without it, anyone holding a trade id could reset two
        // other players' acceptance flags at will, which is a griefing lever
        // even though it moves nothing. (/offer/item already checks this;
        // /offer/item/remove still does not — separate fix.)
        const trade = await db('trades').where({ id: tradeId, status: 'active' }).first();
        if (!trade || (trade.player1_id !== playerId && trade.player2_id !== playerId)) {
            res.status(404).json({ error: 'Trade not found.' });
            return;
        }

        // Sanitise before it ever reaches the column: the old code passed the
        // raw body value through Math.max, so a float or a numeric string went
        // straight into trade_gold and became real money at accept time.
        const amount = Math.floor(Number(goldAmount));
        if (!Number.isFinite(amount) || amount < 0) {
            res.status(400).json({ error: 'Invalid gold amount.' });
            return;
        }

        // Courtesy check only. The binding check is at accept, because a player
        // can spend this gold elsewhere between offering and accepting.
        const balance = await getGold(playerId);
        if (amount > balance) {
            res.status(400).json({ error: 'You do not have that much gold.' });
            return;
        }

        await db('trade_gold').where({ trade_id: tradeId, player_id: playerId }).update({ gold_amount: amount });
        await db('trades').where({ id: tradeId }).update({ player1_accepted: false, player2_accepted: false });

        const { offers, gold } = await getTradeData(tradeId);
        io.to(`player_${trade.player1_id}`).emit('trade_offer_updated', { offers, gold });
        io.to(`player_${trade.player2_id}`).emit('trade_offer_updated', { offers, gold });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Accept trade
/**
 * Thrown to abort an in-flight exchange. Rolls the transaction back, so a trade
 * that fails partway moves nothing at all.
 */
class TradeAbort extends Error {
    constructor(message: string, readonly cancelTrade = true) {
        super(message);
    }
}

router.post('/accept', requireAuth, requireTrusted, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { tradeId } = req.body;

    try {
        // Everything the response and the socket emits need, collected inside the
        // transaction and used after it commits. Emitting from inside would
        // announce a trade that a later rollback undoes.
        let player1Id = 0;
        let player2Id = 0;
        let p1Accepted = false;
        let p2Accepted = false;
        let completed = false;

        await db.transaction(async (trx) => {
            // forUpdate serialises concurrent accepts on the same trade: without
            // it both sides can pass validation simultaneously.
            const trade = await trx('trades')
                .where({ id: tradeId, status: 'active' })
                .forUpdate()
                .first();

            if (!trade) throw new TradeAbort('Trade not found.', false);

            if (trade.player1_id !== playerId && trade.player2_id !== playerId) {
                throw new TradeAbort('That is not your trade.', false);
            }

            player1Id = trade.player1_id;
            player2Id = trade.player2_id;

            const isPlayer1 = trade.player1_id === playerId;
            await trx('trades').where({ id: tradeId }).update(
                isPlayer1 ? { player1_accepted: true } : { player2_accepted: true },
            );

            const updated = await trx('trades').where({ id: tradeId }).first();
            p1Accepted = updated.player1_accepted;
            p2Accepted = updated.player2_accepted;

            if (!updated.player1_accepted || !updated.player2_accepted) return;

            // ── Both accepted: perform the exchange ─────────────────────────
            const offers = await trx('trade_offers').where({ trade_id: tradeId });
            const gold = await trx('trade_gold').where({ trade_id: tradeId });

            // ── Gold ────────────────────────────────────────────────────────
            // Both player rows are locked UP FRONT, in ascending id order,
            // before any balance is read or moved. Two transactions grabbing
            // the same pair in opposite orders deadlock under load, and this
            // path now shares players with the shop sale path. See
            // services/gold.ts for the rule.
            await lockPlayersInOrder(trx, [trade.player1_id, trade.player2_id]);

            const goldOfferedBy = (pid: number) =>
                Math.max(0, Math.floor(Number(
                    gold.find((g) => g.player_id === pid)?.gold_amount ?? 0,
                )));

            const p1Gold = goldOfferedBy(trade.player1_id);
            const p2Gold = goldOfferedBy(trade.player2_id);

            // Each side must still hold what it OFFERED, not merely what it
            // nets out owing. Checking only the net would let a player display
            // an offer they cannot back and still walk away richer.
            for (const [pid, amount] of [
                [trade.player1_id, p1Gold],
                [trade.player2_id, p2Gold],
            ] as const) {
                if (amount === 0) continue;
                const row = await trx('players').where({ id: pid }).select('gold').first();
                if (!row || Number(row.gold) < amount) {
                    throw new TradeAbort('A player no longer has the gold they offered.');
                }
            }

            // Validate EVERY offer before moving anything. The old code moved
            // items as it went, so a failure on the third offer left the first
            // two already transferred and then "cancelled" the trade.
            const moves: { from: number; to: number; itemId: number; qty: number; rowId: number; have: number }[] = [];

            for (const offer of offers) {
                const from = offer.player_id;
                const to = from === trade.player1_id ? trade.player2_id : trade.player1_id;

                const invItem = await trx('player_inventory')
                    .where({ player_id: from, item_id: offer.item_id })
                    .forUpdate()
                    .first();

                if (!invItem) {
                    throw new TradeAbort('A traded item is no longer in that player\'s inventory.');
                }

                if (Number(invItem.quantity) < Number(offer.quantity)) {
                    throw new TradeAbort('Insufficient quantity of a traded item.');
                }

                moves.push({
                    from,
                    to,
                    itemId: offer.item_id,
                    qty: Number(offer.quantity),
                    rowId: invItem.id,
                    have: Number(invItem.quantity),
                });
            }

            // Only now does anything actually move.
            for (const move of moves) {
                if (move.have === move.qty) {
                    await trx('player_inventory').where({ id: move.rowId }).delete();
                } else {
                    await trx('player_inventory').where({ id: move.rowId }).decrement('quantity', move.qty);
                }

                const existing = await trx('player_inventory')
                    .where({ player_id: move.to, item_id: move.itemId })
                    .forUpdate()
                    .first();

                if (existing) {
                    await trx('player_inventory').where({ id: existing.id }).increment('quantity', move.qty);
                } else {
                    await trx('player_inventory').insert({
                        player_id: move.to,
                        item_id: move.itemId,
                        quantity: move.qty,
                    });
                }
            }

            // Gold moves last, after every item has landed. Only the NET moves:
            // a 100-for-40 trade transfers 60. The gross offers stay readable on
            // trade_gold, so nothing is lost for auditing, and neither side
            // needs a balance it was only ever going to get straight back.
            if (p1Gold !== p2Gold) {
                const p1Pays = p1Gold > p2Gold;
                const moved = await transferGoldWithin(trx, {
                    fromPlayerId: p1Pays ? trade.player1_id : trade.player2_id,
                    toPlayerId: p1Pays ? trade.player2_id : trade.player1_id,
                    amount: Math.abs(p1Gold - p2Gold),
                    reason: 'trade',
                    refType: 'trade',
                    refId: tradeId,
                });
                if (!moved) {
                    throw new TradeAbort('A player no longer has the gold they offered.');
                }
            }

            await trx('trades').where({ id: tradeId }).update({ status: 'completed' });
            completed = true;
        });

        // ── Committed. Safe to tell anyone. ─────────────────────────────────
        io.to(`player_${player1Id}`).emit('trade_acceptance_updated', {
            player1Accepted: p1Accepted,
            player2Accepted: p2Accepted,
        });
        io.to(`player_${player2Id}`).emit('trade_acceptance_updated', {
            player1Accepted: p1Accepted,
            player2Accepted: p2Accepted,
        });

        if (completed) {
            io.to(`player_${player1Id}`).emit('trade_completed', {});
            io.to(`player_${player2Id}`).emit('trade_completed', {});
            logger.info(`Trade ${tradeId} completed between ${player1Id} and ${player2Id}`);
        }

        res.json({ success: true });
    } catch (err) {
        if (err instanceof TradeAbort) {
            // The transaction rolled back, so nothing moved. Cancelling here is
            // safe and happens outside any open transaction.
            if (err.cancelTrade) await cancelTrade(tradeId, err.message);
            logger.info(`Trade ${tradeId} aborted: ${err.message}`);
            res.status(400).json({ error: err.message });
            return;
        }

        logger.error(`Trade accept error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Cancel trade
router.post('/cancel', requireAuth, requireTrusted, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { tradeId } = req.body;

    try {
        const trade = await db('trades').where({ id: tradeId }).whereIn('status', ['pending', 'active']).first();
        if (!trade || (trade.player1_id !== playerId && trade.player2_id !== playerId)) {
            res.status(404).json({ error: 'Trade not found.' });
            return;
        }

        await cancelTrade(tradeId, 'Trade cancelled by a player.');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;