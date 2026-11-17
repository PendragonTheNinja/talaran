import db from '../db';
import { levelFromXp } from './xp';

// ── What a landing finds (docs/islets-plan.md §2 and §4) ─────────────────────
//
// On each landing a player rolls one find from what that islet can hold
// (`islet_finds`, by weight, active kinds only). A work find is the best of
// its kind on the island that the player has the level for, holds a fixed
// amount of work (`islet_find_kinds`), and makes that work's extras `boost`
// times likelier. It is theirs alone, and it is lost when they leave the
// islet. Each skill's own action spends it, one use at a time, through
// isletFindHere and spendIsletFind; nothing about the skill's rules changes.

export type FindKind = 'stand' | 'vein' | 'shoal' | 'patch' | 'trail' | 'nothing';

export interface IsletFind {
    kind: FindKind
    location_id: number
    target_id: number | null
    remaining: number
    boost: number
}

async function skillLevel(x: any, playerId: number, skill: string): Promise<number> {
    const row = await x('player_skills as ps').join('skills as s', 's.id', 'ps.skill_id')
        .where({ 'ps.player_id': playerId, 's.name': skill }).first('ps.xp');
    return row ? levelFromXp(Number(row.xp)) : 1;
}

/**
 * The thing a work find is a best-of: for a stand, the island's best
 * woodcutting node the player has the level for. Null when they have the level
 * for none, and the find becomes nothing.
 */
async function targetFor(x: any, playerId: number, kind: FindKind, island: string): Promise<number | null> {
    if (kind === 'stand') {
        const level = await skillLevel(x, playerId, 'Woodcutting');
        const node = await x('resource_nodes as n').join('locations as l', 'l.id', 'n.location_id')
            .where('l.region', island).where('n.is_active', true).whereRaw('LOWER(n.skill) = ?', ['woodcutting'])
            .where('n.required_level', '<=', level)
            .orderBy([{ column: 'n.required_level', order: 'desc' }, { column: 'n.id', order: 'asc' }])
            .first('n.id');
        return node ? Number(node.id) : null;
    }
    return null;
}

/**
 * Roll this landing's find, inside the landing's transaction (the player row
 * is locked by the caller). Replaces any find the player still had.
 */
export async function rollIsletFindWithin(trx: any, playerId: number, islet: { id: number; region: string }): Promise<IsletFind> {
    await trx('player_islet_finds').where({ player_id: playerId }).delete();
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
    const nothing: IsletFind = { kind: 'nothing', location_id: islet.id, target_id: null, remaining: 0, boost: 1 };
    if (!pick || pick.kind === 'nothing') return nothing;

    const target = await targetFor(trx, playerId, pick.kind, islet.region);
    if (target === null) return nothing;
    const min = Number(pick.amount_min), max = Number(pick.amount_max);
    const find: IsletFind = {
        kind: pick.kind, location_id: islet.id, target_id: target,
        remaining: min + Math.floor(Math.random() * (max - min + 1)), boost: Number(pick.boost),
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

/** Leaving the islet: whatever was found there is gone. */
export async function dropIsletFind(playerId: number, x: any = db): Promise<void> {
    await x('player_islet_finds').where({ player_id: playerId }).delete();
}
