import { Router, Response } from 'express';
import db from '../db';
import bcrypt from 'bcrypt';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';

const router = Router();

// Get settings
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const settings = await db('player_settings').where({ player_id: playerId }).first();
        res.json({
            mutedChannels: settings?.muted_channels ? JSON.parse(settings.muted_channels) : [],
            showTravelLog: settings?.show_travel_log ?? true,
        });
    } catch (err) {
        res.json({ mutedChannels: [], showTravelLog: true });
    }
});

// Change password
router.post('/password', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { currentPassword, newPassword } = req.body;
    try {
        const player = await db('players').where({ id: playerId }).first();
        const valid = await bcrypt.compare(currentPassword, player.password_hash);
        if (!valid) {
            res.status(400).json({ error: 'Current password is incorrect.' });
            return;
        }
        const hash = await bcrypt.hash(newPassword, 10);
        await db('players').where({ id: playerId }).update({ password_hash: hash });
        logger.info(`Player ${playerId} changed password`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Change email
router.post('/email', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { newEmail, password } = req.body;
    try {
        const player = await db('players').where({ id: playerId }).first();
        const valid = await bcrypt.compare(password, player.password_hash);
        if (!valid) {
            res.status(400).json({ error: 'Password is incorrect.' });
            return;
        }
        const existing = await db('players').where({ email: newEmail }).whereNot({ id: playerId }).first();
        if (existing) {
            res.status(400).json({ error: 'That email is already in use.' });
            return;
        }
        await db('players').where({ id: playerId }).update({ email: newEmail });
        logger.info(`Player ${playerId} changed email`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Update chat settings
router.post('/chat', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { mutedChannels } = req.body;
    try {
        await db('player_settings')
            .insert({ player_id: playerId, muted_channels: JSON.stringify(mutedChannels) })
            .onConflict(['player_id'])
            .merge();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Update travel log preference
router.post('/travel-log', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { showTravelLog } = req.body;
    try {
        await db('player_settings')
            .insert({ player_id: playerId, show_travel_log: !!showTravelLog })
            .onConflict(['player_id'])
            .merge(['show_travel_log']);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;