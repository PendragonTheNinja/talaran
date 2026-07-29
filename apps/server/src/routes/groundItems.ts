import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { io } from '../index';

const router = Router();
const PRIVATE_WINDOW_SECONDS = 15;

// Get ground items at current location
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const player = await db('players').where({ id: playerId }).first();
        const locationId = player.current_location_id;
        const now = new Date();

        const items = await db('ground_items')
            .where({ location_id: locationId })
            .where(function () {
                this.where('visible_to_all_at', '<=', now)
                    .orWhere('dropped_by_player_id', playerId)
            })
            .join('items', 'ground_items.item_id', 'items.id')
            .select(
                'ground_items.id',
                'ground_items.quantity',
                'ground_items.dropped_by_player_id',
                'ground_items.dropped_at',
                'ground_items.visible_to_all_at',
                'items.name',
                'items.type',
                'items.subtype',
            );

        res.json({ items });
    } catch (err) {
        logger.error(`Ground items error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Drop an item
router.post('/drop', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { itemId, quantity } = req.body;

    try {
        const player = await db('players').where({ id: playerId }).first();
        const locationId = player.current_location_id;

        // Check player has the item
        const invItem = await db('player_inventory')
            .where({ player_id: playerId, item_id: itemId })
            .first();

        if (!invItem) {
            res.status(400).json({ error: 'You do not have that item.' });
            return;
        }

        const dropQty = Math.min(quantity || 1, invItem.quantity);

        if (dropQty <= 0) {
            res.status(400).json({ error: 'Invalid quantity.' });
            return;
        }

        const now = new Date();
        const visibleAt = new Date(now.getTime() + PRIVATE_WINDOW_SECONDS * 1000);

        // Remove from inventory
        if (invItem.quantity <= dropQty) {
            await db('player_inventory').where({ player_id: playerId, item_id: itemId }).delete();
        } else {
            await db('player_inventory')
                .where({ player_id: playerId, item_id: itemId })
                .decrement('quantity', dropQty);
        }

        // Add to ground
        const [groundItem] = await db('ground_items').insert({
            item_id: itemId,
            quantity: dropQty,
            location_id: locationId,
            dropped_by_player_id: playerId,
            dropped_at: now,
            visible_to_all_at: visibleAt,
        }).returning('*');

        const item = await db('items').where({ id: itemId }).first();
        logger.info(`Player ${playerId} dropped ${dropQty}x ${item.name} at location ${locationId}`);

        // Notify the dropper immediately
        io.to(`player_${playerId}`).emit('ground_item_dropped', {
            groundItemId: groundItem.id,
            itemName: item.name,
            quantity: dropQty,
            visibleAt: visibleAt,
        });

        // Schedule public visibility notification
        setTimeout(async () => {
            io.to(`location_${locationId}`).emit('ground_item_visible', {
                groundItemId: groundItem.id,
                itemName: item.name,
                quantity: dropQty,
                locationId,
            });
        }, PRIVATE_WINDOW_SECONDS * 1000);

        res.json({ success: true });
    } catch (err) {
        logger.error(`Drop item error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Pick up an item
router.post('/pickup', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { groundItemId } = req.body;

    try {
        const player = await db('players').where({ id: playerId }).first();
        const now = new Date();

        const groundItem = await db('ground_items').where({ id: groundItemId }).first();

        if (!groundItem) {
            res.status(404).json({ error: 'Item not found.' });
            return;
        }

        if (groundItem.location_id !== player.current_location_id) {
            res.status(400).json({ error: 'That item is not at your location.' });
            return;
        }

        // Check visibility window
        if (groundItem.dropped_by_player_id !== playerId &&
            new Date(groundItem.visible_to_all_at) > now) {
            res.status(403).json({ error: 'That item is not yet visible to you.' });
            return;
        }

        const claimed = await db('ground_items').where({ id: groundItemId }).delete();
        if (claimed === 0) {
            res.status(404).json({ error: 'It is already gone.' });
            return;
        }

        // Add to inventory
        const existing = await db('player_inventory')
            .where({ player_id: playerId, item_id: groundItem.item_id })
            .first();

        if (existing) {
            await db('player_inventory')
                .where({ player_id: playerId, item_id: groundItem.item_id })
                .increment('quantity', groundItem.quantity);
        } else {
            await db('player_inventory').insert({
                player_id: playerId,
                item_id: groundItem.item_id,
                quantity: groundItem.quantity,
            });
        }

        // Remove from ground
        await db('ground_items').where({ id: groundItemId }).delete();

        const item = await db('items').where({ id: groundItem.item_id }).first();

        // Notify all players at location that item was picked up
        io.to(`location_${groundItem.location_id}`).emit('ground_item_picked_up', {
            groundItemId,
        });

        logger.info(`Player ${playerId} picked up ${groundItem.quantity}x ${item.name}`);
        res.json({ success: true, itemName: item.name, quantity: groundItem.quantity });
    } catch (err) {
        logger.error(`Pickup error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;