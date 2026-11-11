import type { Knex } from 'knex'
import db from '../db'
import { logger } from '../lib/logger'
import { SERVER_ERROR } from '../lib/serviceResult'
import { pushToAll, pushToPlayer } from '../lib/realtime'
import { afterCommit } from '../lib/afterCommit'
import { trustOf } from '../lib/trust'
import {
    PollRefusal, readPollDef, readAnswers, CHOICE_KINDS,
    type PollDef, type PollKind, type PollSettings, type StoredQuestion,
} from '../lib/crierPollRules'
import { totalLevel } from './tally'
import { combatLevels } from './combat'
import { combatLevel } from '../lib/combatMath'

// ── The Town Crier's polls (Nathan, 2026-11-05) ─────────────────────────────
// Written in the admin panel's Polls tab and brought to each player who may
// answer: a notice on the scene when the poll opens or when they next log in,
// and the Crier (an NPC with roams_with 'crier_poll') wherever they stand
// until they answer or it closes. Answering pays the poll's Crier's Chits,
// once, in the transaction that records the answer: the unique key on
// (poll_id, player_id) is the gate (CLAUDE.md §4 rule 5). "Not now" keeps the
// notice away but leaves the Crier standing. Once a poll closes, those who
// answered are shown its results once.
//
// Who may answer: a registered account (lib/trust.ts, so never a guest), at
// least min_account_days old, with min_hours_played behind it. Both numbers
// are per poll; 3 and 3 by default (Nathan).
//
// Rules for a poll's shape and an answer's content live in lib/crierPollRules.ts.

export const CRIER_ROAMS_WITH = 'crier_poll'
const SWEEP_SECONDS = 15
/** Results of a closed poll are offered to those who answered for this long. */
const RESULTS_OFFER_DAYS = 14

type Tx = Knex | Knex.Transaction
type Result<T> = ({ ok: true } & T) | { ok: false; error: string }

function fail(err: unknown, what: string): { ok: false; error: string } {
    if (err instanceof PollRefusal) return { ok: false, error: err.message }
    logger.error(`crier polls ${what}: ${err}`)
    return { ok: false, error: SERVER_ERROR }
}

function idOf(raw: unknown): number {
    const id = Math.floor(Number(raw))
    if (!Number.isFinite(id) || id <= 0) throw new PollRefusal('There is no such poll.')
    return id
}

// ── Status ──────────────────────────────────────────────────────────────────

export type PollStatus = 'draft' | 'scheduled' | 'open' | 'closed'

export function pollStatus(p: { opens_at: Date | string | null; closes_at: Date | string | null; closed_at: Date | string | null }, now = Date.now()): PollStatus {
    if (p.closed_at) return 'closed'
    if (!p.opens_at) return 'draft'
    if (new Date(p.opens_at).getTime() > now) return 'scheduled'
    if (p.closes_at && new Date(p.closes_at).getTime() <= now) return 'closed'
    return 'open'
}

/** The WHERE for "open now", for a query on crier_polls (aliased or not). */
function whereOpen(q: Knex.QueryBuilder, t = 'crier_polls'): Knex.QueryBuilder {
    return q.whereNotNull(`${t}.opens_at`).where(`${t}.opens_at`, '<=', db.fn.now())
        .whereNull(`${t}.closed_at`).where(`${t}.closes_at`, '>', db.fn.now())
}

/** When a poll stopped taking answers (closed early, or ran out), or null while it has not. */
function closedAtOf(p: any, now = Date.now()): Date | null {
    if (p.closed_at) return new Date(p.closed_at)
    if (p.closes_at && new Date(p.closes_at).getTime() <= now) return new Date(p.closes_at)
    return null
}

// ── Who may answer ──────────────────────────────────────────────────────────

interface PlayerStanding {
    trusted: boolean
    accountDays: number
    secondsPlayed: number
    chits: number
}

async function standingOf(playerId: number, x: Tx = db): Promise<PlayerStanding | null> {
    const p = await x('players').where({ id: playerId })
        .first('is_guest', 'email_verified_at', 'guest_expires_at', 'created_at', 'total_seconds_played', 'crier_chits')
    if (!p) return null
    return {
        trusted: trustOf(p).trusted,
        accountDays: Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86_400_000),
        secondsPlayed: Number(p.total_seconds_played || 0),
        chits: Number(p.crier_chits || 0),
    }
}

