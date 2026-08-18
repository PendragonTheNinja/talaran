import type { Knex } from 'knex';

// Guest accounts, plus the column email verification will later switch on.
//
// Guests are rows in `players`, not a separate table. Almost everything in the
// schema hangs off players.id — skills, inventory, equipment, properties, farm
// plots, crops, shops, traps, animals, quests, forum posts, tally boards, the
// loot log. A `guests` table would need every one of those to carry a second
// nullable owner, and "upgrade to a full account" would become an id remap
// across twenty-odd tables. As a flag on players, upgrading is one UPDATE and
// every existing foreign key, service and route keeps working untouched.
//
// email_verified_at lands in this migration even though verification is not
// built yet. The reason is the gate, not the column: the check "may this
// account trade, run a shop, drop items, post to chat and the forums?" has the
// same answer for a guest and for an unverified account, so it wants to be one
// predicate written into every call site once. Backfilling every existing row
// to verified makes that half of the predicate inert until verification ships,
// and no enforcement point has to be revisited when it does.

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('players', (table) => {
        table.boolean('is_guest').notNullable().defaultTo(false);
        // Wall-clock deadline for the session. Null for real accounts.
        table.timestamp('guest_expires_at').nullable();
        // Null means unverified. Set to a time, not a boolean, so "when did
        // this happen" is answerable later without a second column.
        table.timestamp('email_verified_at').nullable();
    });

    // Guests have neither an email nor a password, and both columns are
    // currently NOT NULL. Dropping the constraint is a catalogue-only change
    // in Postgres — no table rewrite, no lock worth worrying about at this
    // size. The register route already requires both at the application layer,
    // so real accounts are unaffected.
    await knex.raw('ALTER TABLE players ALTER COLUMN email DROP NOT NULL');
    await knex.raw('ALTER TABLE players ALTER COLUMN password_hash DROP NOT NULL');

    // players_email_lower_unique is a functional unique index on LOWER(email).
    // LOWER(NULL) is NULL, and Postgres permits unlimited NULLs in a unique
    // index, so any number of guests coexist under it without collision. No
    // change is needed there — this comment exists so the next person does not
    // have to work that out from first principles.

    // Grandfather everyone already playing. Without this, adding the column
    // marks all existing accounts unverified, and the moment verification is
    // enforced the entire live playerbase loses trading, shops and chat at once.
    const [{ count }] = await knex('players').count<{ count: string }[]>('id as count');
    await knex('players')
        .whereNull('email_verified_at')
        .update({ email_verified_at: knex.fn.now() });
    // eslint-disable-next-line no-console
    console.log(`[guest_accounts] grandfathered ${count} existing player(s) as verified`);

    // The sweep job asks one question on a schedule: which guests are past
    // their deadline. A partial index keeps that off the real accounts, which
    // are and always will be the overwhelming majority of the table.
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS players_guest_expiry_idx
        ON players (guest_expires_at)
        WHERE is_guest = true
    `);

    // Deliberately no index for the is_guest = false filter on highscores and
    // player counts. At this table size the planner will sequential scan
    // regardless, and an index that is never chosen is write cost for nothing.
}

export async function down(knex: Knex): Promise<void> {
    // Restoring NOT NULL fails outright if any guest row is still present, so
    // guests are removed first. This deletes real progress belonging to anyone
    // mid-session, which is correct for a rollback and worth knowing before
    // running it against production.
    await knex('players').where({ is_guest: true }).del();

    await knex.raw('DROP INDEX IF EXISTS players_guest_expiry_idx');

    await knex.raw('ALTER TABLE players ALTER COLUMN email SET NOT NULL');
    await knex.raw('ALTER TABLE players ALTER COLUMN password_hash SET NOT NULL');

    await knex.schema.alterTable('players', (table) => {
        table.dropColumn('is_guest');
        table.dropColumn('guest_expires_at');
        table.dropColumn('email_verified_at');
    });
}
