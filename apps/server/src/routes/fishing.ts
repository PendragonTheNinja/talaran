import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { botCheckGate } from '../services/botCheck';
import { logger } from '../index';
import {
    getFishingOverview,
    canFishHere,
    convertBaitItem,
    getBaitPouch,
    equippedToolTier,
    playerLevelFor,
    rodTimer,
    netTimer,
    cutBaitTimer,
    BAIT_CATEGORIES,
} from '../services/fishing';

const router = Router();

/**
 * Insert a player_actions row, translating the unique-constraint violation into
 * the same 409 the pre-check gives.
 *
 * player_actions.player_id is unique, and that constraint is the real guard: two
 * start requests a millisecond apart both pass the SELECT and both insert. The
 * pre-check is the friendly path, pg 23505 is the correct one.
 */
async function insertAction(row: Record<string, unknown>): Promise<{ ok: true } | { ok: false }> {
    try {
        await db('player_actions').insert(row);
        return { ok: true };
    } catch (err: any) {
        if (err?.code === '23505') return { ok: false };
        throw err;
    }
}

// Everything the fishing panel needs: the pool with discovery state, the current
// window and season, the bait pouch, and what can still be turned into bait.
router.get('/overview', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const player = await db('players').where({ id: playerId }).select('current_location_id').first();
        if (!player) { res.status(404).json({ error: 'Player not found' }); return; }
        const data = await getFishingOverview(playerId, player.current_location_id);
        res.json(data);
    } catch (err) {
        logger.error(`Get fishing overview error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Turn pack items into pouch bait. Instant, no action, no XP.
router.post('/bait/convert', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { itemName, quantity } = req.body;
    try {
        if (!itemName || typeof itemName !== 'string') {
            res.status(400).json({ error: 'No bait chosen.' }); return;
        }
        const qty = Number.isFinite(Number(quantity)) ? Math.max(1, Math.floor(Number(quantity))) : 1;
        const result = await convertBaitItem(playerId, itemName, qty);
        if (!result.success) { res.status(400).json({ error: result.error }); return; }
        res.json({ ...result, pouch: await getBaitPouch(playerId) });
    } catch (err) {
        logger.error(`Convert bait error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/bait', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        res.json({ pouch: await getBaitPouch(playerId) });
    } catch (err) {
        logger.error(`Get bait pouch error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Begin rod fishing (auto-repeats via the game tick).
//
// The chosen bait category is stored in action_data and PERSISTS across casts:
// the tick keeps drawing from the pouch until it runs dry, then carries on
// baitless with a notice rather than stopping the action.
router.post('/start', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { baitCategory } = req.body;
    try {
        const existing = await db('player_actions').where({ player_id: playerId }).first();
        if (existing) { res.status(409).json({ error: 'You are already performing an action' }); return; }

        const player = await db('players').where({ id: playerId }).select('current_location_id').first();
        if (!player) { res.status(404).json({ error: 'Player not found' }); return; }

        const { allowed, reason } = await canFishHere(playerId, player.current_location_id, 'rod');
        if (!allowed) { res.status(403).json({ error: reason }); return; }

        const bait = typeof baitCategory === 'string'
            && (BAIT_CATEGORIES as readonly string[]).includes(baitCategory)
            ? baitCategory
            : '';

        const level = await playerLevelFor(playerId, 'Fishing');
        const tier = await equippedToolTier(playerId, 'fishing_rod');
        // The pouch is checked at resolve time, not here: the timer shown at
        // start should match the cast the player is about to get.
        const pouch = await getBaitPouch(playerId);
        const baited = bait !== '' && (pouch[bait] || 0) > 0;
        const timerSeconds = rodTimer(level, tier, baited);

        const now = new Date();
        const inserted = await insertAction({
            player_id: playerId,
            action_type: 'fishing_rod',
            action_data: bait,
            location_id: player.current_location_id,
            started_at: now,
            completes_at: new Date(now.getTime() + timerSeconds * 1000),
            last_timer_seconds: timerSeconds,
            auto_restart: true,
            last_bot_check: now,
            bot_check_pending: false,
        });
        if (!inserted.ok) { res.status(409).json({ error: 'You are already performing an action' }); return; }

        logger.info(`Player ${playerId} started rod fishing at ${player.current_location_id} (bait: ${bait || 'none'})`);
        res.json({ message: 'Fishing started', timerSeconds, completesAt: new Date(now.getTime() + timerSeconds * 1000) });
    } catch (err) {
        logger.error(`Start fishing error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Begin net fishing. Volume, not rate: 4 to 6 fish from the bottom of the pool.
router.post('/net/start', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const existing = await db('player_actions').where({ player_id: playerId }).first();
        if (existing) { res.status(409).json({ error: 'You are already performing an action' }); return; }

        const player = await db('players').where({ id: playerId }).select('current_location_id').first();
        if (!player) { res.status(404).json({ error: 'Player not found' }); return; }

        const { allowed, reason } = await canFishHere(playerId, player.current_location_id, 'net');
        if (!allowed) { res.status(403).json({ error: reason }); return; }

        const level = await playerLevelFor(playerId, 'Fishing');
        const tier = await equippedToolTier(playerId, 'fishing_net');
        const timerSeconds = netTimer(level, tier);

        const now = new Date();
        const inserted = await insertAction({
            player_id: playerId,
            action_type: 'fishing_net',
            action_data: '',
            location_id: player.current_location_id,
            started_at: now,
            completes_at: new Date(now.getTime() + timerSeconds * 1000),
            last_timer_seconds: timerSeconds,
            auto_restart: true,
            last_bot_check: now,
            bot_check_pending: false,
        });
        if (!inserted.ok) { res.status(409).json({ error: 'You are already performing an action' }); return; }

        logger.info(`Player ${playerId} started net fishing at ${player.current_location_id}`);
        res.json({ message: 'Net fishing started', timerSeconds, completesAt: new Date(now.getTime() + timerSeconds * 1000) });
    } catch (err) {
        logger.error(`Start net fishing error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Cut a fish down for bait. Repeats while that species remains in the pack, so
// clearing a stack of forty is one click rather than forty.
router.post('/cut', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { species } = req.body;
    try {
        const existing = await db('player_actions').where({ player_id: playerId }).first();
        if (existing) { res.status(409).json({ error: 'You are already performing an action' }); return; }

        if (!species || typeof species !== 'string') {
            res.status(400).json({ error: 'No fish chosen.' }); return;
        }
        // kind is checked here and not only in the picker: hiding a row in the
        // client is decoration, and salvage shares this table with fish.
        const row = await db('fish_species').where({ name: species, kind: 'fish' }).first();
        if (!row) { res.status(400).json({ error: 'That is not a fish you can cut for bait.' }); return; }

        if ((await equippedToolTier(playerId, 'butcher_knife')) === 0) {
            res.status(403).json({ error: 'You need a butchering knife equipped to cut bait.' }); return;
        }

        const item = await db('items').where({ name: row.item_name }).first();
        const inv = item
            ? await db('player_inventory').where({ player_id: playerId, item_id: item.id }).first()
            : null;
        if (!inv || inv.quantity < 1) {
            res.status(400).json({ error: 'You have none of those to cut.' }); return;
        }

        const player = await db('players').where({ id: playerId }).select('current_location_id').first();
        const timerSeconds = cutBaitTimer();

        const now = new Date();
        const inserted = await insertAction({
            player_id: playerId,
            action_type: 'fishing_cut_bait',
            action_data: species,
            location_id: player?.current_location_id ?? null,
            started_at: now,
            completes_at: new Date(now.getTime() + timerSeconds * 1000),
            last_timer_seconds: timerSeconds,
            auto_restart: true,
            last_bot_check: now,
            bot_check_pending: false,
        });
        if (!inserted.ok) { res.status(409).json({ error: 'You are already performing an action' }); return; }

        logger.info(`Player ${playerId} started cutting ${species} for bait`);
        res.json({ message: 'Cutting bait', timerSeconds, completesAt: new Date(now.getTime() + timerSeconds * 1000) });
    } catch (err) {
        logger.error(`Start cut bait error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
