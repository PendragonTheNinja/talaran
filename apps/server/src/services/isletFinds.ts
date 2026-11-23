import db from '../db';
import { levelFromXp } from './xp';
import { addItemToInventoryWithin, takeItemsWithin } from './inventory';
import { creditGoldWithin } from './gold';
import { noteDeed } from './chronicle';
import { afterCommit } from '../lib/afterCommit';
import { pushToPlayer } from '../lib/realtime';

/** What Quank leaves behind, and what a dig turns up (named here so item pages can say so). */
export const QUANK_GIFT_ITEM = 'Tidbit';
/** What Quank leaves when he takes his Tidbit back (Nathan, 2026-11-23). */
export const QUANK_RECEIPT_ITEM = "Quank's Receipt";
export const DUG_CHEST_ITEM = 'Locked Rusty Chest';

// ── What a landing finds (docs/islets-plan.md §2 and §4) ─────────────────────
//
// On each landing a player rolls one find from what that islet can hold
// (`islet_finds`, by weight, active kinds only). A work find is the best of
// its kind on the island that the player has the level for, holds a fixed
// amount of work (`islet_find_kinds`), and makes that work's extras `boost`
// times likelier. It is theirs alone, and it is lost when they leave the
// islet. Each skill's own action spends it, one use at a time, through
// isletFindHere and spendIsletFind; nothing about the skill's rules changes.

export type FindKind = 'stand' | 'vein' | 'shoal' | 'patch' | 'trail' | 'chest' | 'cache' | 'young' | 'flowers' | 'nests' | 'artefact' | 'quank' | 'nothing';

const CHEST_COINS_MIN = 3;
const CHEST_COINS_MAX = 10;

export interface IsletFind {
    kind: FindKind
    location_id: number
    target_id: number | null
    remaining: number
    boost: number
    /** How what was handed over reads in its line ({find}): young, flowers, an artefact. */
    words?: string
    /** A quest this find started (Quank's Tidbit), named for the landing's last line. */
    questStarted?: string
    /** A quest this find finished (Quank taking his Tidbit back). */
    questDone?: string
    /** Which of Quank's scenes was played: 'quank' (he gives a Tidbit), 'quank_back' (he takes it back), 'quank_owed' (he wanted it, and it was not there). */
    scene?: 'quank' | 'quank_back' | 'quank_owed'
}

/** Started when Quank hands over his Tidbit (migration 20261117200000). */
export const QUANK_QUEST = 'Keep an Eye Out for Quank'

/**
 * The quiet count for bad luck (docs/islets-plan.md §6a): he is met once on
 * each island's islets, about one landing in 58 on Taiar's, so a player who
 * has landed this many times among an island's islets without meeting him
 * meets him on the next. About three times the usual wait; one sailor in
 * twenty gets there. Counted from player_islets_found, never shown.
 */
export const QUANK_OWED_LANDINGS = 175

async function skillLevel(x: any, playerId: number, skill: string): Promise<number> {
    const row = await x('player_skills as ps').join('skills as s', 's.id', 'ps.skill_id')
        .where({ 'ps.player_id': playerId, 's.name': skill }).first('ps.xp');
    return row ? levelFromXp(Number(row.xp)) : 1;
}

/**
 * The thing a work find is a best-of: for a stand, the island's best
 * woodcutting node the player has the level for. Null when they have the level
 * for none, and the find becomes nothing. `island` null looks on every island:
 * the caller's fallback when this island has none of that work at all (Antura
 * has no trees or game of its own, so its islets' stands and trails are the
 * best the player can work anywhere; Nathan, 2026-11-23).
 */
