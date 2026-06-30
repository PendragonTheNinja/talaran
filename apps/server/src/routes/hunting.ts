import { Router, Response } from 'express'
import db from '../db'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { botCheckGate } from '../services/botCheck'
import { canHunt, calculateHuntTimer } from '../services/hunting'
import { levelFromXp } from '../services/xp'
import { logger } from '../index';

const router = Router()

// List huntable animals at the player's current location
router.get('/animals', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId
    try {
        const player = await db('players').where({ id: playerId }).first()
        const animals = await db('huntable_animals')
            .where({ location_id: player.current_location_id, is_active: true })
            .orderBy('required_level')
        res.json({ animals })
    } catch (err) {
        res.json({ animals: [] })
    }
})

router.post('/start', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId
    const { animalId } = req.body
    try {
        const existing = await db('player_actions').where({ player_id: playerId }).first()
        if (existing) {
            res.status(409).json({ error: 'You are already performing an action' })
            return
        }

        const { allowed, reason } = await canHunt(playerId, animalId)
        if (!allowed) {
            res.status(403).json({ error: reason })
            return
        }

        const animal = await db('huntable_animals').where({ id: animalId }).first()
        const huntingSkill = await db('skills').where({ name: 'Hunting' }).first()
        const playerSkill = await db('player_skills')
            .where({ player_id: playerId, skill_id: huntingSkill.id }).first()
        const playerLevel = levelFromXp(playerSkill?.xp ? parseInt(playerSkill.xp) : 0)

        const timerSeconds = calculateHuntTimer(animal.base_timer, animal.min_timer, playerLevel, animal.required_level)
        const now = new Date()
        const completesAt = new Date(now.getTime() + timerSeconds * 1000)

        await db('player_actions').insert({
            player_id: playerId,
            action_type: 'hunting',
            resource_node_id: null,
            action_data: String(animalId),     // which animal we're hunting
            location_id: animal.location_id,
            started_at: now,
            completes_at: completesAt,
            auto_restart: true,
            last_bot_check: now,
            bot_check_pending: false,
        })

        logger.info(`Player ${playerId} started hunting ${animal.name} (id ${animalId})`)
        res.json({ message: 'Hunt started', timerSeconds, completesAt })
    } catch (err) {
        logger.error('Hunt start error: ' + err)
        res.status(500).json({ error: 'Server error' })
    }
})

export default router