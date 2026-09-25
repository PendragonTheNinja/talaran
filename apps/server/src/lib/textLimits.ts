// How long player-written text may be, and one way to read it (audit M11).
//
// Forum threads and replies, private messages, guild forum posts and guild
// text used to be bounded only by Express's 100 KB body limit, so at the forum
// limiter's 120 requests a minute one account could write about 12 MB of forum
// text a minute. Chat already had its own cap (MAX_MESSAGE_LENGTH in
// routes/chat.ts); everything else reads its caps from here.
//
// Where a column or an existing input already set a size, the cap matches it,
// so nothing the game's own forms allow is refused. Body text had no size
// anywhere, so those caps are new. The client mirrors these numbers in
// apps/client/src/lib/textLimits.ts to stop typing at the limit; this file is
// the one that counts.
//
// Over-long text is REFUSED, never cut short. A post that silently loses its
// last paragraph is worse than being told it is too long.

export const TEXT_LIMITS = {
    // Public forum
    forumTitle: 200,          // forum_threads.title varchar(200)
    forumPost: 10_000,        // forum_posts.content text
    pollQuestion: 300,        // forum_polls.question varchar(300)
    pollOption: 200,          // forum_poll_options.option_text varchar(200)
    pollOptionsMin: 2,
    pollOptionsMax: 6,        // the client's add-option button stops at six
    lockReason: 200,          // forum_threads.locked_reason varchar(200)

    // Guild forum
    guildForumTitle: 200,     // guild_forum_threads.title varchar(200)
    guildForumPost: 10_000,   // guild_forum_posts.content text

    // Private messages
    messageSubject: 200,      // messages.subject varchar(200)
    messageBody: 5_000,       // messages.body text

    // Guilds
    guildName: 100,           // guilds.name varchar(100)
    guildDescription: 500,    // guilds.description text; the settings form stops at 500
    guildRecruitment: 500,    // guilds.recruitment_message varchar(500)
    guildApplication: 500,    // guild_applications.message text
} as const;

export type TextResult =
    | { ok: true; value: string | null }
    | { ok: false; error: string };

/**
 * Read one field of player text.
 *
 * Trims it, refuses anything that is not a string, refuses empty text when
 * the field is required, and refuses text over `max`. A single-line field
 * (titles, names, subjects) has its runs of whitespace, newlines included,
 * folded to single spaces, because those strings are shown on one line in
 * lists and chat announcements. Optional fields come back as null when blank.
 *
 * `label` names the field in the error, e.g. "Title" gives "Title is too long
 * (200 characters at most)."
 */
export function readText(
    raw: unknown,
    opts: { label: string; max: number; required?: boolean; singleLine?: boolean },
): TextResult {
    const { label, max, required = true, singleLine = false } = opts;

    if (raw === undefined || raw === null) {
        return required ? { ok: false, error: `${label} is required.` } : { ok: true, value: null };
    }
    if (typeof raw !== 'string') {
        return { ok: false, error: `${label} must be text.` };
    }

    const value = singleLine ? raw.replace(/\s+/g, ' ').trim() : raw.trim();

    if (!value) {
        return required ? { ok: false, error: `${label} is required.` } : { ok: true, value: null };
    }
    if (value.length > max) {
        return { ok: false, error: `${label} is too long (${max.toLocaleString('en-US')} characters at most).` };
    }
    return { ok: true, value };
}
