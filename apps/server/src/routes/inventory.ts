import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;

  try {
    const inventory = await db('player_inventory')
      .join('items', 'player_inventory.item_id', 'items.id')
      .where({ 'player_inventory.player_id': playerId })
      .select(
        'player_inventory.id',
        'player_inventory.quantity',
        'items.id as item_id',
        'items.name',
        'items.type',
        'items.subtype',
        'items.quality',
        'items.tier',
        'items.description',
        'items.stackable'
      );

    res.json({ inventory });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;