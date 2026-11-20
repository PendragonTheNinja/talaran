import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { botCheckGate } from '../services/botCheck'
import { caskState, startBrew, collectBrew } from '../services/brewing'
import { failureStatus } from '../lib/serviceResult'
import { logger } from '../lib/logger'

// The cask (services/brewing.ts). Full path routes/brewing.ts.

const router = Router()

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        res.json(await caskState(req.player!.playerId))
    } catch (err) {
        logger.error(`Cask state error: ${err}`)
        res.status(500).json({ error: 'Server error' })
    }
})

router.post('/start', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
    const r = await startBrew(req.player!.playerId, req.body?.batches)
    if (!r.success) { res.status(failureStatus(r.error)).json({ error: r.error }); return }
    res.json({ ...r, state: await caskState(req.player!.playerId) })
})

router.post('/collect', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
    const r = await collectBrew(req.player!.playerId)
    if (!r.success) { res.status(failureStatus(r.error)).json({ error: r.error }); return }
    res.json({ ...r, state: await caskState(req.player!.playerId) })
})

export default router