/** Null when the player may answer, or why not, in the player's words. */
export function whyNot(s: PlayerStanding, poll: { min_account_days: number; min_hours_played: number }): string | null {
    if (!s.trusted) return 'The Crier takes answers from registered townsfolk only.'
    if (s.accountDays < Number(poll.min_account_days)) return `This question is for those who have been in Talaran ${poll.min_account_days} days or more.`
    if (s.secondsPlayed < Number(poll.min_hours_played) * 3600) return `This question is for those with ${poll.min_hours_played} hours in Talaran behind them.`
    return null
}

// ── Questions ───────────────────────────────────────────────────────────────

export interface ClientQuestion {
    id: number
    kind: PollKind
    prompt: string
    help: string | null
    required: boolean
    settings: PollSettings
    allowWriteIn: boolean
    writeInLabel: string | null
    allowComment: boolean
    options: { id: number; label: string; itemName: string | null }[]
}

function parseSettings(raw: unknown): PollSettings {
    if (!raw) return {}
    if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return {} } }
    return raw as PollSettings
}

async function questionsOf(pollIds: number[], x: Tx = db): Promise<Map<number, ClientQuestion[]>> {
    const out = new Map<number, ClientQuestion[]>()
    if (pollIds.length === 0) return out
    const qs = await x('crier_poll_questions').whereIn('poll_id', pollIds).orderBy(['poll_id', 'position', 'id'])
    const opts = qs.length
        ? await x('crier_poll_options').whereIn('question_id', qs.map((q: any) => q.id)).orderBy(['question_id', 'position', 'id'])
        : []
    const byQ = new Map<number, ClientQuestion['options']>()
    for (const o of opts) {
        if (!byQ.has(o.question_id)) byQ.set(o.question_id, [])
        byQ.get(o.question_id)!.push({ id: Number(o.id), label: o.label, itemName: o.item_name ?? null })
    }
    for (const q of qs) {
        if (!out.has(q.poll_id)) out.set(q.poll_id, [])
        out.get(q.poll_id)!.push({
            id: Number(q.id), kind: q.kind, prompt: q.prompt, help: q.help ?? null, required: !!q.required,
            settings: parseSettings(q.settings), allowWriteIn: !!q.allow_write_in, writeInLabel: q.write_in_label ?? null,
            allowComment: !!q.allow_comment, options: byQ.get(q.id) ?? [],
        })
    }
    return out
}

function stored(q: ClientQuestion): StoredQuestion {
    return { id: q.id, kind: q.kind, prompt: q.prompt, required: q.required, settings: q.settings, allowWriteIn: q.allowWriteIn, allowComment: q.allowComment, options: q.options }
}

// ── What a player is shown ──────────────────────────────────────────────────

export interface ClientPoll {
    id: number
    title: string
    intro: string | null
    chits: number
    closesAt: string | null
    dismissed: boolean
    questions: ClientQuestion[]
}

/** Open polls this player may answer and has not, oldest first. */
async function pendingPolls(playerId: number, s: PlayerStanding): Promise<ClientPoll[]> {
    if (!s.trusted) return []
    const rows = await whereOpen(db('crier_polls'))
        .whereNotExists(db('crier_poll_responses as r').whereRaw('r.poll_id = crier_polls.id').where('r.player_id', playerId))
        .select('crier_polls.*',
            db.raw('EXISTS (SELECT 1 FROM crier_poll_dismissals d WHERE d.poll_id = crier_polls.id AND d.player_id = ?) AS dismissed', [playerId]))
        .orderBy('opens_at', 'asc')
    const mine = rows.filter((p: any) => whyNot(s, p) === null)
    const qs = await questionsOf(mine.map((p: any) => p.id))
    return mine.map((p: any) => ({
        id: Number(p.id), title: p.title, intro: p.intro ?? null, chits: Number(p.chits),
        closesAt: p.closes_at ? new Date(p.closes_at).toISOString() : null,
        dismissed: !!p.dismissed, questions: qs.get(p.id) ?? [],
    }))
}

