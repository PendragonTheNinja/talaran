import type { Knex } from 'knex';

// A moderator can clear a player's avatar and stop them choosing another
// (services/avatars.ts clearAvatar with block). Schema only.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('players', 'avatar_blocked'))) {
        await knex.schema.alterTable('players', t => { t.boolean('avatar_blocked').notNullable().defaultTo(false); });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('players', 'avatar_blocked')) {
        await knex.schema.alterTable('players', t => { t.dropColumn('avatar_blocked'); });
    }
}
