import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import type { Knex } from 'knex';
import { logger } from '../lib/logger';
import { awardXp } from '../services/xp';
import { creditGoldWithin } from '../services/gold';
import { addItemToInventoryWithin, recordItemFirst } from '../services/inventory';
import { pushToPlayer } from '../lib/realtime';
import { afterCommit } from '../lib/afterCommit';

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
    itemsJson: string | null,
    x: Knex | Knex.Transaction = db,
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
        const item = await x('items').where({ name: entry.itemName }).first();
        if (!item) {
            logger.error(`grantQuestItems: item "${entry.itemName}" not found`);
            continue;
        }
        // Locked and relative, on the caller's executor, so a quest reward
        // commits or rolls back with the completion that earned it.
        await addItemToInventoryWithin(x, playerId, item.id, entry.qty);
        // Firsts are bookkeeping written through the global connection, so they
        // wait for the commit rather than running mid-transaction.
        afterCommit(x, () => recordItemFirst(playerId, item.id, 'quest'));
        granted.push({ itemName: entry.itemName, quantity: entry.qty });
    }
    return granted;
}

export interface QuestRewardSummary {
    questName: string;
    items: Array<{ itemName: string; quantity: number }>;
    xp: number;
    skill: string | null;
    gold: number;
}

/**
 * Returns the reward summary when this call is what finished the quest, and
 * null otherwise.
 *
 * The summary is returned rather than only broadcast so the NPC dialogue can
 * show the rewards as the last thing the quest-giver says. A socket event
 * arriving separately meant the rewards appeared in the middle of the screen,
 * detached from the conversation that earned them.
 */
export async function checkQuestCompletion(playerId: number, questId: number): Promise<QuestRewardSummary | null> {
    const objectives = await db('quest_objectives').where({ quest_id: questId });
    const playerObjectives = await db('player_quest_objectives')
        .where({ player_id: playerId })
        .whereIn('objective_id', objectives.map(o => o.id));

    const allComplete = objectives.every(obj => {
        const po = playerObjectives.find(po => po.objective_id === obj.id);
        return po?.is_complete;
    });

    if (!allComplete) return null;

    const quest = await db('quests').where({ id: questId }).first();

    // Completion is the gate (audit H3).
    //
    // This used to set status 'completed' unconditionally and then pay, so fifty
    // parallel hand-ins paid the gold, items and XP fifty times. Now the status
    // flips only FROM 'active', and rewards are paid only if exactly one row
    // changed, all inside the transaction that flipped it. Every caller becomes
    // idempotent without knowing it: the second request finds nothing to flip
    // and pays nothing.
    const outcome = await db.transaction(async (trx) => {
        const flipped = await trx('player_quests')
            .where({ player_id: playerId, quest_id: questId, status: 'active' })
            .update({ status: 'completed', completed_at: new Date() });
        // Nothing written yet, so returning here commits nothing.
        if (flipped !== 1) return null;
        if (!quest) return { granted: [], gold: 0 };

        const granted = await grantQuestItems(playerId, quest.reward_items, trx);

        if (quest.reward_xp && quest.skill) {
            await awardXp(playerId, quest.skill, quest.reward_xp, trx);
        }

        const gold = Number(quest.reward_gold ?? 0);
        if (gold > 0) {
            await creditGoldWithin(trx, {
                playerId, amount: gold, reason: 'quest_reward',
                refType: 'quest', refId: questId,
            });
        }

        return { granted, gold };
    });

    if (!outcome || !quest) return null;

    // After the commit, never inside it.
    if (outcome.granted.length > 0 || quest.reward_xp || outcome.gold > 0) {
        pushToPlayer(playerId, 'quest_rewards', {
            questName: quest.name,
            items: outcome.granted,
            xp: quest.reward_xp || 0,
            gold: outcome.gold,
            skill: quest.skill,
        });
    }

    logger.info(`Player ${playerId} completed quest ${questId}`);
    return {
        questName: quest.name,
        items: outcome.granted,
        xp: quest.reward_xp || 0,
        skill: quest.skill ?? null,
        gold: outcome.gold,
    };
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
        } else if (obj.type === 'build' && (obj.target_item === 'Coop' || obj.target_item === 'Paddock')) {
            satisfied = !!(await db('player_pens')
                .join('player_properties', 'player_pens.property_id', 'player_properties.id')
                .where('player_properties.player_id', playerId)
                .where('player_pens.pen_type', obj.target_item.toLowerCase())
                .first());
        } else if (obj.type === 'place_animal') {
            // "Put a chick in the coop" — already true if one is standing there.
            satisfied = !!(await db('player_animals')
                .join('animal_species', 'player_animals.species_id', 'animal_species.id')
                .where('player_animals.player_id', playerId)
                .where('animal_species.name', obj.target_item)
                .first());
        } else if (obj.type === 'fish') {
            // Someone who caught their three Tiddle before ever meeting Georemy
            // should not have to catch three more. player_fishing_records.catches
            // is the lifetime count per species, which is exactly the question.
            const record = await db('player_fishing_records')
                .where({ player_id: playerId, species: obj.target_item })
                .first();
            satisfied = !!record && Number(record.catches) >= obj.required_amount;
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
            // A null target_item is a wildcard: "cook 6 fish" rather than
            // "cook 6 perch". Matching it exactly meant such an objective could
            // never progress, since callers always pass a concrete item name.
            const objectives = await db('quest_objectives')
                .where({ quest_id: pq.quest_id, type: objectiveType })
                .andWhere(b => b.where('target_item', targetItem).orWhereNull('target_item'))
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
                pushToPlayer(playerId, 'quest_progress', {
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

/**
 * "Go and look at X, then come back."
 *
 * Client-asserted, deliberately. The Manual is served unauthenticated, so there
 * is no player to attribute a page view to server-side, and a mixed scheme
 * where one visit is proven and the other is claimed would be worse than one
 * honest rule. These objectives gate a pony and some starting coin on a
 * tutorial; the stakes do not justify the machinery.
 *
 * Target names are matched exactly against quest_objectives.target_item, so a
 * call naming something no active quest asks for does nothing at all.
 */
router.post('/visit', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const target = String(req.body?.target ?? '').slice(0, 60);
    try {
        if (!target) { res.status(400).json({ error: 'Invalid request.' }); return; }
        await updateQuestObjectiveProgress(playerId, 'visit', target, 1);
        res.json({ success: true });
    } catch (err) {
        logger.error(`Quest visit error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;