/** True while the Crier should stand beside this player. */
export async function crierHasWordFor(playerId: number): Promise<boolean> {
    const s = await standingOf(playerId)
    if (!s) return false
    return (await pendingPolls(playerId, s)).length > 0
}

export async function crierStateFor(playerId: number): Promise<{ polls: ClientPoll[]; results: PollResults[]; chits: number }> {
    const s = await standingOf(playerId)
    if (!s) return { polls: [], results: [], chits: 0 }
    const polls = await pendingPolls(playerId, s)
    // Results of polls this player answered that have closed since, not yet shown.
    const since = new Date(Date.now() - RESULTS_OFFER_DAYS * 86_400_000)
    const closed = await db('crier_poll_responses as r')
        .join('crier_polls as p', 'p.id', 'r.poll_id')
        .where('r.player_id', playerId).whereNull('r.results_seen_at')
        .where(q => q.where(w => w.whereNotNull('p.closed_at').where('p.closed_at', '>', since))
            .orWhere(w => w.whereNull('p.closed_at').where('p.closes_at', '<=', db.fn.now()).where('p.closes_at', '>', since)))
        .orderBy('p.closes_at', 'asc')
        .select('p.id')
    const results: PollResults[] = []
    for (const r of closed) {
        const res = await pollResults(Number(r.id), false)
        if (res) results.push(res)
    }
    return { polls, results, chits: s.chits }
}

// ── Answering ───────────────────────────────────────────────────────────────

export async function answerPoll(playerId: number, pollIdRaw: unknown, answers: unknown): Promise<Result<{ chitsAwarded: number; chits: number }>> {
    try {
        const pollId = idOf(pollIdRaw)
        // Read outside the transaction: they only describe the player, and the
        // level is a snapshot. The checks that gate the payment run inside it.
        const levels = await combatLevels(playerId)
        const total = await totalLevel(playerId)
        return await db.transaction(async (trx) => {
            // The player row first (no key update, CLAUDE.md §2 Combat): two
            // answers at once queue here, then the unique key decides.
            await trx('players').where({ id: playerId }).forNoKeyUpdate().first('id')
            const poll = await trx('crier_polls').where({ id: pollId }).first()
            if (!poll || pollStatus(poll) !== 'open') throw new PollRefusal('That question is no longer being asked.')
            const s = await standingOf(playerId, trx)
            if (!s) throw new PollRefusal('There is no such player.')
            const no = whyNot(s, poll)
            if (no) throw new PollRefusal(no)
            const qs = (await questionsOf([pollId], trx)).get(pollId) ?? []
            const rows = readAnswers(qs.map(stored), answers)

            const [response] = await trx('crier_poll_responses').insert({
                poll_id: pollId, player_id: playerId, chits_awarded: Number(poll.chits),
                total_level: total, combat_level: combatLevel(levels),
                seconds_played: s.secondsPlayed, account_days: s.accountDays,
            }).onConflict(['poll_id', 'player_id']).ignore().returning('id')
            if (!response) throw new PollRefusal('You have already answered this one.')

            if (rows.length) await trx('crier_poll_answers').insert(rows.map(r => ({ ...r, response_id: response.id })))
            const chits = Number(poll.chits)
            let balance = s.chits
            if (chits > 0) {
                const [p] = await trx('players').where({ id: playerId })
                    .update({ crier_chits: trx.raw('crier_chits + ?', [chits]) }).returning('crier_chits')
                balance = Number(p.crier_chits)
                await trx('crier_chit_ledger').insert({ player_id: playerId, delta: chits, reason: 'poll_answered', poll_id: pollId })
            }
            await trx('crier_poll_dismissals').where({ poll_id: pollId, player_id: playerId }).delete()
            // Every tab the player has open drops the notice and the Crier.
            afterCommit(trx, () => pushToPlayer(playerId, 'crier_polls_changed', { pollId }))
            return { ok: true as const, chitsAwarded: chits, chits: balance }
        })
    } catch (err) {
        return fail(err, 'answer')
    }
}

