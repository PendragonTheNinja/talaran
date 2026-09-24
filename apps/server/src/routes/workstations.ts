import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import {
    describeStation,
    eligibleForSlot,
    socketTool,
    unsocketTool,
    lightCampfire,
    fuelCostFor,
    startBuildHearth,
    HEARTH_COST,
    HEARTH_BUILD_SECONDS,
    HEARTH_LOCATION,
} from '../services/workstations';
import { BUILD_MALLET } from '../services/construction';

const router = Router();

/**
 * Station types are a closed set. `type` and `slot` both reach a WHERE on
 * workstation_slot_types, so neither is trusted from the client unchecked.
 */
async function isKnownStation(type: string): Promise<boolean> {
    const row = await db('workstation_slot_types').where({ station_type: type }).first();
    return !!row;
}

/**
 * Everything the paper doll needs in one response: the slots this station type
 * has, what is in each, and what in the player's pack would fit the empty ones.
 *
 * Returned by the GET and by both mutations, following the equipment route:
 * answering a write with only a message leaves the client to re-fetch, and a
 * late or out-of-order fetch paints the slot as it was a moment ago.
 */
async function loadStation(playerId: number, locationId: number, type: string) {
    const station = await describeStation(playerId, locationId, type);

    const slots = await Promise.all(
        station.slots.map(async (s) => ({
            ...s,
            eligible: s.filled.length >= s.capacity
                ? []
                : await eligibleForSlot(playerId, type, s.slot),
        })),
    );

    return { ...station, slots };
}

// POST /api/workstations/hearth - start building one where you stand.
router.post('/hearth', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const result = await startBuildHearth(req.player!.playerId);
        if (!result.ok) return res.status(400).json({ error: result.error });
        res.json({ message: 'Setting stone', timerSeconds: result.timerSeconds });
    } catch (err) {
        logger.error(`Build hearth error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/workstations/hearth/cost - the materials, so the prompt can name them.
router.get('/hearth/cost', requireAuth, async (_req: AuthRequest, res: Response) => {
    res.json({
        cost: HEARTH_COST,
        seconds: HEARTH_BUILD_SECONDS,
        location: HEARTH_LOCATION,
        // Named here so the prompt can say it up front. Being refused after
        // confirming is a worse experience than being told before.
        tool: BUILD_MALLET.itemName,
    });
});

// GET /api/workstations/campfire/cost?itemName=... - what lighting this costs.
//
// Asked before the confirmation so the prompt can name a real number rather
// than the client hardcoding the quality table and drifting from the server.
router.get('/campfire/cost', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const itemName = String(req.query.itemName ?? '');
        const cost = itemName ? await fuelCostFor(itemName) : null;
        res.json({ cost });
    } catch (err) {
        logger.error(`Campfire cost error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/workstations/campfire - set one down where you stand.
//
// Declared before the /:type routes: Express matches in order, and 'campfire'
// would otherwise be read as a station type.
router.post('/campfire', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const playerId = req.player!.playerId;
        const player = await db('players').where({ id: playerId }).first();
        if (!player) return res.status(404).json({ error: 'Player not found.' });

        const logName = String(req.body?.itemName ?? '');
        if (!logName) return res.status(400).json({ error: 'Nothing named.' });

        const result = await lightCampfire(playerId, player.current_location_id, logName);
        if (!result.ok) return res.status(400).json({ error: result.error });

        res.json({
            success: true,
            message: `You strike a spark into ${result.used} ${logName.toLowerCase()}${result.used === 1 ? '' : 's'} and get a fire going. It will not last long.`,
            secondsLeft: result.secondsLeft,
        });
    } catch (err) {
        logger.error(`Light campfire error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/workstations/:type - the paper doll for where the player stands
router.get('/:type', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const playerId = req.player!.playerId;
        const type = String(req.params.type);
        if (!(await isKnownStation(type))) {
            return res.status(404).json({ error: 'No such workstation.' });
        }

        const player = await db('players').where({ id: playerId }).first();
        if (!player) return res.status(404).json({ error: 'Player not found.' });

        res.json(await loadStation(playerId, player.current_location_id, type));
    } catch (err) {
        logger.error(`GET workstation error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/workstations/:type/socket   { slot, itemName }
router.post('/:type/socket', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const playerId = req.player!.playerId;
        const type = String(req.params.type);
        const { slot, itemName } = req.body ?? {};

        if (!slot || !itemName) return res.status(400).json({ error: 'Missing slot or item.' });
        if (!(await isKnownStation(type))) {
            return res.status(404).json({ error: 'No such workstation.' });
        }

        const player = await db('players').where({ id: playerId }).first();
        if (!player) return res.status(404).json({ error: 'Player not found.' });

        const result = await socketTool(
            playerId,
            player.current_location_id,
            type,
            String(slot),
            String(itemName),
        );
        if (!result.success) return res.status(400).json({ error: result.error });

        res.json({
            success: true,
            message: `You fit the ${String(itemName).toLowerCase()} into place.`,
            station: await loadStation(playerId, player.current_location_id, type),
        });
    } catch (err) {
        logger.error(`Socket tool error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/workstations/:type/unsocket   { slot, slotIndex }
router.post('/:type/unsocket', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const playerId = req.player!.playerId;
        const type = String(req.params.type);
        const { slot, slotIndex } = req.body ?? {};

        if (!slot) return res.status(400).json({ error: 'Missing slot.' });
        if (!(await isKnownStation(type))) {
            return res.status(404).json({ error: 'No such workstation.' });
        }

        const player = await db('players').where({ id: playerId }).first();
        if (!player) return res.status(404).json({ error: 'Player not found.' });

        const result = await unsocketTool(
            playerId,
            player.current_location_id,
            type,
            String(slot),
            Number(slotIndex ?? 0),
        );
        if (!result.success) return res.status(400).json({ error: result.error });

        res.json({
            success: true,
            message: 'You take it back off the bench.',
            station: await loadStation(playerId, player.current_location_id, type),
        });
    } catch (err) {
        logger.error(`Unsocket tool error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
