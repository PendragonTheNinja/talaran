import { readText } from './textLimits';

// The Town Crier's polls: what a poll may hold and what an answer may say.
// Pure, so the admin editor's save, the player's answer and the race check all
// read the same rules. services/crierPolls.ts does the database side.

export const POLL_KINDS = ['single', 'multi', 'scale', 'rank', 'points', 'item', 'number', 'text'] as const;
export type PollKind = typeof POLL_KINDS[number];

/** Kinds whose answers name options. */
export const CHOICE_KINDS: readonly PollKind[] = ['single', 'multi', 'rank', 'points', 'item'];
/** Kinds that may offer the player their own answer beside the options. */
export const WRITE_IN_KINDS: readonly PollKind[] = ['single', 'multi', 'item'];

export const POLL_LIMITS = {
    title: 120,
    intro: 500,
    prompt: 300,
    help: 300,
    optionLabel: 200,
    writeInLabel: 60,
    writeIn: 200,
    comment: 500,
    textDefault: 500,
    textMax: 1000,
    questionsMax: 10,
    optionsMin: 2,
    optionsMax: 12,
    rankMax: 8,
    chitsMax: 100,
    daysMax: 365,
    hoursMax: 1000,
    unit: 20,
    scaleLabel: 40,
} as const;

export class PollRefusal extends Error {}

export interface ScaleSettings { min: number; max: number; minLabel: string | null; maxLabel: string | null }
export interface NumberSettings { min: number | null; max: number | null; integer: boolean; unit: string | null }
export interface PollSettings {
    maxChoices?: number | null;
    scale?: ScaleSettings;
    total?: number;
    number?: NumberSettings;
    maxLength?: number;
}

export interface QuestionDef {
    kind: PollKind;
    prompt: string;
    help: string | null;
    required: boolean;
    settings: PollSettings;
    allowWriteIn: boolean;
    writeInLabel: string | null;
    allowComment: boolean;
    options: { label: string; itemName: string | null }[];
}

export interface PollDef {
    title: string;
    intro: string | null;
    chits: number;
    minAccountDays: number;
    minHoursPlayed: number;
    questions: QuestionDef[];
}

function text(raw: unknown, label: string, max: number, required = true, singleLine = true): string | null {
    const r = readText(raw, { label, max, required, singleLine });
    if (!r.ok) throw new PollRefusal(r.error);
    return r.value;
}

function whole(raw: unknown, label: string, min: number, max: number): number {
    const n = Number(raw);
    if (!Number.isFinite(n) || Math.floor(n) !== n || n < min || n > max) {
        throw new PollRefusal(`${label} must be a whole number from ${min} to ${max}.`);
    }
    return n;
}