/** "Not now": the notice stays away (on every device); the Crier stays. */
export async function dismissPoll(playerId: number, pollIdRaw: unknown): Promise<Result<{}>> {
    try {
        const pollId = idOf(pollIdRaw)
        const poll = await db('crier_polls').where({ id: pollId }).first()
        if (!poll || pollStatus(poll) !== 'open') throw new PollRefusal('That question is no longer being asked.')
        await db('crier_poll_dismissals').insert({ poll_id: pollId, player_id: playerId }).onConflict(['poll_id', 'player_id']).ignore()
        pushToPlayer(playerId, 'crier_polls_changed', { pollId })
        return { ok: true }
    } catch (err) {
        return fail(err, 'dismiss')
    }
}

export async function markResultsSeen(playerId: number, pollIdRaw: unknown): Promise<Result<{}>> {
    try {
        const pollId = idOf(pollIdRaw)
        await db('crier_poll_responses').where({ poll_id: pollId, player_id: playerId }).whereNull('results_seen_at')
            .update({ results_seen_at: db.fn.now() })
        pushToPlayer(playerId, 'crier_polls_changed', { pollId })
        return { ok: true }
    } catch (err) {
        return fail(err, 'results seen')
    }
}

// ── Results ─────────────────────────────────────────────────────────────────

export interface OptionResult {
    id: number
    label: string
    itemName: string | null
    count: number
    /** Share of those who answered the question, 0 to 1. */
    share: number
    /** Ranking: the average place (1 is first). */
    avgRank?: number
    /** Points: the total given and the average per answer. */
    points?: number
    avgPoints?: number
}

export interface QuestionResult {
    id: number
    kind: PollKind
    prompt: string
    settings: PollSettings
    answered: number
    options: OptionResult[]
    writeInLabel: string | null
    writeIns: number
    /** Scale and number questions. */
    mean?: number | null
    median?: number | null
    min?: number | null
    max?: number | null
    distribution?: { value: number; count: number }[]
    texts?: number
    comments?: number
    /** Admin only: what players wrote. */
    writeInTexts?: string[]
    textAnswers?: string[]
    commentTexts?: string[]
}

export interface PollResults {
    id: number
    title: string
    closedAt: string | null
    respondents: number
    questions: QuestionResult[]
}

function round(n: number, places = 2): number {
    const f = 10 ** places
    return Math.round(n * f) / f
}

