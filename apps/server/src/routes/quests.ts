import { Router, Response } from 'express';
import { noteDeed } from '../services/chronicle';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import type { Knex } from 'knex';
import { logger } from '../lib/logger';
import { awardXp } from '../services/xp';
import { creditGoldWithin } from '../services/gold';
import { addItemToInventoryWithin, recordItemFirst, takeItemsWithin } from '../services/inventory';
import { pushToPlayer } from '../lib/realtime';
import { afterCommit } from '../lib/afterCommit';
import { errandSummary } from '../services/errands';

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

        // An errand under way (the Friddiks) shows beside the quests, though it is not one.
        res.json({ quests: result, errand: await errandSummary(playerId) });
    } catch (err) {
        logger.error(`Get quests error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Quests start only from their giver's dialogue (routes/npcs.ts), where
// presence, prerequisites, and rival quests are checked. A bare
// POST /api/quests/:id/start, which started any quest from anywhere, was
// removed on 2026-11-22: nothing called it, and it would have let a player
// take both sides of a quarrel (quests.exclusive_group).

/**
 * Grant a quest's item list. Used for both start_items (on accept) and
 * reward_items (on completion). Missing items are logged loudly, never silent —
 * a typo'd reward should be visible, not a quest that gives nothing.
 */
export async function grantQuestItems(
    playerId: number,
    itemsJson: string | { itemName: string; qty: number }[] | null,
    x: Knex | Knex.Transaction = db,
): Promise<{ itemName: string; quantity: number }[]> {
    if (!itemsJson) return [];
    let items: { itemName: string; qty: number }[];
    try {
        items = typeof itemsJson === 'string' ? JSON.parse(itemsJson) : itemsJson;
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

// ── What a quest asks, and whether it may start ─────────────────────────────
//
// A 'give' objective (2026-11-22) is an errand: bring something to the giver,
// who keeps it. It is met while the pack holds enough, never by a progress
// row, and the items are taken in the same transaction that pays the reward
// (checkQuestCompletion), so a hand-in pays once and takes once.
//
// Several quests may share one giver (Nan's errands come one after another):
// `quests.requires_quest_id` holds a quest back until another is done, and
// `quests.stage_prefix` names its own dialogue stages (resolveStage in
// routes/npcs.ts). `quests.exclusive_group` makes quests rivals: start one and
// the others in its group are closed to you for good (the cabbage quarrel in
// Farefield).

/** How many of an item the player carries. */
async function packCount(x: Knex | Knex.Transaction, playerId: number, itemName: string): Promise<number> {
    const row = await x('player_inventory as pi').join('items as i', 'i.id', 'pi.item_id')
        .where({ 'pi.player_id': playerId, 'i.name': itemName }).sum({ q: 'pi.quantity' }).first();
    return Number((row as any)?.q ?? 0);
}

/** Is this objective met? A 'give' by what the pack holds; any other by its progress row. */
export async function objectiveMet(playerId: number, obj: any, po: any, x: Knex | Knex.Transaction = db): Promise<boolean> {
    if (obj.type === 'give') return !!obj.target_item && (await packCount(x, playerId, obj.target_item)) >= Number(obj.required_amount);
    return !!po?.is_complete;
}

/** The first 'give' this quest still wants carried, as words, or null when the pack holds them all. */
export async function missingGift(playerId: number, questId: number): Promise<string | null> {
    for (const obj of await db('quest_objectives').where({ quest_id: questId, type: 'give' }).orderBy('order', 'asc')) {
        const have = await packCount(db, playerId, obj.target_item);
        if (have < Number(obj.required_amount)) return `You need ${Number(obj.required_amount).toLocaleString('en-US')} ${obj.target_item} (you have ${have.toLocaleString('en-US')}).`;
    }
    return null;
}

/**
 * Why this quest may not start for this player, or null. Checked inside the
 * start's transaction with the player's row locked, so two starts at once
 * (two rival quests together) cannot both pass.
 */
export async function questStartRefusal(trx: Knex.Transaction, playerId: number, quest: any): Promise<string | null> {
    await trx('players').where({ id: playerId }).forUpdate().first('id');
    if (quest.requires_quest_id) {
        const done = await trx('player_quests').where({ player_id: playerId, quest_id: quest.requires_quest_id, status: 'completed' }).first('id');
        if (!done) return 'There is something to finish first.';
    }
    if (quest.exclusive_group) {
        const rival = await trx('player_quests as pq').join('quests as q', 'q.id', 'pq.quest_id')
            .where({ 'pq.player_id': playerId, 'q.exclusive_group': quest.exclusive_group })
            .whereNot('q.id', quest.id).first('q.name');
        if (rival) return 'You have taken the other side already.';
    }
    return null;
}

class QuestAbort extends Error {}

export interface QuestXpAward {
    skill: string;
    xp: number;
}

export interface QuestRewardSummary {
    questName: string;
    items: Array<{ itemName: string; quantity: number }>;
    /** The first of xpAwards, for anything that only knows one skill. */
    xp: number;
    skill: string | null;
    /** Every skill the quest pays, in order. */
    xpAwards: QuestXpAward[];
    gold: number;
}

/**
 * Every skill a quest pays on completion: its own `skill` and `reward_xp`,
 * then each entry of `reward_skill_xp` (a JSON list of { skill, xp }), for a
 * quest that teaches more than one skill at once, as Georold's does.
 */
export function questXpAwards(quest: any): QuestXpAward[] {
    const awards: QuestXpAward[] = [];
    if (quest?.skill && Number(quest.reward_xp) > 0) awards.push({ skill: quest.skill, xp: Number(quest.reward_xp) });
    if (quest?.reward_skill_xp) {
        try {
            const extra = typeof quest.reward_skill_xp === 'string' ? JSON.parse(quest.reward_skill_xp) : quest.reward_skill_xp;
            for (const e of Array.isArray(extra) ? extra : []) {
                const xp = Math.floor(Number(e?.xp));
                if (typeof e?.skill === 'string' && Number.isFinite(xp) && xp > 0) awards.push({ skill: e.skill, xp });
            }
        } catch {
            logger.error(`questXpAwards: bad reward_skill_xp JSON on quest ${quest.id}`);
        }
    }
    return awards;
}

/**
 * A quest's start choices: [{ key, label, items: [{ itemName, qty }] }], from
 * `quests.start_choices`. Accepting such a quest names one key
 * ("start_quest:<id>:<key>"), and that choice's items are handed over beside
 * the quest's own start_items.
 */
export function questStartChoices(quest: any): { key: string; label?: string; items: { itemName: string; qty: number }[] }[] {
    if (!quest?.start_choices) return [];
    try {
        const parsed = typeof quest.start_choices === 'string' ? JSON.parse(quest.start_choices) : quest.start_choices;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        logger.error(`questStartChoices: bad start_choices JSON on quest ${quest.id}`);
        return [];
    }
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

    for (const obj of objectives) {
        const po = playerObjectives.find(po => po.objective_id === obj.id);
        if (!(await objectiveMet(playerId, obj, po))) return null;
    }

    const quest = await db('quests').where({ id: questId }).first();

    // Completion is the gate (audit H3).
    //
    // This used to set status 'completed' unconditionally and then pay, so fifty
    // parallel hand-ins paid the gold, items and XP fifty times. Now the status
    // flips only FROM 'active', and rewards are paid only if exactly one row
    // changed, all inside the transaction that flipped it. Every caller becomes
    // idempotent without knowing it: the second request finds nothing to flip
    // and pays nothing.
    let outcome: { granted: { itemName: string; quantity: number }[]; gold: number } | null;
    try { outcome = await db.transaction(async (trx) => {
        const flipped = await trx('player_quests')
            .where({ player_id: playerId, quest_id: questId, status: 'active' })
            .update({ status: 'completed', completed_at: new Date() });
        // Nothing written yet, so returning here commits nothing.
        if (flipped !== 1) return null;
        if (!quest) return { granted: [], gold: 0 };

        // What the giver keeps ('give' objectives), taken under the flip's
        // gate: all of it or none, and a shortfall rolls the flip back too.
        for (const obj of objectives.filter(o => o.type === 'give')) {
            const took = await takeItemsWithin(trx, playerId, [{ name: obj.target_item, quantity: Number(obj.required_amount) }]);
            if (!took.ok) throw new QuestAbort(took.error);
            await trx('player_quest_objectives').where({ player_id: playerId, objective_id: obj.id })
                .update({ current_amount: obj.required_amount, is_complete: true });
        }

        // The first on the island to finish this quest (docs/chronicle-spec.md §5).
        const before = await trx('player_quests').where({ quest_id: questId, status: 'completed' }).whereNot({ player_id: playerId }).first('player_id');
        if (!before) {
          const place = quest.location_id ? await trx('locations').where({ id: quest.location_id }).first('name') : null;
          noteDeed(trx, { kind: 'quest_first', playerId, subject: quest.name, data: { quest: quest.name, place: place?.name ?? null } });
        }

        const granted = await grantQuestItems(playerId, quest.reward_items, trx);

        for (const award of questXpAwards(quest)) {
            await awardXp(playerId, award.skill, award.xp, trx);
        }

        const gold = Number(quest.reward_gold ?? 0);
        if (gold > 0) {
            await creditGoldWithin(trx, {
                playerId, amount: gold, reason: 'quest_reward',
                refType: 'quest', refId: questId,
            });
        }

        return { granted, gold };
    }); } catch (err) {
        if (err instanceof QuestAbort) return null;
        throw err;
    }

    if (!outcome || !quest) return null;

    const xpAwards = questXpAwards(quest);
    const summary: QuestRewardSummary = {
        questName: quest.name,
        items: outcome.granted,
        xp: xpAwards[0]?.xp ?? 0,
        skill: xpAwards[0]?.skill ?? quest.skill ?? null,
        xpAwards,
        gold: outcome.gold,
    };

    // After the commit, never inside it.
    if (outcome.granted.length > 0 || xpAwards.length > 0 || outcome.gold > 0) {
        pushToPlayer(playerId, 'quest_rewards', summary);
    }

    logger.info(`Player ${playerId} completed quest ${questId}`);
    return summary;
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
        } else if (obj.type === 'kill') {
            // Kills before the quest count, as catches do: the Bestiary's
            // lifetime count per creature answers it.
            const row = await db('player_creature_kills as k')
                .join('creatures as c', 'c.id', 'k.creature_id')
                .where('k.player_id', playerId)
                .where('c.name', obj.target_item)
                .first('k.kills');
            satisfied = !!row && Number(row.kills) >= obj.required_amount;
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
                // Relative and conditional in one statement (CLAUDE.md §4
                // rule 1): two progress calls at once (a kill settled by the
                // tick while an eat settles the next) both count.
                const [row] = await db('player_quest_objectives')
                    .where({ player_id: playerId, objective_id: obj.id })
                    .whereRaw('is_complete IS NOT TRUE')
                    .update({
                        current_amount: db.raw('LEAST(COALESCE(current_amount, 0) + ?, ?)', [amount, obj.required_amount]),
                        is_complete: db.raw('COALESCE(current_amount, 0) + ? >= ?', [amount, obj.required_amount]),
                    })
                    .returning(['current_amount', 'is_complete']);
                if (!row) continue;

                const newAmount = Number(row.current_amount);
                const isComplete = !!row.is_complete;

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