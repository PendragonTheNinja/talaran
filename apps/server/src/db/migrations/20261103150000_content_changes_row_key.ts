import type { Knex } from 'knex';

// The admin database panel now opens every table (lib/adminTables.ts),
// including those whose rows are named by two columns rather than an id
// (player_spells, guild_storage, ...). content_changes logged a row by its
// integer id, so those rows get their key written here as text: the same
// JSON the panel sends ({"player_id":5,"spell_id":2}). row_id is 0 for them.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('content_changes', 'row_key'))) {
        await knex.schema.alterTable('content_changes', (t) => {
            t.text('row_key').nullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('content_changes', 'row_key')) {
        await knex.schema.alterTable('content_changes', (t) => {
            t.dropColumn('row_key');
        });
    }
}
