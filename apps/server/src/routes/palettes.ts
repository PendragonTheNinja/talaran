import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';

const router = Router();

// Custom palettes (Support Us C2, docs/support-spec.md §4).
//
// Safety model: a palette is ONLY a map of whitelisted color tokens to hex
// values. Layout, spacing, fonts, and structure are not in the vocabulary,
// so a palette cannot break the game — only recolor it. Everything else
// (shadow depth, overlays) is derived client-side from these colors.

export const PALETTE_TOKENS = [
    'bg-deepest', 'bg-deep', 'bg-dark', 'bg-mid', 'bg-panel', 'bg-raised', 'bg-hover',
    'gold-dim', 'gold', 'gold-bright', 'gold-shine',
    'red-dark', 'red', 'red-bright', 'red-glow',
    'text-dim', 'text-muted', 'text-base', 'text-bright', 'text-white',
    'border-dark', 'border-mid', 'border-gold', 'border-bright',
    'health', 'mana', 'xp',
] as const;

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_PALETTES = 20;

function validateTokens(tokens: unknown): string | null {
    if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) return 'Invalid palette.';
    const entries = Object.entries(tokens as Record<string, unknown>);
    if (entries.length === 0) return 'Palette is empty.';
    for (const [key, value] of entries) {
        if (!(PALETTE_TOKENS as readonly string[]).includes(key)) return `Unknown token: ${key}`;
        if (typeof value !== 'string' || !HEX.test(value)) return `${key} must be a hex color like #a1b2c3.`;
    }
    return null;
}

async function hasCustomPalettePerk(playerId: number): Promise<boolean> {
    const unlock = await db('player_unlocks')
        .where({ player_id: playerId, unlock_key: 'perk:custom_palette' })
        .first();
    return !!unlock;
}

// List my palettes
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const palettes = await db('player_palettes')
            .where({ player_id: playerId })
            .orderBy('id', 'asc')
            .select('id', 'name', 'tokens', 'is_shared');
        res.json({ palettes, hasPerk: await hasCustomPalettePerk(playerId) });
    } catch (err) {
        logger.error(`Palette list error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Community gallery: every shared palette, newest first
router.get('/shared', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const palettes = await db('player_palettes')
            .join('players', 'player_palettes.player_id', 'players.id')
            .where({ is_shared: true })
            .orderBy('player_palettes.updated_at', 'desc')
            .limit(100)
            .select('player_palettes.id', 'player_palettes.name', 'player_palettes.tokens', 'players.username', 'players.id as owner_id');
        res.json({ palettes });
    } catch (err) {
        logger.error(`Shared gallery error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Another player's shared palettes (viewable by anyone — profile display)
router.get('/player/:playerId', requireAuth, async (req: AuthRequest, res: Response) => {
    const targetId = parseInt(String(req.params.playerId));
    try {
        if (!Number.isInteger(targetId)) {
            res.status(400).json({ error: 'Invalid player.' });
            return;
        }
        const palettes = await db('player_palettes')
            .where({ player_id: targetId, is_shared: true })
            .orderBy('id', 'asc')
            .select('id', 'name', 'tokens');
        res.json({ palettes });
    } catch (err) {
        logger.error(`Shared palette list error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Create
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { name, tokens } = req.body as { name: string; tokens: Record<string, string> };
    try {
        if (!await hasCustomPalettePerk(playerId)) {
            res.status(403).json({ error: 'Custom Palettes is a supporter perk.' });
            return;
        }
        if (typeof name !== 'string' || name.trim().length === 0 || name.length > 40) {
            res.status(400).json({ error: 'Name must be 1-40 characters.' });
            return;
        }
        const tokenError = validateTokens(tokens);
        if (tokenError) {
            res.status(400).json({ error: tokenError });
            return;
        }
        const [{ count }] = await db('player_palettes').where({ player_id: playerId }).count('* as count');
        if (Number(count) >= MAX_PALETTES) {
            res.status(400).json({ error: `You can keep up to ${MAX_PALETTES} palettes — delete one first.` });
            return;
        }
        const [palette] = await db('player_palettes')
            .insert({ player_id: playerId, name: name.trim(), tokens: JSON.stringify(tokens) })
            .returning(['id', 'name', 'tokens', 'is_shared']);
        res.json({ palette });
    } catch (err: any) {
        if (err?.code === '23505') {
            res.status(400).json({ error: 'You already have a palette with that name.' });
            return;
        }
        logger.error(`Palette create error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update (tokens / name / sharing)
router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const paletteId = parseInt(String(req.params.id));
    const { name, tokens, is_shared } = req.body as { name?: string; tokens?: Record<string, string>; is_shared?: boolean };
    try {
        if (!await hasCustomPalettePerk(playerId)) {
            res.status(403).json({ error: 'Custom Palettes is a supporter perk.' });
            return;
        }
        const palette = await db('player_palettes').where({ id: paletteId, player_id: playerId }).first();
        if (!palette) {
            res.status(404).json({ error: 'Palette not found.' });
            return;
        }
        const update: Record<string, unknown> = {};
        if (name !== undefined) {
            if (typeof name !== 'string' || name.trim().length === 0 || name.length > 40) {
                res.status(400).json({ error: 'Name must be 1-40 characters.' });
                return;
            }
            update.name = name.trim();
        }
        if (tokens !== undefined) {
            const tokenError = validateTokens(tokens);
            if (tokenError) {
                res.status(400).json({ error: tokenError });
                return;
            }
            update.tokens = JSON.stringify(tokens);
        }
        if (is_shared !== undefined) update.is_shared = !!is_shared;
        if (Object.keys(update).length === 0) {
            res.status(400).json({ error: 'Nothing to update.' });
            return;
        }
        const [updated] = await db('player_palettes')
            .where({ id: paletteId })
            .update(update)
            .returning(['id', 'name', 'tokens', 'is_shared']);
        res.json({ palette: updated });
    } catch (err: any) {
        if (err?.code === '23505') {
            res.status(400).json({ error: 'You already have a palette with that name.' });
            return;
        }
        logger.error(`Palette update error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const paletteId = parseInt(String(req.params.id));
    try {
        const deleted = await db('player_palettes').where({ id: paletteId, player_id: playerId }).del();
        if (!deleted) {
            res.status(404).json({ error: 'Palette not found.' });
            return;
        }
        // If it was the active theme, fall back to tavern
        await db('player_settings')
            .where({ player_id: playerId, theme: `palette:${paletteId}` })
            .update({ theme: 'tavern' });
        res.json({ success: true });
    } catch (err) {
        logger.error(`Palette delete error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