async function targetFor(x: any, playerId: number, kind: FindKind, island: string | null): Promise<number | null> {
    if (kind === 'stand') {
        const level = await skillLevel(x, playerId, 'Woodcutting');
        const node = await x('resource_nodes as n').join('locations as l', 'l.id', 'n.location_id')
            .modify((q: any) => { if (island) q.where('l.region', island); }).where('n.is_active', true).whereRaw('LOWER(n.skill) = ?', ['woodcutting'])
            .where('n.required_level', '<=', level)
            .orderBy([{ column: 'n.required_level', order: 'desc' }, { column: 'n.id', order: 'asc' }])
            .first('n.id');
        return node ? Number(node.id) : null;
    }
    if (kind === 'trail') {
        const level = await skillLevel(x, playerId, 'Hunting');
        const a = await x('huntable_animals as a').join('locations as l', 'l.id', 'a.location_id')
            .modify((q: any) => { if (island) q.where('l.region', island); }).whereNull('l.islet_kind').where('a.is_active', true)
            .where('a.required_level', '<=', level)
            .orderBy([{ column: 'a.required_level', order: 'desc' }, { column: 'a.id', order: 'asc' }]).first('a.id');
        return a ? Number(a.id) : null;
    }
    if (kind === 'patch') {
        const level = await skillLevel(x, playerId, 'Foraging');
        const h = await x('foraging_habitats as h').join('locations as l', 'l.id', 'h.location_id')
            .modify((q: any) => { if (island) q.where('l.region', island); }).whereNull('l.islet_kind').where('h.is_active', true)
            .where('h.required_level', '<=', level)
            .orderBy([{ column: 'h.required_level', order: 'desc' }, { column: 'h.id', order: 'asc' }]).first('h.id');
        return h ? Number(h.id) : null;
    }
    if (kind === 'shoal') {
        // The island's water whose best fish the player can catch is the
        // highest; more such fish breaks a tie.
        const level = await skillLevel(x, playerId, 'Fishing');
        const waters = await x('fish_species as f').join('locations as l', 'l.id', 'f.location_id')
            .modify((q: any) => { if (island) q.where('l.region', island); }).whereNull('l.islet_kind').where({ 'f.is_active': true, 'f.kind': 'fish' })
            .where('f.required_level', '<=', level)
            .groupBy('f.location_id')
            .select('f.location_id').max('f.required_level as top').count('f.id as n')
            .orderBy([{ column: 'top', order: 'desc' }, { column: 'n', order: 'desc' }, { column: 'f.location_id', order: 'asc' }]);
        return waters.length ? Number(waters[0].location_id) : null;
    }
    if (kind === 'vein') {
        // The best ore on the island the player has the level for: an ore some
        // mainland node yields, the plain (not dense) kind.
        const level = await skillLevel(x, playerId, 'Mining');
        const subtypes = (await x('resource_nodes as n').join('locations as l', 'l.id', 'n.location_id')
            .modify((q: any) => { if (island) q.where('l.region', island); }).where('n.is_active', true).where('n.skill', 'mining').whereNotNull('n.ore_subtype')
            .distinct('n.ore_subtype')).map((r: any) => r.ore_subtype);
        if (!subtypes.length) return null;
        const best = await x('items').where({ type: 'ore' }).whereNull('quality').whereIn('subtype', subtypes)
            .where('level_required', '<=', level).orderBy('level_required', 'desc').select('id', 'level_required');
        if (!best.length) return null;
        const top = best.filter((o: any) => Number(o.level_required) === Number(best[0].level_required));
        return Number(top[Math.floor(Math.random() * top.length)].id);
    }
    return null;
}

/** Pick a row by its weight column. */
function pickByWeight<T extends { weight: unknown }>(rows: T[]): T | null {
    const total = rows.reduce((s, r) => s + Number(r.weight), 0);
    let roll = Math.random() * total;
    for (const r of rows) { roll -= Number(r.weight); if (roll < 0) return r; }
    return rows[rows.length - 1] ?? null;
}

/** "a" or "an" before a name, lower-case "the" names left alone. */
export function withArticleWord(name: string): string {
    return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
}

/** An islet vein is a real vein, private to its finder and never announced (services/mining.ts mines it). */
const NEVER = new Date('2999-01-01T00:00:00Z');

/**
 * Roll this landing's find, inside the landing's transaction (the player row
 * is locked by the caller). Replaces any find the player still had.
 */
