import db from '../db';
import { logger } from '../lib/logger';
import { SERVER_ERROR } from '../lib/serviceResult';
import { afterCommit } from '../lib/afterCommit';
import { namesRefusal } from './wordFilter';
import { announceServer } from './records';

// ── Naming the islets (Nathan, 2026-11-22) ──────────────────────────────────
//
// The first player to land on an unnamed islet holds the right to put a name
// to the Harbor Council. They hold it only while they stand there: the
// moment they sail off, are brought home, or are anywhere else, it is free,
// and the next player to land (or the next to look, if someone already
// stands there) takes it. Ad infinitum, until a name is put forward.
//
// A name put forward waits for staff (admin panel, Islet Names). While it
// waits, nobody may put another for that islet; the partial unique index
// islet_name_proposals_one_pending is the gate. Staff choose it, and the
// islet carries it (announced to everyone), or turn it down, and the islet is
// open again.
//
// These are alpha names. 1.0 clears both tables and gives the final names, so
// the chosen name sits beside locations.name (`given_name` wherever an islet is
// shown) and never replaces it: migrations and code find islets by their
// standing names.

export const NAME_MIN = 3;
export const NAME_MAX = 32;
export const NOTE_MAX = 300;
export const COUNCIL = 'the Harbor Council';

class NameAbort extends Error {
    constructor(message: string, public status = 400) { super(message); }
}

type Refused = { ok: false; error: string; status: number };
function refuse(err: unknown, context: string): Refused {
    if (err instanceof NameAbort) return { ok: false, error: err.message, status: err.status };
    if ((err as { code?: string })?.code === '23505') return { ok: false, error: 'A name for this islet is already before the council.', status: 409 };
    logger.error(`islet names ${context}: ${err}`);
    return { ok: false, error: SERVER_ERROR, status: 500 };
}

// ── Names on show ───────────────────────────────────────────────────────────

let cache: { at: number; names: Map<number, string> } | null = null;
const CACHE_MS = 60_000;

/** Every chosen islet name, by location id. Cached a minute; a decision clears it. */
export async function givenIsletNames(): Promise<Map<number, string>> {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.names;
    const rows = await db('islet_names').whereNotNull('name').select('location_id', 'name');
    cache = { at: Date.now(), names: new Map(rows.map((r: any) => [Number(r.location_id), String(r.name)])) };
    return cache.names;
}

/** The name an islet is shown by: its chosen one, or null for its standing name. */
export async function givenNameOf(locationId: number | null | undefined): Promise<string | null> {
    if (!locationId) return null;
    return (await givenIsletNames()).get(Number(locationId)) ?? null;
}

// ── The right to name ───────────────────────────────────────────────────────

/** Is the player standing on this islet, and not sailing away from it? */
async function standsOn(x: any, playerId: number, locationId: number): Promise<boolean> {
    const p = await x('players').where({ id: playerId, current_location_id: locationId }).first('id');
    if (!p) return false;
    return !(await x('player_actions').where({ player_id: playerId, action_type: 'traveling' }).first('id'));
}

/**
 * Take the right to name this islet if it is free: no name chosen, none
 * before the council, and nobody holding it who still stands there. One
 * conditional statement, so two players landing together cannot both hold it.
 * True when the player holds it (now or already).
 */
export async function claimWithin(x: any, playerId: number, locationId: number): Promise<boolean> {
    if (!(await standsOn(x, playerId, locationId))) return false;
    await x('islet_names').insert({ location_id: locationId }).onConflict('location_id').ignore();
    const took = await x('islet_names')
        .where({ location_id: locationId })
        .whereNull('name')
        .whereNotExists(x('islet_name_proposals').where({ location_id: locationId, status: 'pending' }).select(x.raw('1')))
        .where((q: any) => q
            .whereNull('holder_player_id')
            .orWhere('holder_player_id', playerId)
            .orWhereNotExists(
                x('players as p').whereRaw('p.id = islet_names.holder_player_id').where('p.current_location_id', locationId)
                    .whereNotExists(x('player_actions as a').whereRaw('a.player_id = p.id').where('a.action_type', 'traveling').select(x.raw('1')))
                    .select(x.raw('1')),
            ))
        .update({
            holder_player_id: playerId,
            held_since: x.raw('CASE WHEN holder_player_id = ? THEN held_since ELSE now() END', [playerId]),
        });
    return took === 1;
}