function finiteOrNull(raw: unknown, label: string): number | null {
    if (raw === undefined || raw === null || raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new PollRefusal(`${label} must be a number.`);
    return n;
}

/** Reads and checks a poll as the admin editor sends it. Throws PollRefusal. */
export function readPollDef(input: any): PollDef {
    const title = text(input?.title, 'The title', POLL_LIMITS.title)!;
    const intro = text(input?.intro, 'The introduction', POLL_LIMITS.intro, false, false);
    const chits = whole(input?.chits ?? 2, 'The reward', 0, POLL_LIMITS.chitsMax);
    const minAccountDays = whole(input?.minAccountDays ?? 3, 'The account age', 0, POLL_LIMITS.daysMax);
    const minHoursPlayed = whole(input?.minHoursPlayed ?? 3, 'The hours played', 0, POLL_LIMITS.hoursMax);

    const rawQs = Array.isArray(input?.questions) ? input.questions : [];
    if (rawQs.length === 0) throw new PollRefusal('A poll needs at least one question.');
    if (rawQs.length > POLL_LIMITS.questionsMax) throw new PollRefusal(`A poll holds ${POLL_LIMITS.questionsMax} questions at most.`);

    const questions = rawQs.map((q: any, i: number) => readQuestionDef(q, i + 1));
    return { title, intro, chits, minAccountDays, minHoursPlayed, questions };
}

function readQuestionDef(q: any, n: number): QuestionDef {
    const where = `Question ${n}`;
    const kind = q?.kind as PollKind;
    if (!POLL_KINDS.includes(kind)) throw new PollRefusal(`${where} has no kind.`);
    const prompt = text(q?.prompt, `${where}'s question`, POLL_LIMITS.prompt)!;
    const help = text(q?.help, `${where}'s hint`, POLL_LIMITS.help, false);
    const required = q?.required !== false;
    const allowComment = !!q?.allowComment;
    const allowWriteIn = WRITE_IN_KINDS.includes(kind) && !!q?.allowWriteIn;
    const writeInLabel = allowWriteIn
        ? (text(q?.writeInLabel, `${where}'s write-in label`, POLL_LIMITS.writeInLabel, false) ?? 'Something else')
        : null;

    let options: { label: string; itemName: string | null }[] = [];
    if (CHOICE_KINDS.includes(kind)) {
        const raw = Array.isArray(q?.options) ? q.options : [];
        options = raw
            .map((o: any) => ({
                label: text(o?.label ?? o?.itemName, `An option in ${where.toLowerCase()}`, POLL_LIMITS.optionLabel, false),
                itemName: kind === 'item' ? text(o?.itemName, `An item in ${where.toLowerCase()}`, 100, false) : null,
            }))
            .filter((o: { label: string | null; itemName: string | null }) => o.label || o.itemName)
            .map((o: { label: string | null; itemName: string | null }) => ({ label: o.label ?? o.itemName!, itemName: o.itemName }));
        if (kind === 'item' && options.some(o => !o.itemName)) throw new PollRefusal(`Every option in ${where.toLowerCase()} needs an item.`);
        const max = kind === 'rank' ? POLL_LIMITS.rankMax : POLL_LIMITS.optionsMax;
        if (options.length < POLL_LIMITS.optionsMin || options.length > max) {
            throw new PollRefusal(`${where} needs ${POLL_LIMITS.optionsMin} to ${max} options.`);
        }
        const seen = new Set<string>();
        for (const o of options) {
            const key = o.label.toLowerCase();
            if (seen.has(key)) throw new PollRefusal(`${where} lists "${o.label}" twice.`);
            seen.add(key);
        }
    }

    const s = q?.settings ?? {};
    const settings: PollSettings = {};
    if (kind === 'multi') {
        const choosable = options.length + (allowWriteIn ? 1 : 0);
        settings.maxChoices = s.maxChoices === null || s.maxChoices === undefined || s.maxChoices === ''
            ? null : whole(s.maxChoices, `${where}'s most choices`, 1, choosable);
    }
    if (kind === 'scale') {
        const min = whole(s.scale?.min ?? 1, `${where}'s lowest value`, 0, 1);
        const max = whole(s.scale?.max ?? 5, `${where}'s highest value`, min + 1, 10);
        settings.scale = {
            min, max,
            minLabel: text(s.scale?.minLabel, `${where}'s low label`, POLL_LIMITS.scaleLabel, false),
            maxLabel: text(s.scale?.maxLabel, `${where}'s high label`, POLL_LIMITS.scaleLabel, false),
        };
    }
    if (kind === 'points') settings.total = whole(s.total ?? 10, `${where}'s points to share`, 1, 100);
    if (kind === 'number') {
        const min = finiteOrNull(s.number?.min, `${where}'s lowest number`);
        const max = finiteOrNull(s.number?.max, `${where}'s highest number`);
        if (min !== null && max !== null && min >= max) throw new PollRefusal(`${where}'s lowest number must be below its highest.`);
        settings.number = { min, max, integer: s.number?.integer !== false, unit: text(s.number?.unit, `${where}'s unit`, POLL_LIMITS.unit, false) };
    }
    if (kind === 'text') settings.maxLength = whole(s.maxLength ?? POLL_LIMITS.textDefault, `${where}'s longest answer`, 20, POLL_LIMITS.textMax);

    return { kind, prompt, help, required, settings, allowWriteIn, writeInLabel, allowComment, options };
}

// ── Answers ─────────────────────────────────────────────────────────────────

/** A question as stored, with its options' ids. */
export interface StoredQuestion {
    id: number;
    kind: PollKind;
    prompt: string;
    required: boolean;
    settings: PollSettings;
    allowWriteIn: boolean;
    allowComment: boolean;
    options: { id: number; label: string }[];
}

export interface AnswerRow {
    question_id: number;
    option_id: number | null;
    value: number | null;
    text: string | null;
    is_write_in: boolean;
    is_comment: boolean;
}

const row = (questionId: number, over: Partial<AnswerRow>): AnswerRow => ({
    question_id: questionId, option_id: null, value: null, text: null, is_write_in: false, is_comment: false, ...over,
});

function optionIdOf(q: StoredQuestion, raw: unknown, n: number): number {
    const id = Math.floor(Number(raw));
    if (!q.options.some(o => o.id === id)) throw new PollRefusal(`Question ${n}: that is not one of its answers.`);
    return id;
}

function writeInOf(raw: unknown, n: number): string | null {
    return text(raw, `Question ${n}: your own answer`, POLL_LIMITS.writeIn, false);
}

/**
 * Checks one player's answers to a poll and returns the rows to store.
 * `input` maps question id to that question's answer. Throws PollRefusal.
 */
export function readAnswers(questions: StoredQuestion[], input: any): AnswerRow[] {
    const out: AnswerRow[] = [];
    const answers = input && typeof input === 'object' ? input : {};
    questions.forEach((q, i) => {
        const n = i + 1;
        const a = answers[q.id] ?? answers[String(q.id)] ?? null;
        const before = out.length;

        if (q.kind === 'single' || q.kind === 'item') {
            const writeIn = q.allowWriteIn ? writeInOf(a?.writeIn, n) : null;
            const chosen = a?.optionId !== undefined && a?.optionId !== null;
            if (chosen && writeIn) throw new PollRefusal(`Question ${n}: choose one answer.`);
            if (chosen) out.push(row(q.id, { option_id: optionIdOf(q, a.optionId, n) }));
            else if (writeIn) out.push(row(q.id, { text: writeIn, is_write_in: true }));
        }

        if (q.kind === 'multi') {
            const ids = Array.isArray(a?.optionIds) ? a.optionIds.map((x: unknown) => optionIdOf(q, x, n)) : [];
            if (new Set(ids).size !== ids.length) throw new PollRefusal(`Question ${n}: an answer is chosen twice.`);
            const writeIn = q.allowWriteIn ? writeInOf(a?.writeIn, n) : null;
            const count = ids.length + (writeIn ? 1 : 0);
            const most = q.settings.maxChoices ?? null;
            if (most !== null && count > most) throw new PollRefusal(`Question ${n}: choose ${most} at most.`);
            for (const id of ids) out.push(row(q.id, { option_id: id }));
            if (writeIn) out.push(row(q.id, { text: writeIn, is_write_in: true }));
        }

        if (q.kind === 'scale') {
            if (a?.value !== undefined && a?.value !== null && a?.value !== '') {
                const sc = q.settings.scale ?? { min: 1, max: 5 };
                out.push(row(q.id, { value: whole(a.value, `Question ${n}`, sc.min, sc.max) }));
            }
        }

        if (q.kind === 'rank') {
            const order = Array.isArray(a?.order) ? a.order.map((x: unknown) => optionIdOf(q, x, n)) : [];
            if (order.length) {
                if (order.length !== q.options.length || new Set(order).size !== order.length) {
                    throw new PollRefusal(`Question ${n}: put every answer in order, each once.`);
                }
                order.forEach((id: number, rank: number) => out.push(row(q.id, { option_id: id, value: rank + 1 })));
            }
        }

        if (q.kind === 'points') {
            const given = a?.points && typeof a.points === 'object' ? a.points : null;
            if (given) {
                const total = q.settings.total ?? 10;
                let sum = 0;
                const rows: AnswerRow[] = [];
                for (const [k, v] of Object.entries(given)) {
                    const id = optionIdOf(q, k, n);
                    const pts = whole(v, `Question ${n}'s points`, 0, total);
                    sum += pts;
                    if (pts > 0) rows.push(row(q.id, { option_id: id, value: pts }));
                }
                if (sum > 0 && sum !== total) throw new PollRefusal(`Question ${n}: share all ${total} points (${sum} given).`);
                out.push(...rows);
            }
        }

        if (q.kind === 'number') {
            if (a?.value !== undefined && a?.value !== null && a?.value !== '') {
                const ns = q.settings.number ?? { min: null, max: null, integer: true, unit: null };
                const v = Number(a.value);
                if (!Number.isFinite(v)) throw new PollRefusal(`Question ${n}: that is not a number.`);
                if (ns.integer && Math.floor(v) !== v) throw new PollRefusal(`Question ${n}: a whole number, please.`);
                if (ns.min !== null && v < ns.min) throw new PollRefusal(`Question ${n}: ${ns.min} at the least.`);
                if (ns.max !== null && v > ns.max) throw new PollRefusal(`Question ${n}: ${ns.max} at the most.`);
                out.push(row(q.id, { value: v }));
            }
        }

        if (q.kind === 'text') {
            const t = text(a?.text, `Question ${n}`, q.settings.maxLength ?? POLL_LIMITS.textDefault, false, false);
            if (t) out.push(row(q.id, { text: t }));
        }

        const answered = out.length > before;
        if (q.required && !answered) throw new PollRefusal(`Question ${n} needs an answer.`);

        if (q.allowComment) {
            const c = text(a?.comment, `Question ${n}: your note`, POLL_LIMITS.comment, false, false);
            if (c) out.push(row(q.id, { text: c, is_comment: true }));
        }
    });
    return out;
}
