import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('guilds', (table) => {
        table.timestamp('tag_last_changed').nullable();
        table.string('recruitment_message', 500).nullable();
        table.integer('min_level_requirement').notNullable().defaultTo(1);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('guilds', (table) => {
        table.dropColumn('tag_last_changed');
        table.dropColumn('recruitment_message');
        table.dropColumn('min_level_requirement');
    });
}