import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../index';
import { applyBuffFromItem, activeBuff } from '../services/buffs';

const router = Router();

/**
 * The effect in words. The stored magnitude means something different per
 * effect, so a bare number would tell the player nothing: seconds for a timer,
 * a percent increase for rare finds, a percent chance for a double yield, a
 * percent cut for travel.
 */
function describeBuff(buff: { effectType: string; skill: string | null; magnitude: number }): string {
    const where = buff.skill ? buff.skill : 'every skill';
    switch (buff.effectType) {
        case 'timer': return `${buff.magnitude}% off every ${where} action`;
        case 'rare': return `${buff.magnitude}% better rare finds at ${where}`;
        case 'double': return `${buff.magnitude}% chance of a double yield at ${where}`;
        case 'travel': return `${buff.magnitude}% faster travel`;
        default: return `A boon to ${where}`;
    }
}

function describeDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return h === 1 ? 'an hour' : `${h} hours`;
    return m === 1 ? 'a minute' : `${m} minutes`;
}

/**
 * GET /api/buffs — what is running, if anything.
 *
 * Returns null rather than 404 when nothing is active: "no buff" is a normal
 * state, not a missing resource, and a 404 makes every caller write a catch.
 */
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const buff = await activeBuff(req.player!.playerId);
        res.json({ buff });
    } catch (err) {
        logger.error(`Get buff error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/buffs/eat — eat a provision.
 *
 * Instant, like equipping. There is no timer to resolve, so this does not go
 * through the action system at all: sitting down to eat a pasty is not an
 * activity the game needs to model.
 */
router.post('/eat', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const playerId = req.player!.playerId;
        const itemName = String(req.body?.itemName ?? '');
        if (!itemName) return res.status(400).json({ error: 'Nothing named.' });

        const result = await applyBuffFromItem(playerId, itemName);
        if (!result.ok) return res.status(400).json({ error: result.error });

        const buff = await activeBuff(playerId);

        // Say what it actually did. "You eat the hedgerow basket" leaves the
        // player with no idea what they gained or for how long, which is the
        // whole point of eating it.
        const parts = [`You eat the ${itemName.toLowerCase()}.`];
        if (buff) parts.push(`${describeBuff(buff)} for ${describeDuration(buff.secondsLeft)}.`);
        if (result.replaced) parts.push(`Your ${result.replaced.toLowerCase()} is gone.`);

        res.json({ success: true, message: parts.join(' '), buff });
    } catch (err) {
        logger.error(`Eat provision error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/** Everything edible in the pack that carries an effect. */
router.get('/provisions', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const rows = await db('player_inventory as pi')
            .join('items as i', 'i.id', 'pi.item_id')
            .where('pi.player_id', req.player!.playerId)
            .where('pi.quantity', '>', 0)
            .whereNotNull('i.buff_effect')
            .orderBy('i.name', 'asc')
            .select(
                'i.name as itemName',
                'pi.quantity as quantity',
                'i.buff_effect as effect',
                'i.buff_skill as skill',
                'i.buff_magnitude as magnitude',
                'i.buff_seconds as seconds',
            );
        res.json({ provisions: rows });
    } catch (err) {
        logger.error(`List provisions error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