export async function rollIsletFindWithin(trx: any, playerId: number, islet: { id: number; region: string }): Promise<IsletFind> {
    await clearFindWithin(trx, playerId);
    const holds = await trx('islet_finds as f').join('islet_find_kinds as k', 'k.key', 'f.kind')
        .where({ 'f.location_id': islet.id, 'k.is_active': true })
        .select('f.kind', 'f.weight', 'k.amount_min', 'k.amount_max', 'k.boost');
    const total = holds.reduce((s: number, h: any) => s + Number(h.weight), 0);
    let roll = Math.random() * total;
    let pick: any = null;
    for (const h of holds) {
        roll -= Number(h.weight);
        if (roll < 0) { pick = h; break; }
    }
    // Owed Quank: enough landings here and never met him (this landing is already counted by the caller).
    const quank = holds.find((h: any) => h.kind === 'quank');
    if (quank && pick?.kind !== 'quank' && !(await trx('player_quank_met').where({ player_id: playerId, island: islet.region }).first())) {
        const [{ n }] = await trx('player_islets_found as f').join('locations as l', 'l.id', 'f.location_id')
            .where({ 'f.player_id': playerId, 'l.region': islet.region }).sum('f.landings as n');
        if (Number(n ?? 0) >= QUANK_OWED_LANDINGS) pick = quank;
    }
    const nothing: IsletFind = { kind: 'nothing', location_id: islet.id, target_id: null, remaining: 0, boost: 1 };
    if (!pick || pick.kind === 'nothing') return nothing;
    if (pick.kind === 'young' || pick.kind === 'flowers' || pick.kind === 'nests') {
        // Handed over there and then, from the island's list (islet_find_items).
        const rows = await trx('islet_find_items').where({ island: islet.region, kind: pick.kind, is_active: true })
            .select('item_name', 'min_qty', 'max_qty', 'weight', 'words_one', 'words_many');
        const row: any = pickByWeight(rows as any[]);
        const item = row ? await trx('items').where({ name: row.item_name }).first('id', 'name') : null;
        if (!row || !item) return nothing;
        const qty = Number(row.min_qty) + Math.floor(Math.random() * (Number(row.max_qty) - Number(row.min_qty) + 1));
        await addItemToInventoryWithin(trx, playerId, item.id, qty);
        const written = qty === 1 ? row.words_one : row.words_many;
        const words = written ? String(written).replace('{n}', String(qty)) : (qty === 1 ? item.name : `${qty} ${item.name}`);
        return { kind: pick.kind, location_id: islet.id, target_id: item.id, remaining: 0, boost: 1, words };
    }
    if (pick.kind === 'artefact') {
        // One of the island's relics, one never found first, then any.
        const relics = await trx('items').where({ type: 'curio', subtype: 'artefact', set_island: islet.region, is_active: true }).select('id', 'name');
        if (!relics.length) return nothing;
        const had = new Set((await trx('player_artefacts_found').where({ player_id: playerId }).pluck('item_id')).map(Number));
        const fresh = relics.filter((r: any) => !had.has(Number(r.id)));
        const relic = (fresh.length ? fresh : relics)[Math.floor(Math.random() * (fresh.length || relics.length))];
        await addItemToInventoryWithin(trx, playerId, relic.id, 1);
        await trx('player_artefacts_found').insert({ player_id: playerId, item_id: relic.id }).onConflict(['player_id', 'item_id']).ignore();
        return { kind: 'artefact', location_id: islet.id, target_id: relic.id, remaining: 0, boost: 1, words: `${withArticleWord(relic.name)}` };
    }
    if (pick.kind === 'quank') {
        // Once on each island's islets, never again there (docs/islets-plan.md §6a).
        const met = await trx('player_quank_met').insert({ player_id: playerId, island: islet.region })
            .onConflict(['player_id', 'island']).ignore().returning('island');
        if (!met.length) return nothing;
        const done = (extra: Partial<IsletFind>): IsletFind => ({ kind: 'quank', location_id: islet.id, target_id: null, remaining: 0, boost: 1, ...extra });
        // Met before, on another island's islets: he wants his Tidbit back
        // (Nathan, 2026-11-17 and 23). Carried, it goes back, the quest ends,
        // and he leaves a receipt; not carried, he looks at the empty hand,
        // and the quest waits for the next island's islets.
        const quest = await trx('quests').where({ name: QUANK_QUEST, is_active: true }).first('id', 'name');
        const open = quest ? await trx('player_quests').where({ player_id: playerId, quest_id: quest.id, status: 'active' }).first('id') : null;
        let found: IsletFind;
        if (quest && open) {
            const took = await takeItemsWithin(trx, playerId, [{ name: QUANK_GIFT_ITEM, quantity: 1 }]);
            if (took.ok) {
                // Completion is the gate: the flip from active, inside the landing's transaction.
                const flipped = await trx('player_quests').where({ player_id: playerId, quest_id: quest.id, status: 'active' })
                    .update({ status: 'completed', completed_at: new Date() });
                if (flipped !== 1) throw new Error('quank: his quest was finished twice at once');
                await trx('player_quest_objectives').whereIn('objective_id', trx('quest_objectives').where({ quest_id: quest.id }).select('id'))
                    .where({ player_id: playerId }).update({ current_amount: 1, is_complete: true });
                const receipt = await trx('items').where({ name: QUANK_RECEIPT_ITEM }).first('id');
                if (receipt) await addItemToInventoryWithin(trx, playerId, receipt.id, 1);
                found = done({ target_id: receipt?.id ?? null, scene: 'quank_back', questDone: String(quest.name) });
            } else {
                found = done({ scene: 'quank_owed' });
            }
        } else {
            // First met: before he goes, a Tidbit, half a Tiddle (Nathan, 2026-11-17)...
            const tidbit = await trx('items').where({ name: QUANK_GIFT_ITEM }).first('id');
            if (tidbit) await addItemToInventoryWithin(trx, playerId, tidbit.id, 1);
            // ...and the scene's end starts his quest: next time, he wants it back.
            const questStarted = await startQuankQuestWithin(trx, playerId);
            found = done({ target_id: tidbit?.id ?? null, scene: 'quank', questStarted: questStarted ?? undefined });
        }
        // Counted: his feat, and a line in Wenna's tidings, once this commits.
        noteDeed(trx, { kind: 'quank_seen', playerId, subject: 'Quank', data: { island: islet.region } });
        afterCommit(trx, async () => {
            const { evaluateFeats } = await import('./feats');
            for (const feat of await evaluateFeats(playerId)) pushToPlayer(playerId, 'feat_earned', feat);
        });
        return found;
    }
    if (pick.kind === 'cache') {
        // A guarded cache: the guardian of this islet's guardian spot
        // (services/combatFights.ts), one fight, its chest the only reward.
        const guardian = await trx('fighting_spots as s').join('fighting_spot_creatures as fc', 'fc.spot_id', 's.id')
            .join('creatures as c', 'c.id', 'fc.creature_id')
            .where({ 's.location_id': islet.id, 's.kind': 'guardian', 's.is_active': true, 'c.is_active': true })
            .first('c.id');
        if (!guardian) return nothing;
        const find: IsletFind = { kind: 'cache', location_id: islet.id, target_id: Number(guardian.id), remaining: 1, boost: 1 };
        await trx('player_islet_finds').insert({ player_id: playerId, ...find });
        return find;
    }
    if (pick.kind === 'chest') {
        // Dug up there and then: a Locked Rusty Chest for Geoffrey to open,
        // and a few loose coins from the digging. Nothing is left to work.
        const chest = await trx('items').where({ name: DUG_CHEST_ITEM }).first('id');
        if (!chest) return nothing;
        await addItemToInventoryWithin(trx, playerId, chest.id, 1);
        const coins = CHEST_COINS_MIN + Math.floor(Math.random() * (CHEST_COINS_MAX - CHEST_COINS_MIN + 1));
        await creditGoldWithin(trx, { playerId, amount: coins, reason: 'strandline_coins' });
        return { kind: 'chest', location_id: islet.id, target_id: chest.id, remaining: 0, boost: 1 };
    }

    const target = (await targetFor(trx, playerId, pick.kind, islet.region)) ?? (await targetFor(trx, playerId, pick.kind, null));
    if (target === null) return nothing;
    const min = Number(pick.amount_min), max = Number(pick.amount_max);
    const amount = min + Math.floor(Math.random() * (max - min + 1));
    let targetId = target;
    if (pick.kind === 'vein') {
        // The target was the ore; the find points at the vein made of it.
        const [vein] = await trx('ore_veins').insert({
            location_id: islet.id, ore_item_id: target, total_quantity: amount, remaining_quantity: amount,
            discovered_by_player_id: playerId, discovered_at: new Date(), announced_at: NEVER,
            is_announced: false, is_dense: false, is_depleted: false,
        }).returning('id');
        targetId = Number(typeof vein === 'object' ? vein.id : vein);
    }
    const find: IsletFind = {
        kind: pick.kind, location_id: islet.id, target_id: targetId, remaining: amount, boost: Number(pick.boost),
    };
    await trx('player_islet_finds').insert({ player_id: playerId, ...find });
    return find;
}