/** A poll's results. Players see counts; `admin` adds what was written. */
export async function pollResults(pollId: number, admin: boolean): Promise<PollResults | null> {
    const poll = await db('crier_polls').where({ id: pollId }).first()
    if (!poll) return null
    const qs = (await questionsOf([pollId])).get(pollId) ?? []
    const [{ n }] = await db('crier_poll_responses').where({ poll_id: pollId }).count({ n: '*' })
    const answers = await db('crier_poll_answers as a')
        .join('crier_poll_responses as r', 'r.id', 'a.response_id')
        .where('r.poll_id', pollId)
        .select('a.question_id', 'a.option_id', 'a.value', 'a.text', 'a.is_write_in', 'a.is_comment', 'a.response_id')

    const questions: QuestionResult[] = qs.map(q => {
        const mine = answers.filter((a: any) => a.question_id === q.id)
        const main = mine.filter((a: any) => !a.is_comment)
        const answered = new Set(main.map((a: any) => a.response_id)).size
        const comments = mine.filter((a: any) => a.is_comment)
        const writeIns = main.filter((a: any) => a.is_write_in)
        const res: QuestionResult = {
            id: q.id, kind: q.kind, prompt: q.prompt, settings: q.settings, answered,
            options: [], writeInLabel: q.allowWriteIn ? q.writeInLabel : null, writeIns: writeIns.length,
            comments: comments.length,
        }
        if (CHOICE_KINDS.includes(q.kind)) {
            res.options = q.options.map(o => {
                const rows = main.filter((a: any) => a.option_id === o.id)
                const out: OptionResult = { id: o.id, label: o.label, itemName: o.itemName, count: rows.length, share: answered ? round(rows.length / answered, 4) : 0 }
                if (q.kind === 'rank') out.avgRank = rows.length ? round(rows.reduce((s: number, a: any) => s + Number(a.value), 0) / rows.length) : undefined
                if (q.kind === 'points') {
                    out.points = rows.reduce((s: number, a: any) => s + Number(a.value), 0)
                    out.avgPoints = answered ? round(out.points / answered) : 0
                }
                return out
            })
            if (q.kind === 'rank') res.options.sort((a, b) => (a.avgRank ?? 99) - (b.avgRank ?? 99))
        }
        if (q.kind === 'scale' || q.kind === 'number') {
            const vals = main.map((a: any) => Number(a.value)).filter((v: number) => Number.isFinite(v)).sort((a: number, b: number) => a - b)
            res.mean = vals.length ? round(vals.reduce((s: number, v: number) => s + v, 0) / vals.length) : null
            res.median = vals.length ? (vals.length % 2 ? vals[(vals.length - 1) / 2] : round((vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2)) : null
            res.min = vals.length ? vals[0] : null
            res.max = vals.length ? vals[vals.length - 1] : null
            if (q.kind === 'scale') {
                const sc = q.settings.scale ?? { min: 1, max: 5, minLabel: null, maxLabel: null }
                res.distribution = []
                for (let v = sc.min; v <= sc.max; v++) res.distribution.push({ value: v, count: vals.filter((x: number) => x === v).length })
            }
        }
        if (q.kind === 'text') res.texts = main.length
        if (admin) {
            res.writeInTexts = writeIns.map((a: any) => a.text)
            res.commentTexts = comments.map((a: any) => a.text)
            if (q.kind === 'text') res.textAnswers = main.map((a: any) => a.text)
        }
        return res
    })

    const closed = closedAtOf(poll)
    return { id: Number(poll.id), title: poll.title, closedAt: closed ? closed.toISOString() : null, respondents: Number(n), questions }
}

// ── Opening and closing on time ─────────────────────────────────────────────

/**
 * Tells everyone online when a poll opens or closes, once each, driven by the
 * database so a restart misses nothing (CLAUDE.md §4 rule 15). Players are not
 * kept in step by this alone: every client asks for its state on load.
 */
async function sweep(): Promise<void> {
    const opened = await db('crier_polls').whereNull('announced_open_at').whereNotNull('opens_at')
        .where('opens_at', '<=', db.fn.now()).update({ announced_open_at: db.fn.now() }).returning('id')
    const closed = await db('crier_polls').whereNull('announced_close_at').whereNotNull('opens_at')
        .where(q => q.whereNotNull('closed_at').orWhere('closes_at', '<=', db.fn.now()))
        .update({ announced_close_at: db.fn.now() }).returning('id')
    if (opened.length || closed.length) {
        pushToAll('crier_polls_changed', {})
        logger.info(`[crier] opened ${opened.map((r: any) => r.id).join(',') || '-'}; closed ${closed.map((r: any) => r.id).join(',') || '-'}`)
    }
}

export function startCrierSweep(): void {
    setInterval(() => {
        sweep().catch((err) => logger.error(`[crier] sweep failed: ${err}`))
    }, SWEEP_SECONDS * 1000)
}

// ── Admin ───────────────────────────────────────────────────────────────────

export interface AdminPollSummary {
    id: number
    title: string
    status: PollStatus
    chits: number
    opensAt: string | null
    closesAt: string | null
    closedAt: string | null
    minAccountDays: number
    minHoursPlayed: number
    questions: number
    responses: number
    createdAt: string
}

const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null)

export async function listPolls(): Promise<AdminPollSummary[]> {
    const rows = await db('crier_polls as p')
        .select('p.*',
            db.raw('(SELECT COUNT(*) FROM crier_poll_questions q WHERE q.poll_id = p.id)::int AS questions'),
            db.raw('(SELECT COUNT(*) FROM crier_poll_responses r WHERE r.poll_id = p.id)::int AS responses'))
        .orderBy('p.created_at', 'desc')
    return rows.map((p: any) => ({
        id: Number(p.id), title: p.title, status: pollStatus(p), chits: Number(p.chits),
        opensAt: iso(p.opens_at), closesAt: iso(p.closes_at), closedAt: iso(p.closed_at),
        minAccountDays: Number(p.min_account_days), minHoursPlayed: Number(p.min_hours_played),
        questions: Number(p.questions), responses: Number(p.responses), createdAt: iso(p.created_at)!,
    }))
}

