import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { roundOffer, standRound } from '../services/rounds'
import { failureStatus } from '../lib/serviceResult'
import { logger } from '../lib/logger'

// Standing a round at a tavern (services/rounds.ts). Full path routes/rounds.ts.

const router = Router()

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        res.json({ offer: await roundOffer(req.player!.playerId) })
    } catch (err) {
        logger.error(`Round offer error: ${err}`)
        res.status(500).json({ error: 'Server error' })
    }
})

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
    const r = await standRound(req.player!.playerId)
    if (!r.success) { res.status(failureStatus(r.error)).json({ error: r.error }); return }
    res.json({ ...r, offer: await roundOffer(req.player!.playerId) })
})

export default router