/** The player's live find of `kind` on `targetId`, if they stand where it was rolled and it has work left. */
export async function isletFindHere(playerId: number, kind: FindKind, targetId: number, x: any = db): Promise<IsletFind | null> {
    const row = await x('player_islet_finds as f').join('players as p', 'p.id', 'f.player_id')
        .where({ 'f.player_id': playerId, 'f.kind': kind, 'f.target_id': targetId })
        .whereRaw('f.location_id = p.current_location_id')
        .where('f.remaining', '>', 0)
        .first('f.kind', 'f.location_id', 'f.target_id', 'f.remaining', 'f.boost');
    return row ? { ...row, remaining: Number(row.remaining), boost: Number(row.boost) } : null;
}

/** The player's live find, whatever it is, if they stand on its islet. */
export async function liveIsletFind(playerId: number, x: any = db): Promise<IsletFind | null> {
    const row = await x('player_islet_finds as f').join('players as p', 'p.id', 'f.player_id')
        .where('f.player_id', playerId).whereRaw('f.location_id = p.current_location_id').where('f.remaining', '>', 0)
        .first('f.kind', 'f.location_id', 'f.target_id', 'f.remaining', 'f.boost');
    return row ? { ...row, remaining: Number(row.remaining), boost: Number(row.boost) } : null;
}

