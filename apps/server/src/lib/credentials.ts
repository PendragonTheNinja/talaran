import bcrypt from 'bcrypt';
import { GUEST_SUFFIX } from '../services/guest';

// One set of rules for every place a password or an email is set or checked:
// registration, guest claim, password reset, login and account settings.
//
// These used to be written out separately in each route, and they drifted
// (audit M12). Settings accepted any length of password and hashed it at cost
// 10 against 12 everywhere else, validated no email at all, and threw a 500 for
// a guest because bcrypt.compare refuses a null hash. Login had the same throw
// for anyone typing a guest's name. A rule that lives here is a rule every path
// follows.

export const PASSWORD_MIN_LENGTH = 8;

/** bcrypt work factor for every hash this server writes. */
export const BCRYPT_COST = 12;

/** The column is varchar(255); 254 is the longest address SMTP allows. */
export const EMAIL_MAX_LENGTH = 254;

/**
 * Deliberately loose: something, an @, something with a dot in it, and no
 * spaces. Anything stricter rejects real addresses. The real proof that an
 * address works is mail arriving at it, which is what verification is for.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Why this can't be a password, or null if it can. */
export function passwordProblem(raw: unknown): string | null {
    if (typeof raw !== 'string' || raw.length < PASSWORD_MIN_LENGTH) {
        return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
    }
    return null;
}

export function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_COST);
}

/**
 * Does this password match the stored hash? A guest has no hash yet, and that
 * is an ordinary "no", never a throw.
 */
export async function passwordMatches(raw: unknown, hash: string | null | undefined): Promise<boolean> {
    if (typeof raw !== 'string' || !raw || !hash) return false;
    return bcrypt.compare(raw, hash);
}

/**
 * The address to store, trimmed, or null if it is not one. Case is kept as the
 * player typed it; every comparison is case-insensitive, and the database
 * backs that with players_email_lower_unique.
 */
export function cleanEmail(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const email = raw.trim();
    if (email.length > EMAIL_MAX_LENGTH || !EMAIL_SHAPE.test(email)) return null;
    return email;
}

export const EMAIL_PROBLEM = 'That does not look like an email address';


/**
 * The name to store, or why this can't be one (audit L-4). Trimmed; 3 to 32
 * characters; plain letters, digits, single spaces, hyphens and underscores,
 * starting and ending with a letter or digit. Anything else used to pass:
 * trailing spaces, zero-width characters, and look-alike letters from other
 * alphabets, which let one player pass as another in chat. Existing names are
 * untouched; this governs names being chosen.
 */
export function cleanUsername(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
    if (typeof raw !== 'string') return { ok: false, error: 'Username must be between 3 and 32 characters' };
    const name = raw.trim();
    if (name.length < 3 || name.length > 32) return { ok: false, error: 'Username must be between 3 and 32 characters' };
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9_-]| (?! ))*[A-Za-z0-9]$/.test(name)) {
        return { ok: false, error: 'Names can use letters, numbers, single spaces, hyphens and underscores, and must start and end with a letter or number' };
    }
    // Guest names end in this, so a chosen name may not (it would pass for one).
    if (name.toLowerCase().endsWith(GUEST_SUFFIX)) return { ok: false, error: `Usernames cannot end in "${GUEST_SUFFIX}"` };
    return { ok: true, value: name };
}

/** Postgres unique_violation. A clash that slipped past the check-then-write. */
export function isUniqueViolation(err: unknown): boolean {
    return (err as { code?: string } | null)?.code === '23505';
}
