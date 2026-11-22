import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { crierHasWordFor, CRIER_ROAMS_WITH } from '../services/crierPolls';
import { checkQuestCompletion, questStartChoices, questXpAwards, objectiveMet, missingGift, questStartRefusal } from './quests';
import { unlockChests } from '../services/chests';
import { acceptErrand, deliverErrand, dropErrand, errandActions, errandTalk } from '../services/errands';
import { dailyActions, dailyTalk, handInDaily, rareLine } from '../services/dailies';

const router = Router();

// Get NPCs at a location
router.get('/location/:locationId', requireAuth, async (req: AuthRequest, res: Response) => {
    const locationId = parseInt(req.params.locationId as string);
    try {
        // An NPC may bow out once you are done with them. hide_after_quest_id is
        // per player, not server-wide: Quank is gone for you and still standing
        // there for everyone who has not met him yet.
        const playerId = req.player!.playerId;
        const all = await db('npcs').where({ location_id: locationId, is_active: true });

        const gating = all.filter((n: any) => n.hide_after_quest_id).map((n: any) => n.hide_after_quest_id);
        const finished = new Set<number>();
        if (gating.length) {
            const rows = await db('player_quests')
                .where({ player_id: playerId, status: 'completed' })
                .whereIn('quest_id', gating)
                .pluck('quest_id');
            for (const id of rows) finished.add(Number(id));
        }

        // A roaming NPC (npcs.roams_with) has no place of his own: he is left out
        // of his home town and added wherever the player is while his errand
        // applies to them. Today that is the Town Crier, while the player has a
        // poll to answer (services/crierPolls.ts).
        const npcs = all.filter((n: any) => !n.roams_with && (!n.hide_after_quest_id || !finished.has(Number(n.hide_after_quest_id))));
        if (await crierHasWordFor(playerId)) {
            const crier = await db('npcs').where({ roams_with: CRIER_ROAMS_WITH, is_active: true }).first();
            if (crier) npcs.push({ ...crier, location_id: locationId, opens: 'crier_poll' });
        }
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

        // An errand under way speaks for itself (services/errands.ts, the Friddick Brothers).
        // A tutor's daily task, once their lesson is done (services/dailies.ts).
        // Now and then an NPC adds a rare line of their own (npc_rare_lines).
        const rare = forceStage ? null : await rareLine(npc.id);
        const errand = forceStage ? null : (await errandTalk(playerId, npc)) ?? (await dailyTalk(playerId, npc));
        if (errand) {
            res.json({
                npc, stage: 'errand', pendingRewards: null, questProgress: null,
                dialogue: { npc_id: npc.id, stage_key: 'errand', text_lines: rare ? [...errand.lines, rare] : errand.lines, options: errand.options },
            });
            return;
        }

        const resolved = await resolveStage(playerId, npcId);
        const stageKey = forceStage || resolved.stage;
        // The stage without its quest's prefix (quests.stage_prefix): what kind of stage it is.
        const prefix = resolved.quest?.stage_prefix ?? '';
        const base = prefix && stageKey.startsWith(prefix) ? stageKey.slice(prefix.length) : stageKey;
        const dialogue = await db('npc_dialogues')
            .where({ npc_id: npcId, stage_key: stageKey })
            .first();

        if (!dialogue) {
            res.status(404).json({ error: 'Dialogue not found.' });
            return;
        }

        let questProgress = null;
        if (base === 'progress' && resolved.quest) {
            questProgress = await getQuestProgress(playerId, resolved.quest);
        }

        // On the closing stage, what the player is ABOUT to receive.
        //
        // Sent up front so the farewell and the rewards are one screen. Showing
        // them only after the button was pressed meant re-presenting the same
        // wall of text a second time, which reads as a duplicate rather than a
        // conclusion.
        let pendingRewards = null;
        if (base === 'ready') {
            // The quest this conversation is closing, never simply the giver's
            // first: a giver may have several (quests.requires_quest_id).
            const quest = resolved.quest;

            if (quest) {
                let items: Array<{ itemName: string; quantity: number }> = [];
                try {
                    const parsed = typeof quest.reward_items === 'string'
                        ? JSON.parse(quest.reward_items) : quest.reward_items;
                    items = (parsed || []).map((e: any) => ({ itemName: e.itemName, quantity: e.qty ?? e.quantity ?? 1 }));
                } catch { items = []; }

                const gold = Number(quest.reward_gold ?? 0);
                const xpAwards = questXpAwards(quest);
                if (items.length || gold > 0 || xpAwards.length > 0) {
                    pendingRewards = {
                        questName: quest.name, items, gold,
                        xp: xpAwards[0]?.xp ?? 0, skill: xpAwards[0]?.skill ?? quest.skill ?? null,
                        xpAwards,
                    };
                }
            }
        }

        res.json({
            npc,
            stage: stageKey,
            pendingRewards,
            dialogue: {
                ...dialogue,
                text_lines: rare ? [...(dialogue.text_lines ?? []), rare] : dialogue.text_lines,
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

        // The action must be one this NPC is offering this player right now,
        // and the player must be standing in front of them (audit H9).
        //
        // `action` comes from the request body. It used to be acted on as sent,
        // so any NPC could start any quest, a talk objective could be handed in
        // from anywhere on the island, and a hand-in could be sent before the
        // other objectives were done. 'close' is always allowed: it changes
        // nothing.
        if (action && action !== 'close') {
            const player = await db('players').where({ id: playerId }).select('current_location_id').first();
            if (!player || player.current_location_id !== npc.location_id) {
                res.status(403).json({ error: `You need to be with ${npc.name} to do that.` });
                return;
            }
            const allowed = await offeredActions(playerId, npc);
            if (typeof action !== 'string' || !allowed.has(action)) {
                res.status(403).json({ error: `${npc.name} is not offering that.` });
                return;
            }
        }

        if (!action || action === 'close') {
            res.json({ success: true, action: 'close' });
            return;
        }

        // Geoffrey opens locks for a fee (services/chests.ts). The action was
        // checked above against what this NPC offers and where the player stands.
        // Errands (services/errands.ts): take one, hand one over, or give one up.
        if (action === 'daily_hand_in') {
            const done = await handInDaily(playerId, npc);
            if (!done.ok) { res.status(done.status).json({ error: done.error }); return; }
            res.json({ success: true, action, message: done.message });
            return;
        }

        if (action === 'errand_accept' || action === 'errand_deliver' || action === 'errand_drop') {
            const done = action === 'errand_accept' ? await acceptErrand(playerId, npc)
                : action === 'errand_deliver' ? await deliverErrand(playerId, npc)
                    : await dropErrand(playerId);
            if (!done.ok) { res.status(done.status).json({ error: done.error }); return; }
            res.json({ success: true, action, message: done.message });
            return;
        }

        if (action === 'unlock_chests') {
            const done = await unlockChests(playerId);
            if (!done.ok) { res.status(done.status).json({ error: done.error }); return; }
            res.json({ success: true, action, message: done.message });
            return;
        }

        // Handle start_quest action
        if (action.startsWith('start_quest:')) {
            // "start_quest:<id>" or, for a quest that offers a choice on accept,
            // "start_quest:<id>:<choice key>" (Georold's mace or spear). The
            // action string was already checked against what this NPC offers;
            // the key is checked again against the quest's own choices, so a
            // dialogue row that names a key the quest does not have refuses
            // rather than starting the quest empty-handed.
            const payload = action.replace('start_quest:', '');
            const withChoice = /^(\d+):([a-z0-9_-]+)$/.exec(payload.trim());
            const quest = await resolveActionQuest(withChoice ? withChoice[1] : payload, npcId);
            if (!quest) {
                res.status(404).json({ error: 'Quest not found.' });
                return;
            }
            const choices = questStartChoices(quest);
            const chosen = withChoice ? choices.find(c => c.key === withChoice[2]) : null;
            if (choices.length ? !chosen : !!withChoice) {
                res.status(400).json({ error: choices.length ? 'Choose one first.' : 'Quest not found.' });
                return;
            }

            // Starting a quest is one unit of work, and the insert is its gate.
            //
            // It was check-then-insert, with the objectives and the starting
            // items written separately afterwards. The unique constraint on
            // (player_id, quest_id) already stopped a double start from granting
            // Geonsen's bow twice, but the losing request surfaced as a 500, and
            // a failure after the insert left a started quest with no objectives
            // or no bow. Now the row is inserted-or-ignored and everything else
            // happens only if THIS request inserted it, all in one transaction.
            let refusal: string | null = null;
            const started = await db.transaction(async (trx) => {
                // Prerequisites and rival quests, with the player's row locked (routes/quests.ts).
                refusal = await questStartRefusal(trx, playerId, quest);
                if (refusal) return null;
                const inserted = await trx('player_quests')
                    .insert({ player_id: playerId, quest_id: quest.id, status: 'active' })
                    .onConflict(['player_id', 'quest_id'])
                    .ignore()
                    .returning('id');
                // Nothing written, so returning here commits nothing.
                if (inserted.length === 0) return null;

                const objectives = await trx('quest_objectives').where({ quest_id: quest.id });
                for (const obj of objectives) {
                    await trx('player_quest_objectives').insert({
                        player_id: playerId,
                        objective_id: obj.id,
                        current_amount: 0,
                        is_complete: false,
                    });
                }

                // Items handed over on accept (Geonsen's bow, etc.), and the
                // chosen one's, if the quest offers a choice.
                const { grantQuestItems } = await import('./quests');
                const granted = await grantQuestItems(playerId, quest.start_items, trx);
                if (chosen) granted.push(...await grantQuestItems(playerId, chosen.items, trx));
                return granted;
            });

            if (refusal) {
                res.status(400).json({ error: refusal });
                return;
            }
            if (started === null) {
                res.json({ success: true, action: 'next_stage' });
                return;
            }

            // After the commit: the backfill reads through the global connection,
            // which cannot see rows an open transaction has not committed yet.
            const { backfillQuestObjectives } = await import('./quests');
            await backfillQuestObjectives(playerId, quest.id);
            const granted = started;

            logger.info(`Player ${playerId} started quest "${quest.name}" via NPC ${npcId}`);
            res.json({ success: true, action: 'next_stage', grantedItems: granted });
            return;
        }

        // Handle complete_talk_objective action
        if (action.startsWith('complete_talk_objective:')) {
            const quest = await resolveActionQuest(action.replace('complete_talk_objective:', ''), npcId);
            if (!quest) {
                res.status(404).json({ error: 'Quest not found.' });
                return;
            }

            // What the giver keeps must be in the pack before anything is marked.
            const short = await missingGift(playerId, quest.id);
            if (short) {
                res.status(400).json({ error: short });
                return;
            }

            const talkObjectives = await db('quest_objectives')
                .where({ quest_id: quest.id, type: 'talk' })
                .orderBy('order', 'asc');

            let rewards: Awaited<ReturnType<typeof checkQuestCompletion>> = null;

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
                            return objectiveMet(playerId, prev, po);
                        })
                    );

                    if (!allPrevComplete.every(c => c)) {
                        res.status(400).json({ error: 'You have not completed the previous objectives yet.' });
                        return;
                    }

                    await db('player_quest_objectives')
                        .where({ player_id: playerId, objective_id: obj.id })
                        .update({ current_amount: 1, is_complete: true });

                    break;
                }
            }
            // Once every talk is marked. Also when they already were and an
            // earlier hand-in fell short at the finish, so the quest can never
            // be left with nothing left to press.
            rewards = await checkQuestCompletion(playerId, quest.id);

            logger.info(`Player ${playerId} completed talk objective for "${quest.name}"`);
            // Rewards ride back on THIS response so the dialogue can show them
            // as the last thing said, rather than as a box that appears
            // elsewhere on screen a moment later.
            res.json({ success: true, action: 'next_stage', rewards });
            return;
        }

        res.json({ success: true });
    } catch (err) {
        logger.error(`NPC interact error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * Resolves the quest referenced by a dialogue action payload.
 *
 * Dialogue actions are "start_quest:<payload>" / "complete_talk_objective:<payload>",
 * stored in npc_dialogues.options. The payload is a quest ID. It used to be the
 * quest NAME, which meant renaming a quest silently broke its NPC — the button
 * asked for a title that no longer existed and the route 404'd. IDs are stable
 * across renames, so names are now display-only.
 *
 * The name lookup is kept as a fallback so any dialogue row that still holds a
 * name degrades to the old behaviour rather than breaking, and warns so it can
 * be found and migrated.
 */
async function resolveActionQuest(payload: string, npcId: number) {
    const trimmed = payload.trim();

    if (/^\d+$/.test(trimmed)) {
        return await db('quests').where({ id: parseInt(trimmed, 10) }).first();
    }

    const byName = await db('quests').where({ name: trimmed }).first();
    logger.warn(
        `NPC ${npcId} dialogue references quest by name ("${trimmed}") instead of ID`
        + `${byName ? '' : ' and it did not resolve'}. Migrate this dialogue row.`,
    );
    return byName;
}

/**
 * Every action this NPC is offering this player, right now.
 *
 * Stages link together through `next_stage` on their options: "I'll do it" on
 * the intro leads to the offer, which holds the Accept button. So the answer is
 * not only the options on the stage resolveStage returns, but on every stage
 * reachable from it through those links. That lets a conversation move forward
 * naturally while still refusing anything the server did not offer:
 *
 *   - another NPC's quest (its actions are on a different NPC's dialogue)
 *   - handing in before the other objectives are done (the hand-in lives on
 *     'ready', which resolveStage only returns once they are)
 *   - starting a quest already under way (the resolved stage is 'progress',
 *     and nothing reachable from it offers start_quest)
 *
 * The client's own `?stage=` override on the dialogue GET is display only; it
 * never widens what this function accepts.
 */
async function offeredActions(playerId: number, npc: any): Promise<Set<string>> {
    const rows = await db('npc_dialogues').where({ npc_id: npc.id });
    const byStage = new Map<string, any[]>();
    for (const r of rows) {
        const opts = typeof r.options === 'string' ? JSON.parse(r.options) : (r.options || []);
        byStage.set(r.stage_key, Array.isArray(opts) ? opts : []);
    }

    const allowed = new Set<string>([...await errandActions(playerId, npc), ...await dailyActions(playerId, npc)]);
    const seen = new Set<string>();
    const queue = [(await resolveStage(playerId, npc.id)).stage];
    while (queue.length) {
        const stage = queue.shift()!;
        if (seen.has(stage)) continue;
        seen.add(stage);
        for (const opt of byStage.get(stage) ?? []) {
            if (opt?.action) allowed.add(String(opt.action));
            if (opt?.next_stage && !seen.has(opt.next_stage)) queue.push(String(opt.next_stage));
        }
    }
    return allowed;
}

/**
 * Which stage of this NPC's dialogue the player is at, and the quest it
 * belongs to.
 *
 * An NPC's quests are taken in id order. Each may name its own stages with
 * `quests.stage_prefix` ("nan2:intro"), so one giver can hand out several
 * (Nan's errands); a quest without a prefix uses the plain keys, as every
 * quest did before (2026-11-22), and a giver of one quest reads exactly as it
 * always has. A quest held back by `requires_quest_id` is skipped until the
 * quest it waits on is done. A quest whose `exclusive_group` rival the player
 * has taken is closed: its giver is at `<prefix>rival` if there is nothing
 * else to say. When everything is done, the last quest finished picks the
 * `complete` stage.
 */
async function resolveStage(playerId: number, npcId: number): Promise<{ stage: string; quest: any | null }> {
    const npc = await db('npcs').where({ id: npcId }).first();

    // Quests belonging to THIS NPC. Scoping by location alone was wrong the
    // moment a location got a second quest-giver: Novita has both Georgic and
    // Geothro, so a player who had finished Georgic's lesson got 'complete' from
    // Geothro on first meeting him, skipping his entire quest.
    // npc_name is nullable, so a quest without one still falls back to location.
    const quests = (await db('quests').where({ location_id: npc.location_id, is_active: true }).orderBy('id'))
        .filter((q: any) => !q.npc_name || q.npc_name === npc.name);
    const mine = new Map<number, any>((await db('player_quests').where({ player_id: playerId })
        .whereIn('quest_id', quests.map((q: any) => q.id))).map((r: any) => [Number(r.quest_id), r]));
    const groups = [...new Set(quests.map((q: any) => q.exclusive_group).filter(Boolean))];
    const takenGroups = new Map<string, number>();
    if (groups.length) {
        for (const r of await db('player_quests as pq').join('quests as q', 'q.id', 'pq.quest_id')
            .where('pq.player_id', playerId).whereIn('q.exclusive_group', groups).select('q.exclusive_group', 'q.id')) {
            takenGroups.set(r.exclusive_group, Number(r.id));
        }
    }

    const at = (q: any, key: string) => ({ stage: `${q?.stage_prefix ?? ''}${key}`, quest: q });
    let lastDone: any = null;
    let rival: any = null;
    for (const quest of quests) {
        const playerQuest = mine.get(Number(quest.id));
        if (playerQuest?.status === 'completed') { lastDone = quest; continue; }

        if (playerQuest) {
            const objectives = await db('quest_objectives').where({ quest_id: quest.id }).orderBy('order', 'asc');
            const playerObjectives = await db('player_quest_objectives')
                .where({ player_id: playerId })
                .whereIn('objective_id', objectives.map(o => o.id));
            const talkObj = objectives.find(o => o.type === 'talk');
            const nonTalkObjs = objectives.filter(o => o.type !== 'talk');
            let allNonTalkComplete = nonTalkObjs.length > 0;
            for (const o of nonTalkObjs) {
                if (!(await objectiveMet(playerId, o, playerObjectives.find(po => po.objective_id === o.id)))) { allNonTalkComplete = false; break; }
            }
            return at(quest, allNonTalkComplete && talkObj ? 'ready' : 'progress');
        }

        const taken = quest.exclusive_group ? takenGroups.get(quest.exclusive_group) : undefined;
        if (taken !== undefined && taken !== Number(quest.id)) { rival = rival ?? quest; continue; }
        if (quest.requires_quest_id && mine.get(Number(quest.requires_quest_id))?.status !== 'completed') continue;
        return at(quest, 'intro');
    }

    if (rival) return at(rival, 'rival');
    if (lastDone) return at(lastDone, 'complete');
    return { stage: 'intro', quest: null };
}

async function getQuestProgress(playerId: number, quest: any): Promise<any> {
    const playerQuest = await db('player_quests')
        .where({ player_id: playerId, quest_id: quest.id, status: 'active' })
        .first();
    if (!playerQuest) return null;

    const objectives = await db('quest_objectives').where({ quest_id: quest.id }).orderBy('order', 'asc');
    const playerObjectives = await db('player_quest_objectives')
        .where({ player_id: playerId })
        .whereIn('objective_id', objectives.map(o => o.id));

    const out = [];
    for (const obj of objectives) {
        const po = playerObjectives.find(po => po.objective_id === obj.id);
        // A 'give' shows what the pack holds now, since that is what is handed over.
        const carried = obj.type === 'give'
            ? Number((await db('player_inventory as pi').join('items as i', 'i.id', 'pi.item_id')
                .where({ 'pi.player_id': playerId, 'i.name': obj.target_item }).sum({ q: 'pi.quantity' }).first() as any)?.q ?? 0)
            : null;
        out.push({
            ...obj,
            current_amount: carried !== null ? Math.min(carried, Number(obj.required_amount)) : po?.current_amount || 0,
            is_complete: await objectiveMet(playerId, obj, po),
        });
    }
    return out;
}

export default router;