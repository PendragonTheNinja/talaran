import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../index';
import { io } from '../index';

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
            'items.stackable',
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
router.post('/request', requireAuth, async (req: AuthRequest, res: Response) => {
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
router.post('/respond', requireAuth, async (req: AuthRequest, res: Response) => {
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
router.post('/offer/item', requireAuth, async (req: AuthRequest, res: Response) => {
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
router.post('/offer/item/remove', requireAuth, async (req: AuthRequest, res: Response) => {
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
router.post('/offer/gold', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { tradeId, goldAmount } = req.body;

    try {
        const trade = await db('trades').where({ id: tradeId, status: 'active' }).first();
        if (!trade) {
            res.status(404).json({ error: 'Trade not found.' });
            return;
        }

        await db('trade_gold').where({ trade_id: tradeId, player_id: playerId }).update({ gold_amount: Math.max(0, goldAmount) });
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
router.post('/accept', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { tradeId } = req.body;

    try {
        const trade = await db('trades').where({ id: tradeId, status: 'active' }).first();
        if (!trade) {
            res.status(404).json({ error: 'Trade not found.' });
            return;
        }

        const isPlayer1 = trade.player1_id === playerId;
        await db('trades').where({ id: tradeId }).update(
            isPlayer1 ? { player1_accepted: true } : { player2_accepted: true }
        );

        const updatedTrade = await db('trades').where({ id: tradeId }).first();

        // Notify both players of acceptance state
        io.to(`player_${trade.player1_id}`).emit('trade_acceptance_updated', {
            player1Accepted: updatedTrade.player1_accepted,
            player2Accepted: updatedTrade.player2_accepted,
        });
        io.to(`player_${trade.player2_id}`).emit('trade_acceptance_updated', {
            player1Accepted: updatedTrade.player1_accepted,
            player2Accepted: updatedTrade.player2_accepted,
        });

        // Both accepted — complete the trade
        logger.info(`Trade ${tradeId} acceptance state: p1=${updatedTrade.player1_accepted} p2=${updatedTrade.player2_accepted}`)
        if (updatedTrade.player1_accepted && updatedTrade.player2_accepted) {
            const offers = await db('trade_offers').where({ trade_id: tradeId });
            const gold = await db('trade_gold').where({ trade_id: tradeId });

            // Transfer items
            // Transfer items
            for (const offer of offers) {
                const givingPlayer = offer.player_id;
                const receivingPlayer = givingPlayer === trade.player1_id ? trade.player2_id : trade.player1_id;

                // Remove from giver
                const invItem = await db('player_inventory').where({ player_id: givingPlayer, item_id: offer.item_id }).first();

                if (!invItem) {
                    // Item no longer in inventory — cancel trade
                    await cancelTrade(tradeId, 'A traded item is no longer in your inventory.');
                    res.status(400).json({ error: 'Trade failed: item no longer available.' });
                    return;
                }

                if (invItem.quantity < offer.quantity) {
                    await cancelTrade(tradeId, 'Insufficient quantity of a traded item.');
                    res.status(400).json({ error: 'Trade failed: insufficient item quantity.' });
                    return;
                }

                if (invItem.quantity <= offer.quantity) {
                    await db('player_inventory').where({ player_id: givingPlayer, item_id: offer.item_id }).delete();
                } else {
                    await db('player_inventory').where({ player_id: givingPlayer, item_id: offer.item_id }).decrement('quantity', offer.quantity);
                }

                // Add to receiver
                const existing = await db('player_inventory').where({ player_id: receivingPlayer, item_id: offer.item_id }).first();
                if (existing) {
                    await db('player_inventory').where({ player_id: receivingPlayer, item_id: offer.item_id }).increment('quantity', offer.quantity);
                } else {
                    await db('player_inventory').insert({ player_id: receivingPlayer, item_id: offer.item_id, quantity: offer.quantity });
                }
            }

            await db('trades').where({ id: tradeId }).update({ status: 'completed' });

            io.to(`player_${trade.player1_id}`).emit('trade_completed', {});
            io.to(`player_${trade.player2_id}`).emit('trade_completed', {});

            logger.info(`Trade ${tradeId} completed between ${trade.player1_id} and ${trade.player2_id}`);
        }

        res.json({ success: true });
    } catch (err) {
        logger.error(`Trade accept error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Cancel trade
router.post('/cancel', requireAuth, async (req: AuthRequest, res: Response) => {
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