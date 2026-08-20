import db from '../db';
import { logger } from '../index';

// Guest sessions.
//
// A guest is an ordinary row in `players` with is_guest = true and a deadline.
// They start exactly where a real registration starts: level 1 at Talador with
// the same starter tools and the same tutorial, because a trial that hands out
// a pre-built character is not a trial of this game.
//
// The deadline is wall-clock and fixed at creation. It is deliberately not
// extended by activity: a session that renews on every click is not a trial,
// it is an unlimited account with a chore attached. Stepping away costs
// nothing, because the character outlives the session by GUEST_RETENTION_DAYS
// and claiming it at any point in that window restores the lot.

/** How long a guest session lasts, from creation. */
export const GUEST_SESSION_MINUTES = 60;

/**
 * How long an expired guest is kept before deletion. Someone who tried the
 * game on Tuesday and came back on Thursday is exactly the person worth
 * keeping, and they should find their skills still there when they upgrade.
 */
export const GUEST_RETENTION_DAYS = 7;

/**
 * Ceiling on live guest sessions across the whole server.
 *
 * The per-IP rate limit is the first line, but it only slows down one address.
 * Anyone with a proxy pool walks straight around it, and each session writes a
 * players row plus a full set of skills, stats and items. This is the backstop
 * that bounds the damage: at worst the server refuses new trials for an hour
 * until the deadlines lapse, which is a far better failure than a database
 * filling with junk accounts. Well above any plausible real demand at alpha.
 */
export const MAX_ACTIVE_GUESTS = 150;

/** Every guest name ends in this. Registration refuses it, case-insensitively. */
export const GUEST_SUFFIX = '-guest';

// In-world names, so a guest in the player list reads as an inhabitant rather
// than as User4817. Server-generated rather than chosen: a typed name lets
// someone register Foozard-guest and impersonate a real player in chat. They
// choose a real name when they upgrade, which is a better moment for it anyway.
const GUEST_NAMES = [
    'Pilgrim', 'Wanderer', 'Drifter', 'Stranger', 'Traveller', 'Newcomer',
    'Wayfarer', 'Rambler', 'Sojourner', 'Vagabond', 'Journeyer', 'Roamer',
    'Outlander', 'Farer', 'Pathfinder', 'Voyager', 'Nomad', 'Trekker',
];

function candidateName(): string {
    const stem = GUEST_NAMES[Math.floor(Math.random() * GUEST_NAMES.length)];
    const n = Math.floor(Math.random() * 90) + 10; // 10-99, always two digits
    return `${stem}${n}${GUEST_SUFFIX}`;
}

/**
 * A free guest name. Checked against players_username_lower_unique the same
 * way registration is, and retried on collision. The pool is 18 x 90 = 1620
 * names, so collisions are rare, but "rare" is not "never" and the unique
 * index would otherwise surface as a raw constraint violation.
 */
export async function generateGuestUsername(attempts = 12): Promise<string | null> {
    for (let i = 0; i < attempts; i++) {
        const name = candidateName();
        const taken = await db('players')
            .whereRaw('LOWER(username) = LOWER(?)', [name])
            .first();
        if (!taken) return name;
    }
    return null;
}

export function guestDeadline(from: Date = new Date()): Date {
    return new Date(from.getTime() + GUEST_SESSION_MINUTES * 60 * 1000);
}

export interface CreatedGuest {
    id: number;
    username: string;
    guest_expires_at: Date;
}

/**
 * Creates a guest and seeds it identically to a fresh registration. Everything
 * happens in one transaction: a guest with a players row but no skills rows
 * would be a broken character that still occupies a username.
 */
export class GuestCapacityError extends Error {
    constructor() {
        super('guest capacity reached');
        this.name = 'GuestCapacityError';
    }
}

export async function createGuest(): Promise<CreatedGuest | null> {
    const [{ count }] = await db('players')
        .where({ is_guest: true })
        .andWhere('guest_expires_at', '>', new Date())
        .count<{ count: string }[]>('id as count');

    if (parseInt(count, 10) >= MAX_ACTIVE_GUESTS) {
        logger.warn(`[guest] capacity reached (${count}/${MAX_ACTIVE_GUESTS}), refusing new session`);
        throw new GuestCapacityError();
    }

    const username = await generateGuestUsername();
    if (!username) {
        logger.error('[guest] could not find a free guest username after retries');
        return null;
    }

    const expiresAt = guestDeadline();

    return db.transaction(async (trx) => {
        const startingLocation = await trx('locations').where({ name: 'Talador' }).first();

        const [player] = await trx('players')
            .insert({
                username,
                email: null,
                password_hash: null,
                is_guest: true,
                // Never cleared, including on upgrade. is_guest answers "is this
                // a trial now"; this answers "did this account start as one",
                // which is the half that survives a conversion and makes the
                // rate measurable later.
                was_guest: true,
                guest_expires_at: expiresAt,
                current_location_id: startingLocation?.id || null,
            })
            .returning(['id', 'username']);

        // Same seeding as POST /api/auth/register. If that ever grows a step,
        // this has to grow with it, which is why they are commented as a pair.
        const allSkills = await trx('skills').select('id');
        if (allSkills.length) {
            await trx('player_skills').insert(
                allSkills.map((skill: { id: number }) => ({
                    player_id: player.id,
                    skill_id: skill.id,
                    xp: 0,
                })),
            );
        }
        await trx('player_stats').insert({ player_id: player.id });

        const starters = ['Ambren Hatchet', 'Ambren Pickaxe', "Novice's Pony"];
        for (const name of starters) {
            const item = await trx('items').where({ name }).first();
            if (item) {
                await trx('player_inventory').insert({
                    player_id: player.id,
                    item_id: item.id,
                    quantity: 1,
                });
            }
        }

        logger.info(`[guest] created ${username} (expires ${expiresAt.toISOString()})`);
        return { id: player.id, username: player.username, guest_expires_at: expiresAt };
    });
}


/**
 * Deletes guests whose deadline passed more than GUEST_RETENTION_DAYS ago.
 * Expiry locks the session; this is the later cleanup, kept separate so a
 * lapsed guest still has a window in which upgrading recovers their progress.
 */
export async function sweepExpiredGuests(): Promise<number> {
    const cutoff = new Date(Date.now() - GUEST_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const doomed = await db('players')
        .where({ is_guest: true })
        .andWhere('guest_expires_at', '<', cutoff)
        .select('id', 'username');

    if (!doomed.length) return 0;

    const ids = doomed.map((p: { id: number }) => p.id);
    await db('players').whereIn('id', ids).del();

    logger.info(`[guest] swept ${doomed.length} expired guest account(s)`);
    return doomed.length;
}