export interface AdminPoll extends AdminPollSummary {
    intro: string | null
    questionList: ClientQuestion[]
}

export async function adminPoll(pollIdRaw: unknown): Promise<Result<{ poll: AdminPoll }>> {
    try {
        const id = idOf(pollIdRaw)
        const summary = (await listPolls()).find(p => p.id === id)
        if (!summary) throw new PollRefusal('There is no such poll.')
        const row = await db('crier_polls').where({ id }).first('intro')
        const qs = (await questionsOf([id])).get(id) ?? []
        return { ok: true, poll: { ...summary, intro: row?.intro ?? null, questionList: qs } }
    } catch (err) {
        return fail(err, 'admin read')
    }
}

/**
 * When a saved poll opens and closes. `opensAt` is null (a draft), 'now', or a
 * time; `closesAt` is a time after it, needed unless it is a draft.
 */
function readWindow(input: any): { opens_at: Date | null; closes_at: Date | null } {
    const now = Date.now()
    let opens: Date | null = null
    if (input?.opensAt === 'now') opens = new Date(now)
    else if (input?.opensAt) {
        opens = new Date(input.opensAt)
        if (Number.isNaN(opens.getTime())) throw new PollRefusal('The opening time is not a time.')
    }
    let closes: Date | null = null
    if (input?.closesAt) {
        closes = new Date(input.closesAt)
        if (Number.isNaN(closes.getTime())) throw new PollRefusal('The closing time is not a time.')
    }
    if (opens) {
        if (!closes) throw new PollRefusal('A poll that opens needs a closing time.')
        if (closes.getTime() <= Math.max(now, opens.getTime())) throw new PollRefusal('The closing time must come after it opens, and after now.')
    }
    return { opens_at: opens, closes_at: closes }
}

async function itemNamesExist(def: PollDef, x: Tx): Promise<void> {
    const names = def.questions.flatMap(q => q.options.map(o => o.itemName).filter((n): n is string => !!n))
    if (!names.length) return
    const found = new Set((await x('items').whereIn('name', names).pluck('name')).map(String))
    const missing = names.filter(n => !found.has(n))
    if (missing.length) throw new PollRefusal(`No item is called ${missing.map(m => `"${m}"`).join(', ')}.`)
}

async function writeQuestions(trx: Knex.Transaction, pollId: number, def: PollDef): Promise<void> {
    for (const [i, q] of def.questions.entries()) {
        const [row] = await trx('crier_poll_questions').insert({
            poll_id: pollId, position: i + 1, kind: q.kind, prompt: q.prompt, help: q.help, required: q.required,
            settings: JSON.stringify(q.settings), allow_write_in: q.allowWriteIn, write_in_label: q.writeInLabel,
            allow_comment: q.allowComment,
        }).returning('id')
        if (q.options.length) {
            await trx('crier_poll_options').insert(q.options.map((o, j) => ({
                question_id: row.id, position: j + 1, label: o.label, item_name: o.itemName,
            })))
        }
    }
}

function pollColumns(def: PollDef) {
    return {
        title: def.title, intro: def.intro, chits: def.chits,
        min_account_days: def.minAccountDays, min_hours_played: def.minHoursPlayed,
    }
}

export async function createPoll(adminId: number, input: unknown): Promise<Result<{ id: number }>> {
    try {
        const def = readPollDef(input)
        const window = readWindow(input)
        const id = await db.transaction(async (trx) => {
            await itemNamesExist(def, trx)
            const [row] = await trx('crier_polls').insert({ ...pollColumns(def), ...window, created_by: adminId }).returning('id')
            await writeQuestions(trx, row.id, def)
            return Number(row.id)
        })
        await sweep().catch(() => {})
        return { ok: true, id }
    } catch (err) {
        return fail(err, 'create')
    }
}

