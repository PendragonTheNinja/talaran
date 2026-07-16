import { Router, Response } from 'express'
import db from '../db'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { setupRack, loadRack, collectRack, getRackStatus } from '../services/tanning'
import { logger } from '../index';

const router = Router()

/** Everything the tanning panel needs for the player's current location. */
router.get('/status', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId
    try {
        const player = await db('players').where({ id: playerId }).first()
        const status = await getRackStatus(playerId, player.current_location_id)
        res.json(status)
    } catch (err) {
        logger.error('Tanning status error: ' + err)
        res.status(500).json({ error: 'Server error' })
    }
})

/** Set up a tanning rack at the current location (consumes the rack item). */
router.post('/setup', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId
    try {
        const player = await db('players').where({ id: playerId }).first()
        const result = await setupRack(playerId, player.current_location_id)
        if (!result.success) {
            res.status(400).json({ error: result.error })
            return
        }
        res.json({ message: 'Your tanning rack is ready.' })
    } catch (err: any) {
        // Raced double-setup: unique(player_id, location_id, type) catches it
        if (err && err.code === '23505') {
            res.status(409).json({ error: 'You already have a tanning rack here.' })
            return
        }
        logger.error('Tanning setup error: ' + err)
        res.status(500).json({ error: 'Server error' })
    }
})

/** Load hides into the rack to soak. */
router.post('/load', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId
    const { recipeId, hideCount } = req.body
    try {
        const player = await db('players').where({ id: playerId }).first()
        const result = await loadRack(playerId, player.current_location_id, recipeId, hideCount)
        if (!result.success) {
            res.status(400).json({ error: result.error })
            return
        }
        res.json({ message: 'Your hides are soaking.', readyAt: result.readyAt })
    } catch (err) {
        logger.error('Tanning load error: ' + err)
        res.status(500).json({ error: 'Server error' })
    }
})

/** Collect a finished vat. */
router.post('/collect', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId
    const { jobId } = req.body
    try {
        const job = await db('tanning_jobs').where({ id: jobId, player_id: playerId }).first()
        if (!job) {
            res.status(400).json({ error: 'That vat is not yours.' })
            return
        }
        const player = await db('players').where({ id: playerId }).first()
        if (job.location_id !== player.current_location_id) {
            res.status(400).json({ error: 'You must be at the rack to empty the vat.' })
            return
        }
        const result = await collectRack(playerId, jobId)
        if (!result.success) {
            res.status(400).json({ error: result.error })
            return
        }
        res.json(result)
    } catch (err) {
        logger.error('Tanning collect error: ' + err)
        res.status(500).json({ error: 'Server error' })
    }
})

export default router
