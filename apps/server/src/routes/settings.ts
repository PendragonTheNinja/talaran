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
        const theme = settings?.theme ?? 'tavern';
        let paletteTokens: Record<string, string> | null = null;
        let paletteName: string | null = null;
        if (theme.startsWith('palette:')) {
            const palette = await db('player_palettes').where({ id: parseInt(theme.slice(8)) }).first();
            if (palette) {
                paletteTokens = typeof palette.tokens === 'string' ? JSON.parse(palette.tokens) : palette.tokens;
                paletteName = palette.name;
            }
        }
        res.json({
            mutedChannels: settings?.muted_channels ? JSON.parse(settings.muted_channels) : [],
            showTravelLog: settings?.show_travel_log ?? true,
            theme,
            paletteTokens,
            paletteName,
        });
    } catch (err) {
        res.json({ mutedChannels: [], showTravelLog: true, theme: 'tavern' });
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

// Update theme preference. Free themes for everyone; premium themes require
// the matching player_unlocks row ('theme:<id>').
const FREE_THEMES = ['tavern', 'scriptorium'];
const PREMIUM_THEMES = ['moonveil', 'mosswood', 'forgeheart'];
router.post('/theme', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { theme } = req.body;
    try {
        if (typeof theme !== 'string' || (!FREE_THEMES.includes(theme) && !PREMIUM_THEMES.includes(theme) && !theme.startsWith('palette:'))) {
            res.status(400).json({ error: 'Unknown theme.' });
            return;
        }
        if (PREMIUM_THEMES.includes(theme)) {
            const unlock = await db('player_unlocks')
                .where({ player_id: playerId, unlock_key: `theme:${theme}` })
                .first();
            if (!unlock) {
                res.status(403).json({ error: 'You have not unlocked that theme.' });
                return;
            }
        }
        if (theme.startsWith('palette:')) {
            const paletteId = parseInt(theme.slice(8));
            const perk = await db('player_unlocks')
                .where({ player_id: playerId, unlock_key: 'perk:custom_palette' })
                .first();
            if (!perk) {
                res.status(403).json({ error: 'Custom Palettes is a supporter perk.' });
                return;
            }
            const palette = Number.isInteger(paletteId)
                ? await db('player_palettes').where({ id: paletteId }).first()
                : null;
            if (!palette || (palette.player_id !== playerId && !palette.is_shared)) {
                res.status(404).json({ error: 'Palette not found or not shared.' });
                return;
            }
        }
        await db('player_settings')
            .insert({ player_id: playerId, theme })
            .onConflict(['player_id'])
            .merge(['theme']);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;