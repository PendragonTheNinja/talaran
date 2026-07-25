import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../index';

const router = Router();

// Get all quests with player progress
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const quests = await db('quests').where({ is_active: true });
        const playerQuests = await db('player_quests').where({ player_id: playerId });
        const objectives = await db('quest_objectives');
        const playerObjectives = await db('player_quest_objectives').where({ player_id: playerId });

        const result = quests.map(quest => {
            const playerQuest = playerQuests.find(pq => pq.quest_id === quest.id);
            const questObjectives = objectives
                .filter(o => o.quest_id === quest.id)
                .sort((a, b) => a.order - b.order)
                .map(obj => {
                    const playerObj = playerObjectives.find(po => po.objective_id === obj.id);
                    return {
                        ...obj,
                        current_amount: playerObj?.current_amount || 0,
                        is_complete: playerObj?.is_complete || false,
                    };
                });

            return {
                ...quest,
                status: playerQuest?.status || 'not_started',
                started_at: playerQuest?.started_at || null,
                completed_at: playerQuest?.completed_at || null,
                objectives: questObjectives,
            };
        });

        res.json({ quests: result });
    } catch (err) {
        logger.error(`Get quests error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Start a quest
router.post('/:id/start', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const questId = parseInt(req.params.id as string);
    try {
        const quest = await db('quests').where({ id: questId, is_active: true }).first();
        if (!quest) {
            res.status(404).json({ error: 'Quest not found.' });
            return;
        }

        const existing = await db('player_quests').where({ player_id: playerId, quest_id: questId }).first();
        if (existing) {
            res.status(400).json({ error: 'You have already started this quest.' });
            return;
        }

        await db('player_quests').insert({
            player_id: playerId,
            quest_id: questId,
            status: 'active',
        });

        // Initialize objective progress
        const objectives = await db('quest_objectives').where({ quest_id: questId });
        for (const obj of objectives) {
            await db('player_quest_objectives').insert({
                player_id: playerId,
                objective_id: obj.id,
                current_amount: 0,
                is_complete: false,
            });
        }
        await backfillQuestObjectives(playerId, questId);

        logger.info(`Player ${playerId} started quest ${questId}`);
        res.json({ success: true, message: 'Quest started!' });
    } catch (err) {
        logger.error(`Start quest error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * Grant a quest's item list. Used for both start_items (on accept) and
 * reward_items (on completion). Missing items are logged loudly, never silent —
 * a typo'd reward should be visible, not a quest that gives nothing.
 */
export async function grantQuestItems(
    playerId: number,
    itemsJson: string | null
): Promise<{ itemName: string; quantity: number }[]> {
    if (!itemsJson) return [];
    let items: { itemName: string; qty: number }[];
    try {
        items = JSON.parse(itemsJson);
    } catch {
        logger.error(`grantQuestItems: bad JSON for player ${playerId}`);
        return [];
    }

    const granted: { itemName: string; quantity: number }[] = [];
    for (const entry of items) {
        const item = await db('items').where({ name: entry.itemName }).first();
        if (!item) {
            logger.error(`grantQuestItems: item "${entry.itemName}" not found`);
            continue;
        }
        const existing = await db('player_inventory')
            .where({ player_id: playerId, item_id: item.id }).first();
        if (existing) {
            await db('player_inventory').where({ id: existing.id }).increment('quantity', entry.qty);
        } else {
            await db('player_inventory').insert({
                player_id: playerId, item_id: item.id, quantity: entry.qty,
            });
        }
        const { recordItemFirst } = await import('../services/inventory');
        await recordItemFirst(playerId, item.id, 'quest');
        granted.push({ itemName: entry.itemName, quantity: entry.qty });
    }
    return granted;
}

export async function checkQuestCompletion(playerId: number, questId: number): Promise<boolean> {
    const objectives = await db('quest_objectives').where({ quest_id: questId });
    const playerObjectives = await db('player_quest_objectives')
        .where({ player_id: playerId })
        .whereIn('objective_id', objectives.map(o => o.id));

    const allComplete = objectives.every(obj => {
        const po = playerObjectives.find(po => po.objective_id === obj.id);
        return po?.is_complete;
    });

    if (allComplete) {
        await db('player_quests')
            .where({ player_id: playerId, quest_id: questId })
            .update({ status: 'completed', completed_at: new Date() });

        // Rewards
        const quest = await db('quests').where({ id: questId }).first();
        if (quest) {
            const granted = await grantQuestItems(playerId, quest.reward_items);

            if (quest.reward_xp && quest.skill) {
                const skill = await db('skills').where({ name: quest.skill }).first();
                if (skill) {
                    const ps = await db('player_skills')
                        .where({ player_id: playerId, skill_id: skill.id }).first();
                    if (ps) {
                        await db('player_skills')
                            .where({ player_id: playerId, skill_id: skill.id })
                            .increment('xp', quest.reward_xp);
                    } else {
                        await db('player_skills').insert({
                            player_id: playerId, skill_id: skill.id, xp: quest.reward_xp,
                        });
                    }
                }
            }

            if (granted.length > 0 || quest.reward_xp) {
                const { io } = await import('../index');
                io.to(`player_${playerId}`).emit('quest_rewards', {
                    questName: quest.name,
                    items: granted,
                    xp: quest.reward_xp || 0,
                    skill: quest.skill,
                });
            }
        }

        logger.info(`Player ${playerId} completed quest ${questId}`);
    }

    return allComplete;
}


// Some objectives describe a STATE the world may already be in — you might have
// raised a farmstead or broken a field long before anyone offered you a quest about
// it. Those steps would then be impossible to finish (an annual plot stays tilled,
// so "till a field" can deadlock until a level-up grants a new one). On accept,
// mark any objective the player has already satisfied.
export async function backfillQuestObjectives(playerId: number, questId: number): Promise<void> {
    const objectives = await db('quest_objectives').where({ quest_id: questId });

    for (const obj of objectives) {
        let satisfied = false;

        if (obj.type === 'build' && obj.target_item === 'Farmstead') {
            satisfied = !!(await db('player_properties')
                .where({ player_id: playerId, type: 'farmstead' }).first());
        } else if (obj.type === 'till' && obj.target_item === 'Field') {
            satisfied = !!(await db('farm_plots')
                .join('player_properties', 'farm_plots.property_id', 'player_properties.id')
                .where('player_properties.player_id', playerId)
                .whereIn('farm_plots.state', ['tilled', 'growing'])
                .first());
        }

        if (satisfied) {
            await db('player_quest_objectives')
                .where({ player_id: playerId, objective_id: obj.id })
                .update({ current_amount: obj.required_amount, is_complete: true });
        }
    }
}

export async function updateQuestObjectiveProgress(
    playerId: number,
    objectiveType: string,
    targetItem: string,
    amount: number = 1
): Promise<void> {
    try {
        const activeQuests = await db('player_quests')
            .where({ player_id: playerId, status: 'active' });

        for (const pq of activeQuests) {
            const objectives = await db('quest_objectives')
                .where({ quest_id: pq.quest_id, type: objectiveType, target_item: targetItem })
                .orderBy('order', 'asc');

            for (const obj of objectives) {
                const playerObj = await db('player_quest_objectives')
                    .where({ player_id: playerId, objective_id: obj.id })
                    .first();

                if (!playerObj || playerObj.is_complete) continue;

                const newAmount = Math.min((playerObj.current_amount || 0) + amount, obj.required_amount);
                const isComplete = newAmount >= obj.required_amount;

                await db('player_quest_objectives')
                    .where({ player_id: playerId, objective_id: obj.id })
                    .update({ current_amount: newAmount, is_complete: isComplete });

                if (isComplete) {
                    await checkQuestCompletion(playerId, pq.quest_id);
                }

                // Emit progress update via socket
                const { io } = await import('../index');
                io.to(`player_${playerId}`).emit('quest_progress', {
                    questId: pq.quest_id,
                    objectiveId: obj.id,
                    currentAmount: newAmount,
                    requiredAmount: obj.required_amount,
                    isComplete,
                });
            }
        }
    } catch (err) {
        logger.error(`Update quest objective error: ${err}`);
    }
}

export default router;