/** Rewrites a poll nobody has answered yet: its questions are replaced whole. */
export async function updatePoll(pollIdRaw: unknown, input: unknown): Promise<Result<{ id: number }>> {
    try {
        const id = idOf(pollIdRaw)
        const def = readPollDef(input)
        const window = readWindow(input)
        await db.transaction(async (trx) => {
            const poll = await trx('crier_polls').where({ id }).forUpdate().first()
            if (!poll) throw new PollRefusal('There is no such poll.')
            if (pollStatus(poll) === 'closed') throw new PollRefusal('A closed poll cannot be changed.')
            const [{ n }] = await trx('crier_poll_responses').where({ poll_id: id }).count({ n: '*' })
            if (Number(n) > 0) throw new PollRefusal('Someone has answered this poll, so its questions are fixed. Change its closing time, or close it.')
            await itemNamesExist(def, trx)
            await trx('crier_polls').where({ id }).update({
                ...pollColumns(def), ...window, updated_at: trx.fn.now(),
                // A rescheduled poll is announced again when it opens.
                announced_open_at: null,
            })
            await trx('crier_poll_questions').where({ poll_id: id }).delete()
            await writeQuestions(trx, id, def)
        })
        await sweep().catch(() => {})
        pushToAll('crier_polls_changed', {})
        return { ok: true, id }
    } catch (err) {
        return fail(err, 'update')
    }
}

/** Changes only when a poll closes; allowed while it is open and answered. */
export async function setClosingTime(pollIdRaw: unknown, closesAtRaw: unknown): Promise<Result<{}>> {
    try {
        const id = idOf(pollIdRaw)
        const closes = new Date(String(closesAtRaw))
        if (Number.isNaN(closes.getTime()) || closes.getTime() <= Date.now()) throw new PollRefusal('The closing time must be a time after now.')
        const n = await db('crier_polls').where({ id }).whereNull('closed_at').whereNotNull('opens_at')
            .where('opens_at', '<', closes).update({ closes_at: closes, announced_close_at: null, updated_at: db.fn.now() })
        if (!n) throw new PollRefusal('Only a poll that is scheduled or open, and not closed, can be given a new closing time.')
        pushToAll('crier_polls_changed', {})
        return { ok: true }
    } catch (err) {
        return fail(err, 'closing time')
    }
}

export async function openPollNow(pollIdRaw: unknown, closesAtRaw: unknown): Promise<Result<{}>> {
    try {
        const id = idOf(pollIdRaw)
        const poll = await db('crier_polls').where({ id }).first()
        if (!poll) throw new PollRefusal('There is no such poll.')
        const st = pollStatus(poll)
        if (st !== 'draft' && st !== 'scheduled') throw new PollRefusal('Only a draft or a scheduled poll can be opened.')
        const closes = closesAtRaw ? new Date(String(closesAtRaw)) : poll.closes_at ? new Date(poll.closes_at) : null
        if (!closes || Number.isNaN(closes.getTime()) || closes.getTime() <= Date.now()) {
            throw new PollRefusal('Give it a closing time after now first.')
        }
        await db('crier_polls').where({ id }).update({ opens_at: db.fn.now(), closes_at: closes, announced_open_at: null, updated_at: db.fn.now() })
        await sweep()
        return { ok: true }
    } catch (err) {
        return fail(err, 'open')
    }
}

export async function closePollNow(pollIdRaw: unknown): Promise<Result<{}>> {
    try {
        const id = idOf(pollIdRaw)
        const n = await db('crier_polls').where({ id }).whereNull('closed_at').whereNotNull('opens_at')
            .where('opens_at', '<=', db.fn.now()).where('closes_at', '>', db.fn.now())
            .update({ closed_at: db.fn.now(), updated_at: db.fn.now() })
        if (!n) throw new PollRefusal('Only an open poll can be closed.')
        await sweep()
        return { ok: true }
    } catch (err) {
        return fail(err, 'close')
    }
}

/** Deletes a poll nobody has answered. Answered polls are a record and stay. */
export async function deletePoll(pollIdRaw: unknown): Promise<Result<{}>> {
    try {
        const id = idOf(pollIdRaw)
        await db.transaction(async (trx) => {
            const poll = await trx('crier_polls').where({ id }).forUpdate().first('id')
            if (!poll) throw new PollRefusal('There is no such poll.')
            const [{ n }] = await trx('crier_poll_responses').where({ poll_id: id }).count({ n: '*' })
            if (Number(n) > 0) throw new PollRefusal('This poll has answers, so it stays on record. Close it instead.')
            await trx('crier_polls').where({ id }).delete()
        })
        pushToAll('crier_polls_changed', {})
        return { ok: true }
    } catch (err) {
        return fail(err, 'delete')
    }
}