export interface IsletNaming {
    /** The islet's standing name. */
    islet: string;
    /** The name the council chose, if any. */
    givenName: string | null;
    namedBy: string | null;
    /** 'named': chosen. 'pending': a name waits. 'yours': this player may put one. 'held': someone else here holds the right. */
    status: 'named' | 'pending' | 'yours' | 'held';
    /** The name this player put forward that waits, if any. */
    yourPending: string | null;
    nameMin: number;
    nameMax: number;
    noteMax: number;
}

/** What the islet the player stands on says about its name; null off an islet. Claims the right if free. */
export async function namingState(playerId: number): Promise<IsletNaming | null> {
    const here = await db('players as p').join('locations as l', 'l.id', 'p.current_location_id')
        .where('p.id', playerId).first('l.id', 'l.name', 'l.islet_kind');
    if (!here?.islet_kind) return null;
    const yours = await claimWithin(db, playerId, Number(here.id));
    const row = await db('islet_names as n').leftJoin('players as p', 'p.id', 'n.named_by_player_id')
        .where('n.location_id', here.id).first('n.name', 'p.username as named_by');
    const pending = await db('islet_name_proposals').where({ location_id: here.id, status: 'pending' }).first('player_id', 'name');
    const status: IsletNaming['status'] = row?.name ? 'named' : pending ? 'pending' : yours ? 'yours' : 'held';
    return {
        islet: here.name,
        givenName: row?.name ?? null,
        namedBy: row?.name ? (row.named_by ?? null) : null,
        status,
        yourPending: pending && Number(pending.player_id) === playerId ? pending.name : null,
        nameMin: NAME_MIN, nameMax: NAME_MAX, noteMax: NOTE_MAX,
    };
}

