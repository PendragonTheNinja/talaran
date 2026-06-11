import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../index';
import { updateQuestObjectiveProgress, checkQuestCompletion } from './quests';

const router = Router();

// Get NPCs at a location
router.get('/location/:locationId', requireAuth, async (req: AuthRequest, res: Response) => {
    const locationId = parseInt(req.params.locationId as string);
    try {
        const npcs = await db('npcs').where({ location_id: locationId, is_active: true });
        res.json({ npcs });
    } catch (err) {
        logger.error(`Get NPCs error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get dialogue for an NPC — determines correct stage based on player state
router.get('/:id/dialogue', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const npcId = parseInt(req.params.id as string);
    const forceStage = req.query.stage as string | undefined;

    try {
        const npc = await db('npcs').where({ id: npcId, is_active: true }).first();
        if (!npc) {
            res.status(404).json({ error: 'NPC not found.' });
            return;
        }

        const stageKey = forceStage || await resolveStage(playerId, npcId);
        const dialogue = await db('npc_dialogues')
            .where({ npc_id: npcId, stage_key: stageKey })
            .first();

        if (!dialogue) {
            res.status(404).json({ error: 'Dialogue not found.' });
            return;
        }

        let questProgress = null;
        if (stageKey === 'progress') {
            questProgress = await getQuestProgress(playerId, npcId);
        }

        res.json({
            npc,
            stage: stageKey,
            dialogue: {
                ...dialogue,
                options: typeof dialogue.options === 'string'
                    ? JSON.parse(dialogue.options)
                    : dialogue.options,
            },
            questProgress,
        });
    } catch (err) {
        logger.error(`Get dialogue error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Interact — process a dialogue option
router.post('/:id/interact', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const npcId = parseInt(req.params.id as string);
    const { action } = req.body;

    try {
        const npc = await db('npcs').where({ id: npcId, is_active: true }).first();
        if (!npc) {
            res.status(404).json({ error: 'NPC not found.' });
            return;
        }

        if (!action || action === 'close') {
            res.json({ success: true, action: 'close' });
            return;
        }

        // Handle start_quest action
        if (action.startsWith('start_quest:')) {
            const questName = action.replace('start_quest:', '');
            const quest = await db('quests').where({ name: questName }).first();
            if (!quest) {
                res.status(404).json({ error: 'Quest not found.' });
                return;
            }

            const existing = await db('player_quests')
                .where({ player_id: playerId, quest_id: quest.id })
                .first();
            if (existing) {
                res.json({ success: true, action: 'next_stage' });
                return;
            }

            await db('player_quests').insert({
                player_id: playerId,
                quest_id: quest.id,
                status: 'active',
            });

            const objectives = await db('quest_objectives').where({ quest_id: quest.id });
            for (const obj of objectives) {
                await db('player_quest_objectives').insert({
                    player_id: playerId,
                    objective_id: obj.id,
                    current_amount: 0,
                    is_complete: false,
                });
            }

            logger.info(`Player ${playerId} started quest "${questName}" via NPC ${npcId}`);
            res.json({ success: true, action: 'next_stage' });
            return;
        }

        // Handle complete_talk_objective action
        if (action.startsWith('complete_talk_objective:')) {
            const questName = action.replace('complete_talk_objective:', '');
            const quest = await db('quests').where({ name: questName }).first();
            if (!quest) {
                res.status(404).json({ error: 'Quest not found.' });
                return;
            }

            const talkObjectives = await db('quest_objectives')
                .where({ quest_id: quest.id, type: 'talk' })
                .orderBy('order', 'asc');

            for (const obj of talkObjectives) {
                const playerObj = await db('player_quest_objectives')
                    .where({ player_id: playerId, objective_id: obj.id })
                    .first();

                if (!playerObj?.is_complete) {
                    // Check all previous objectives complete
                    const prevObjectives = await db('quest_objectives')
                        .where({ quest_id: quest.id })
                        .where('order', '<', obj.order);

                    const allPrevComplete = await Promise.all(
                        prevObjectives.map(async prev => {
                            const po = await db('player_quest_objectives')
                                .where({ player_id: playerId, objective_id: prev.id })
                                .first();
                            return po?.is_complete || false;
                        })
                    );

                    if (!allPrevComplete.every(c => c)) {
                        res.status(400).json({ error: 'You have not completed the previous objectives yet.' });
                        return;
                    }

                    await db('player_quest_objectives')
                        .where({ player_id: playerId, objective_id: obj.id })
                        .update({ current_amount: 1, is_complete: true });

                    await checkQuestCompletion(playerId, quest.id);
                    break;
                }
            }

            logger.info(`Player ${playerId} completed talk objective for "${questName}"`);
            res.json({ success: true, action: 'next_stage' });
            return;
        }

        res.json({ success: true });
    } catch (err) {
        logger.error(`NPC interact error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

async function resolveStage(playerId: number, npcId: number): Promise<string> {
    // Find quests linked to this NPC
    const npc = await db('npcs').where({ id: npcId }).first();
    const location = await db('locations').where({ id: npc.location_id }).first();

    // Find active or completed quests at this NPC's location
    const quests = await db('quests').where({ location_id: npc.location_id, is_active: true });

    for (const quest of quests) {
        const playerQuest = await db('player_quests')
            .where({ player_id: playerId, quest_id: quest.id })
            .first();

        if (!playerQuest) continue;

        if (playerQuest.status === 'completed') return 'complete';

        // Check objectives
        const objectives = await db('quest_objectives')
            .where({ quest_id: quest.id })
            .orderBy('order', 'asc');

        const playerObjectives = await db('player_quest_objectives')
            .where({ player_id: playerId })
            .whereIn('objective_id', objectives.map(o => o.id));

        const talkObj = objectives.find(o => o.type === 'talk');
        const nonTalkObjs = objectives.filter(o => o.type !== 'talk');

        const allNonTalkComplete = nonTalkObjs.length > 0 && nonTalkObjs.every(o =>
            playerObjectives.find(po => po.objective_id === o.id)?.is_complete
        );

        if (allNonTalkComplete && talkObj) return 'ready';
        return 'progress';
    }

    return 'intro';
}

async function getQuestProgress(playerId: number, npcId: number): Promise<any> {
    const npc = await db('npcs').where({ id: npcId }).first();
    const quests = await db('quests').where({ location_id: npc.location_id, is_active: true });

    for (const quest of quests) {
        const playerQuest = await db('player_quests')
            .where({ player_id: playerId, quest_id: quest.id, status: 'active' })
            .first();
        if (!playerQuest) continue;

        const objectives = await db('quest_objectives').where({ quest_id: quest.id });
        const playerObjectives = await db('player_quest_objectives')
            .where({ player_id: playerId })
            .whereIn('objective_id', objectives.map(o => o.id));

        return objectives.map(obj => {
            const po = playerObjectives.find(po => po.objective_id === obj.id);
            return {
                ...obj,
                current_amount: po?.current_amount || 0,
                is_complete: po?.is_complete || false,
            };
        });
    }

    return null;
}

export default router;