/**
 * One use of a find, taken in one conditional statement so two resolves can
 * never take the same use. Returns what is left after it, or null when there
 * was none to take.
 */
export async function spendIsletFind(playerId: number, kind: FindKind, targetId: number, x: any = db): Promise<number | null> {
    const rows = await x('player_islet_finds')
        .where({ player_id: playerId, kind, target_id: targetId })
        .where('remaining', '>', 0)
        .decrement('remaining', 1)
        .returning('remaining');
    if (!rows.length) return null;
    const left = Number(typeof rows[0] === 'object' ? rows[0].remaining : rows[0]);
    if (left <= 0) await x('player_islet_finds').where({ player_id: playerId, kind, target_id: targetId, remaining: 0 }).delete();
    return left;
}

/** A find, and whatever it put into the world (an islet vein), gone. */
async function clearFindWithin(x: any, playerId: number): Promise<void> {
    const old = await x('player_islet_finds').where({ player_id: playerId }).first('kind', 'target_id', 'location_id');
    if (old?.kind === 'vein' && old.target_id) {
        await x('ore_veins').where({ id: old.target_id, location_id: old.location_id, discovered_by_player_id: playerId }).delete();
    }
    await x('player_islet_finds').where({ player_id: playerId }).delete();
}

/** Leaving the islet: whatever was found there is gone. */
export async function dropIsletFind(playerId: number, x: any = db): Promise<void> {
    await clearFindWithin(x, playerId);
}

/**
 * Starts "Keep an Eye Out for Quank" inside the landing's transaction, once:
 * the unique (player_id, quest_id) key is the gate. Returns the quest's name
 * when this call started it, null when it was already under way or is not in
 * the content.
 */
async function startQuankQuestWithin(trx: any, playerId: number): Promise<string | null> {
    const quest = await trx('quests').where({ name: QUANK_QUEST, is_active: true }).first('id', 'name');
    if (!quest) return null;
    const started = await trx('player_quests').insert({ player_id: playerId, quest_id: quest.id, status: 'active' })
        .onConflict(['player_id', 'quest_id']).ignore().returning('id');
    if (!started.length) return null;
    const objectives = await trx('quest_objectives').where({ quest_id: quest.id }).pluck('id');
    for (const objective_id of objectives) {
        await trx('player_quest_objectives').insert({ player_id: playerId, objective_id, current_amount: 0, is_complete: false })
            .onConflict(['player_id', 'objective_id']).ignore();
    }
    return String(quest.name);
}