/** "the  grey   rock" → "the grey rock"; refused unless letters, spaces, apostrophes, and hyphens. */
export function cleanIsletName(raw: unknown): { ok: true; name: string } | { ok: false; error: string } {
    const name = String(raw ?? '').normalize('NFC').replace(/[’‘]/g, '\'').replace(/\s+/g, ' ').trim();
    if (name.length < NAME_MIN || name.length > NAME_MAX) return { ok: false, error: `A name runs ${NAME_MIN} to ${NAME_MAX} letters.` };
    if (!/^[\p{L}][\p{L}' -]*$/u.test(name)) return { ok: false, error: 'A name is letters, spaces, apostrophes, and hyphens, and starts with a letter.' };
    if (/['-]{2}| [ '-]|['-] /.test(name)) return { ok: false, error: 'That name has its marks in odd places.' };
    return { ok: true, name };
}

/** Put a name to the council: the holder alone, while they stand there, once. */
export async function proposeName(playerId: number, rawName: unknown, rawNote: unknown): Promise<{ ok: true; message: string } | Refused> {
    try {
        const cleaned = cleanIsletName(rawName);
        if (!cleaned.ok) throw new NameAbort(cleaned.error);
        const name = cleaned.name;
        const note = String(rawNote ?? '').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX) || null;
        const refused = await namesRefusal(name);
        if (refused) throw new NameAbort(refused);
        if (note && (await namesRefusal(note))) throw new NameAbort('The council will not read that.');
        // No two places with one name: neither a standing name nor a chosen one.
        const clash = await db('locations').whereRaw('LOWER(name) = LOWER(?)', [name]).first('id')
            ?? await db('islet_names').whereRaw('LOWER(name) = LOWER(?)', [name]).first('location_id')
            ?? await db('islet_name_proposals').where({ status: 'pending' }).whereRaw('LOWER(name) = LOWER(?)', [name]).first('id');
        if (clash) throw new NameAbort('Somewhere already has that name, or will soon.');

        return await db.transaction(async (trx) => {
            const here = await trx('players as p').join('locations as l', 'l.id', 'p.current_location_id')
                .where('p.id', playerId).first('l.id', 'l.name', 'l.islet_kind');
            if (!here?.islet_kind) throw new NameAbort('You can only name an islet you stand on.');
            const locationId = Number(here.id);
            // Claim first (it may have just come free), then lock what was claimed.
            await claimWithin(trx, playerId, locationId);
            const row = await trx('islet_names').where({ location_id: locationId }).forUpdate().first('holder_player_id', 'name');
            if (row?.name) throw new NameAbort(`This islet already has a name: ${row.name}.`);
            if (Number(row?.holder_player_id) !== playerId || !(await standsOn(trx, playerId, locationId))) {
                throw new NameAbort('Someone else landed first. The right is theirs while they are here.');
            }
            // The insert is the gate: one name waits per islet.
            await trx('islet_name_proposals').insert({ location_id: locationId, player_id: playerId, name, note });
            await trx('islet_names').where({ location_id: locationId }).update({ holder_player_id: null, held_since: null });
            return { ok: true as const, message: `You put "${name}" to ${COUNCIL}. They will decide in their own time.` };
        });
    } catch (err) {
        return refuse(err, 'propose');
    }
}

// ── Word back ───────────────────────────────────────────────────────────────

export interface NameNews { id: number; islet: string; name: string; status: 'approved' | 'rejected'; reason: string | null }

/** Decisions on this player's names they have not yet been shown. */
export async function nameNews(playerId: number): Promise<NameNews[]> {
    const rows = await db('islet_name_proposals as n').join('locations as l', 'l.id', 'n.location_id')
        .where('n.player_id', playerId).whereIn('n.status', ['approved', 'rejected']).whereNull('n.seen_at')
        .orderBy('n.decided_at').select('n.id', 'l.name as islet', 'n.name', 'n.status', 'n.reason');
    return rows.map((r: any) => ({ id: Number(r.id), islet: r.islet, name: r.name, status: r.status, reason: r.reason ?? null }));
}

export async function markNewsSeen(playerId: number): Promise<void> {
    await db('islet_name_proposals').where({ player_id: playerId }).whereIn('status', ['approved', 'rejected']).whereNull('seen_at')
        .update({ seen_at: db.fn.now() });
}

// ── The council's side (staff) ──────────────────────────────────────────────

export async function proposalsForStaff() {
    const rows = await db('islet_name_proposals as n').join('locations as l', 'l.id', 'n.location_id')
        .join('players as p', 'p.id', 'n.player_id').leftJoin('players as d', 'd.id', 'n.decided_by')
        .orderByRaw(`CASE WHEN n.status = 'pending' THEN 0 ELSE 1 END`).orderBy('n.created_at', 'desc').limit(200)
        .select('n.id', 'n.name', 'n.note', 'n.status', 'n.reason', 'n.created_at', 'n.decided_at',
            'l.name as islet', 'l.region as island', 'p.username as player', 'd.username as decided_by');
    const named = await db('islet_names as n').join('locations as l', 'l.id', 'n.location_id')
        .leftJoin('players as p', 'p.id', 'n.named_by_player_id').whereNotNull('n.name')
        .orderBy('l.region').orderBy('l.id').select('l.name as islet', 'l.region as island', 'n.name', 'p.username as named_by', 'n.named_at');
    return { proposals: rows, named };
}

/** Choose or turn down a name. Completion is the gate: only a waiting name can be decided, once. */
export async function decideName(staffId: number, proposalId: number, approve: boolean, rawReason: unknown): Promise<{ ok: true; message: string } | Refused> {
    try {
        const id = Math.floor(Number(proposalId));
        if (!Number.isFinite(id) || id <= 0) throw new NameAbort('No such name.');
        const reason = String(rawReason ?? '').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX) || null;
        return await db.transaction(async (trx) => {
            const flipped = await trx('islet_name_proposals').where({ id, status: 'pending' })
                .update({ status: approve ? 'approved' : 'rejected', decided_by: staffId, decided_at: trx.fn.now(), reason })
                .returning(['location_id', 'player_id', 'name']);
            if (!flipped.length) throw new NameAbort('That name has already been decided.', 409);
            const p = flipped[0];
            const islet = await trx('locations').where({ id: p.location_id }).first('name');
            if (approve) {
                await trx('islet_names').insert({ location_id: p.location_id }).onConflict('location_id').ignore();
                await trx('islet_names').where({ location_id: p.location_id })
                    .update({ name: p.name, named_by_player_id: p.player_id, named_at: trx.fn.now(), holder_player_id: null, held_since: null });
                const who = await trx('players').where({ id: p.player_id }).first('username');
                afterCommit(trx, async () => {
                    cache = null;
                    await announceServer(`${COUNCIL.charAt(0).toUpperCase()}${COUNCIL.slice(1)} has written a new name on the charts: ${islet?.name ?? 'an islet'} is now ${p.name}, as ${who?.username ?? 'a sailor'} put it to them.`);
                });
            } else {
                // Open again: the next to land may put a name.
                await trx('islet_names').where({ location_id: p.location_id }).update({ holder_player_id: null, held_since: null });
            }
            return { ok: true as const, message: approve ? `${islet?.name} is now ${p.name}.` : `"${p.name}" turned down; ${islet?.name} is open again.` };
        });
    } catch (err) {
        return refuse(err, 'decide');
    }
}
