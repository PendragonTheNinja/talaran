import { Router, Response } from 'express'
import db from '../db'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { botCheckGate } from '../services/botCheck'
import { affordability, getActiveRecipes, canStartRecipe, recipeTimerFor } from '../services/recipes'
import { checkStation } from '../services/workstations'
import { logger } from '../lib/logger';

const router = Router()

// List all active recipes (client filters/groups by skill)
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const recipes = await getActiveRecipes()

        // Whose bench each recipe would run at, answered by the server rather
        // than guessed from is_active. The client used to infer "slow" from an
        // inactive workstation, which is wrong for tool-less work: smelting at
        // your own half-finished forge is full speed, not the smith's.
        const playerId = req.player!.playerId

        // What the player can actually make, in one pass over the pack.
        const afford = await affordability(playerId, recipes)

        const annotated = await Promise.all(recipes.map(async (r: any) => {
            // false: listing recipes must never spend the player's wood. With
            // this left on, opening the cookhouse bought a fire once per recipe.
            const check = await checkStation(playerId, r, false)
            return {
                ...r,
                available: check.ok,
                usingPublic: check.usingPublic,
                speedMultiplier: check.multiplier,
                stationError: check.ok ? null : check.error,
                // Named so the card can say WHICH tool is wanted rather than a
                // flat "you cannot do this". A cook with an empty rack should be
                // able to read the menu as a shopping list.
                missingTools: check.missingTools ?? [],
                // Materials, so the card can grey itself out and say what is
                // short rather than making the player click to find out.
                canAfford: afford.get(r.id)?.canAfford ?? true,
                missingInputs: afford.get(r.id)?.missingInputs ?? [],
            }
        }))

        res.json({ recipes: annotated })
    } catch (err) {
        logger.error('Recipe list error: ' + err)
        res.status(500).json({ error: 'Server error' })
    }
})

// Start a timed craft (resolved by the game tick; auto-restarts until out of inputs)
router.post('/start', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId
    const { recipeId, actionLimit } = req.body
    try {
        const existing = await db('player_actions').where({ player_id: playerId }).first()
        if (existing) {
            res.status(409).json({ error: 'You are already performing an action' })
            return
        }

        const check = await canStartRecipe(playerId, recipeId)
        if (!check.allowed) {
            res.status(400).json({ error: check.reason })
            return
        }
        const recipe = check.recipe

        const player = await db('players').where({ id: playerId }).first()
        const timerSeconds = await recipeTimerFor(playerId, recipe)
        const now = new Date()
        const completesAt = new Date(now.getTime() + timerSeconds * 1000)

        await db('player_actions').insert({
            player_id: playerId,
            action_type: 'recipe',
            resource_node_id: null,
            action_data: String(recipe.id),     // which recipe we're running
            location_id: player.current_location_id,
            started_at: now,
            completes_at: completesAt,
            auto_restart: true,
            action_limit: actionLimit && actionLimit > 0 ? actionLimit : null,
            last_timer_seconds: timerSeconds,
            last_bot_check: now,
            bot_check_pending: false,
        })

        logger.info(`Player ${playerId} started recipe ${recipe.name} (${recipe.id})`)
        res.json({
            message: 'Started',
            timerSeconds,
            completesAt,
            recipeName: recipe.name,
            skill: recipe.skill,
            flavorText: recipe.flavor_text,
        })
    } catch (err: any) {
        // Raced double-start: the unique constraint on player_actions.player_id catches it
        if (err && err.code === '23505') {
            res.status(409).json({ error: 'You are already performing an action' })
            return
        }
        logger.error('Recipe start error: ' + err)
        res.status(500).json({ error: 'Server error' })
    }
})

export default router
