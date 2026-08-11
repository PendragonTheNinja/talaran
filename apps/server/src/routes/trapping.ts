import { Router, Response } from 'express'
import db from '../db'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { getPlayerTraps, placeTrap, collectTrap, dismantleTrap, trapSlotsForLevel, baitOptionsAt } from '../services/trapping'
import { convertibleBait } from '../services/fishing'
import { levelFromXp } from '../services/xp'
import { logger } from '../index';

const router = Router()

async function huntingLevelOf(playerId: number): Promise<number> {
    const skill = await db('skills').where({ name: 'Hunting' }).first()
    if (!skill) return 1
    const ps = await db('player_skills').where({ player_id: playerId, skill_id: skill.id }).first()
    return ps ? levelFromXp(parseInt(ps.xp)) : 1
}

/** Everything the Trapline modal needs in one call. Sprung traps never reveal their species. */
router.get('/traps', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId
    try {
        const player = await db('players').where({ id: playerId }).first()
        const locationId = player.current_location_id

        const traps = await getPlayerTraps(playerId, locationId)
        const level = await huntingLevelOf(playerId)
        const usedRow = await db('player_traps').where({ player_id: playerId }).count('id as count').first()
        const used = usedRow ? parseInt(String(usedRow.count)) : 0

        const types = await db('trap_types').where({ is_active: true }).orderBy('required_level')
        const trapTypes = []
        for (const t of types) {
            const item = await db('items').where({ name: t.item_name }).first()
            const inv = item
                ? await db('player_inventory').where({ player_id: playerId, item_id: item.id }).first()
                : null
            trapTypes.push({
                id: t.id,
                name: t.name,
                itemName: t.item_name,
                requiredLevel: t.required_level,
                inInventory: inv ? inv.quantity : 0,
            })
        }

        res.json({ traps, huntingLevel: level, slots: { used, max: trapSlotsForLevel(level) }, trapTypes })
    } catch (err) {
        logger.error('Trapping traps error: ' + err)
        res.status(500).json({ error: 'Server error' })
    }
})

/** Baits anything here wants, and how much of each the player holds. */
router.get('/bait', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId
    try {
        const player = await db('players').where({ id: playerId }).first()
        const [baits, convertible] = await Promise.all([
            baitOptionsAt(playerId, player.current_location_id),
            convertibleBait(playerId),
        ])
        res.json({ baits, convertible })
    } catch (err) {
        logger.error('Trapping bait error: ' + err)
        res.status(500).json({ error: 'Server error' })
    }
})

/** Place a trap at the player's current location. */
router.post('/place', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId
    const { trapTypeId, bait } = req.body
    try {
        const player = await db('players').where({ id: playerId }).first()
        const result = await placeTrap(
            playerId, trapTypeId, player.current_location_id,
            typeof bait === 'string' && bait ? bait : null,
        )
        if (!result.success) {
            res.status(400).json({ error: result.error })
            return
        }
        res.json({ message: 'Trap placed.' })
    } catch (err) {
        logger.error('Trapping place error: ' + err)
        res.status(500).json({ error: 'Server error' })
    }
})

/** You walk your line: collecting requires standing at the trap's location. */
router.post('/collect', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId
    const { trapId } = req.body
    try {
        const trap = await db('player_traps').where({ id: trapId, player_id: playerId }).first()
        if (!trap) {
            res.status(400).json({ error: 'That trap is not yours to check.' })
            return
        }
        const player = await db('players').where({ id: playerId }).first()
        if (trap.location_id !== player.current_location_id) {
            res.status(400).json({ error: 'You must be at the trap to check it.' })
            return
        }

        const result = await collectTrap(playerId, trapId)
        if (!result.success) {
            res.status(400).json({ error: result.error })
            return
        }
        res.json(result)
    } catch (err) {
        logger.error('Trapping collect error: ' + err)
        res.status(500).json({ error: 'Server error' })
    }
})

/** Dismantle an empty trap (returns the trap item). Sprung traps must be collected first. */
router.post('/dismantle', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId
    const { trapId } = req.body
    try {
        const trap = await db('player_traps').where({ id: trapId, player_id: playerId }).first()
        if (!trap) {
            res.status(400).json({ error: 'That trap is not yours.' })
            return
        }
        const player = await db('players').where({ id: playerId }).first()
        if (trap.location_id !== player.current_location_id) {
            res.status(400).json({ error: 'You must be at the trap to dismantle it.' })
            return
        }

        const result = await dismantleTrap(playerId, trapId)
        if (!result.success) {
            res.status(400).json({ error: result.error })
            return
        }
        res.json({ message: `${result.itemName} recovered.` })
    } catch (err) {
        logger.error('Trapping dismantle error: ' + err)
        res.status(500).json({ error: 'Server error' })
    }
})

export default router
