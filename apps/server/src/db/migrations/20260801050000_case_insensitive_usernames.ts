import type { Knex } from 'knex';

// Usernames and emails become unique WITHOUT REGARD TO CASE.
//
// The existing unique constraints are case-sensitive, so Pendragon, pendragon
// and PeNdRaGoN could all register as separate accounts. That is wrong on its
// own terms — they are one person to everyone reading chat — and it quietly
// breaks anything that looks a player up case-insensitively: whispers, and any
// moderation or profile lookup that follows, would pick one of them arbitrarily.
//
// The application now compares with LOWER() on both sides, but a check in the
// route is not enough: two signups arriving together can both pass it and both
// insert. The database has to be the thing that says no.
//
// A functional unique index does that. It also makes the existing case-sensitive
// unique constraints redundant, but they are left in place: they are implied by
// the stricter index and dropping them buys nothing.

export async function up(knex: Knex): Promise<void> {
    // Refuse to proceed on a database that already contains collisions, rather
    // than failing with a raw constraint violation that says nothing useful.
    const clashes = await knex('players')
        .select<{ lower: string; names: string }[]>(
            knex.raw('LOWER(username) as lower'),
            knex.raw('STRING_AGG(username, \', \') as names'),
        )
        .groupByRaw('LOWER(username)')
        .havingRaw('COUNT(*) > 1');

    if (clashes.length) {
        const detail = clashes.map((c) => c.names).join(' | ');
        throw new Error(
            'Cannot add case-insensitive username index: these accounts already collide — '
            + `${detail}. Rename or remove all but one of each before migrating.`,
        );
    }

    const emailClashes = await knex('players')
        .whereNotNull('email')
        .select<{ names: string }[]>(knex.raw('STRING_AGG(email, \', \') as names'))
        .groupByRaw('LOWER(email)')
        .havingRaw('COUNT(*) > 1');

    if (emailClashes.length) {
        const detail = emailClashes.map((c) => c.names).join(' | ');
        throw new Error(
            `Cannot add case-insensitive email index: these emails already collide — ${detail}.`,
        );
    }

    await knex.raw(
        'CREATE UNIQUE INDEX IF NOT EXISTS players_username_lower_unique ON players (LOWER(username))',
    );
    await knex.raw(
        'CREATE UNIQUE INDEX IF NOT EXISTS players_email_lower_unique ON players (LOWER(email))',
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('DROP INDEX IF EXISTS players_username_lower_unique');
    await knex.raw('DROP INDEX IF EXISTS players_email_lower_unique');
}