// ── Admin: who said what ────────────────────────────────────────────────────

export interface AdminResponse {
    id: number
    player: string
    playerId: number
    totalLevel: number
    combatLevel: number
    hoursPlayed: number
    accountDays: number
    at: string
    /** One line per question, in order: what this player answered. */
    answers: string[]
}

function describeAnswers(q: ClientQuestion, rows: any[]): string {
    const main = rows.filter(a => !a.is_comment)
    const label = (id: number | null) => q.options.find(o => o.id === id)?.label ?? '?'
    let out = ''
    if (q.kind === 'single' || q.kind === 'item' || q.kind === 'multi') {
        out = main.map(a => (a.is_write_in ? `${q.writeInLabel ?? 'Other'}: "${a.text}"` : label(a.option_id))).join('; ')
    } else if (q.kind === 'rank') {
        out = [...main].sort((a, b) => Number(a.value) - Number(b.value)).map(a => `${Number(a.value)}. ${label(a.option_id)}`).join('; ')
    } else if (q.kind === 'points') {
        out = main.map(a => `${label(a.option_id)}: ${Number(a.value)}`).join('; ')
    } else if (q.kind === 'scale' || q.kind === 'number') {
        out = main.map(a => String(Number(a.value))).join('; ')
    } else if (q.kind === 'text') {
        out = main.map(a => a.text).join('; ')
    }
    const comment = rows.find(a => a.is_comment)
    if (comment) out += `${out ? ' ' : ''}(note: "${comment.text}")`
    return out
}

export async function adminResponses(pollIdRaw: unknown): Promise<Result<{ questions: ClientQuestion[]; responses: AdminResponse[] }>> {
    try {
        const id = idOf(pollIdRaw)
        const questions = (await questionsOf([id])).get(id) ?? []
        const responses = await db('crier_poll_responses as r').join('players as p', 'p.id', 'r.player_id')
            .where('r.poll_id', id).orderBy('r.created_at', 'asc')
            .select('r.*', 'p.username')
        const answers = responses.length
            ? await db('crier_poll_answers').whereIn('response_id', responses.map((r: any) => r.id))
            : []
        return {
            ok: true, questions,
            responses: responses.map((r: any) => {
                const mine = answers.filter((a: any) => a.response_id === r.id)
                return {
                    id: Number(r.id), player: r.username, playerId: Number(r.player_id),
                    totalLevel: Number(r.total_level), combatLevel: Number(r.combat_level),
                    hoursPlayed: Math.floor(Number(r.seconds_played) / 3600), accountDays: Number(r.account_days),
                    at: iso(r.created_at)!,
                    answers: questions.map(q => describeAnswers(q, mine.filter((a: any) => a.question_id === q.id))),
                }
            }),
        }
    } catch (err) {
        return fail(err, 'responses')
    }
}

function csvCell(v: unknown): string {
    let s = v === null || v === undefined ? '' : String(v)
    // A player's write-in that starts like a formula would run as one when the
    // export is opened in a spreadsheet; a leading apostrophe makes it text
    // (audit 2026-11-09). Numbers we wrote ourselves are left alone.
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function responsesCsv(pollIdRaw: unknown): Promise<Result<{ csv: string; title: string }>> {
    const r = await adminResponses(pollIdRaw)
    if (!r.ok) return r
    const poll = await db('crier_polls').where({ id: idOf(pollIdRaw) }).first('title')
    const head = ['player', 'total_level', 'combat_level', 'hours_played', 'account_days', 'answered_at', ...r.questions.map((q, i) => `Q${i + 1}: ${q.prompt}`)]
    const lines = [head, ...r.responses.map(x => [x.player, x.totalLevel, x.combatLevel, x.hoursPlayed, x.accountDays, x.at, ...x.answers])]
    return { ok: true, title: poll?.title ?? 'poll', csv: lines.map(l => l.map(csvCell).join(',')).join('\n') + '\n' }
}
