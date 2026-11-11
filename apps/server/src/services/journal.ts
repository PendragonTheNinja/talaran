import db from '../db'
import { logger } from '../lib/logger'
import { readText } from '../lib/textLimits'
import { SERVER_ERROR } from '../lib/serviceResult'

// ── The Journal (Nathan, 2026-11-03) ─────────────────────────────────────────
// A player's own notes. Bodies are plain text; the client draws checklists
// ("- [ ]" / "- [x]") and links item names. Nothing here is shared with anyone.

export const JOURNAL_MAX_NOTES = 50
export const JOURNAL_TITLE_MAX = 80
export const JOURNAL_BODY_MAX = 2000
export const JOURNAL_COLORS = ['red', 'gold', 'green', 'blue', 'purple'] as const

export interface JournalNote {
    id: number
    title: string
    body: string
    color: string | null
    pinned: boolean
    createdAt: string
    updatedAt: string
}

class JournalRefusal extends Error {}

function shape(r: any): JournalNote {
    return {
        id: Number(r.id), title: r.title, body: r.body ?? '', color: r.color ?? null, pinned: !!r.pinned,
        createdAt: new Date(r.created_at).toISOString(), updatedAt: new Date(r.updated_at).toISOString(),
    }
}

/** The fields a request may set, checked; only those it sent. */
function readFields(input: any, creating: boolean): Partial<{ title: string; body: string; color: string | null; pinned: boolean }> {
    const out: Partial<{ title: string; body: string; color: string | null; pinned: boolean }> = {}
    if (input?.title !== undefined || creating) {
        const t = readText(input?.title ?? '', { label: 'Title', max: JOURNAL_TITLE_MAX, singleLine: true, required: false })
        if (!t.ok) throw new JournalRefusal(t.error)
        out.title = t.value || 'Untitled'
    }
    if (input?.body !== undefined) {
        if (typeof input.body !== 'string') throw new JournalRefusal('A note is text.')
        // Kept as written (no trim): a checklist line being typed has trailing spaces.
        if (input.body.length > JOURNAL_BODY_MAX) throw new JournalRefusal(`A note holds ${JOURNAL_BODY_MAX.toLocaleString('en-US')} characters at most.`)
        out.body = input.body
    }
    if (input?.color !== undefined) {
        if (input.color !== null && !(JOURNAL_COLORS as readonly string[]).includes(input.color)) throw new JournalRefusal('That is not one of the colors.')
        out.color = input.color
    }
    if (input?.pinned !== undefined) out.pinned = !!input.pinned
    return out
}

type Result<T> = { ok: true } & T | { ok: false; error: string }

function fail(err: unknown, what: string): { ok: false; error: string } {
    if (err instanceof JournalRefusal) return { ok: false, error: err.message }
    logger.error(`journal ${what}: ${err}`)
    return { ok: false, error: SERVER_ERROR }
}

export async function listNotes(playerId: number): Promise<{ notes: JournalNote[]; max: number }> {
    const rows = await db('player_journal_notes').where({ player_id: playerId })
        .orderBy([{ column: 'pinned', order: 'desc' }, { column: 'updated_at', order: 'desc' }])
    return { notes: rows.map(shape), max: JOURNAL_MAX_NOTES }
}

export async function createNote(playerId: number, input: unknown): Promise<Result<{ note: JournalNote }>> {
    try {
        const fields = readFields(input, true)
        return { ok: true, note: await db.transaction(async (trx) => {
            // The player's row first: two creates at once queue here, so the
            // count below cannot be read by both before either inserts.
            await trx('players').where({ id: playerId }).forNoKeyUpdate().first('id')
            const [{ n }] = await trx('player_journal_notes').where({ player_id: playerId }).count({ n: '*' })
            if (Number(n) >= JOURNAL_MAX_NOTES) throw new JournalRefusal(`Your journal is full (${JOURNAL_MAX_NOTES} notes). Remove one to make room.`)
            const [row] = await trx('player_journal_notes').insert({ player_id: playerId, body: '', ...fields }).returning('*')
            return shape(row)
        }) }
    } catch (err) {
        return fail(err, 'create')
    }
}

export async function updateNote(playerId: number, noteIdRaw: unknown, input: unknown): Promise<Result<{ note: JournalNote }>> {
    try {
        const id = Math.floor(Number(noteIdRaw))
        if (!Number.isFinite(id) || id <= 0) throw new JournalRefusal('There is no such note.')
        const fields = readFields(input, false)
        const [row] = await db('player_journal_notes').where({ id, player_id: playerId })
            .update({ ...fields, updated_at: db.fn.now() }).returning('*')
        if (!row) throw new JournalRefusal('There is no such note.')
        return { ok: true, note: shape(row) }
    } catch (err) {
        return fail(err, 'update')
    }
}

export async function deleteNote(playerId: number, noteIdRaw: unknown): Promise<Result<{}>> {
    try {
        const id = Math.floor(Number(noteIdRaw))
        const n = Number.isFinite(id) && id > 0 ? await db('player_journal_notes').where({ id, player_id: playerId }).delete() : 0
        if (!n) throw new JournalRefusal('There is no such note.')
        return { ok: true }
    } catch (err) {
        return fail(err, 'delete')
    }
}
