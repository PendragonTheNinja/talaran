import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('resource_nodes', (table) => {
        table.string('ore_subtype', 50).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('resource_nodes', (table) => {
        table.dropColumn('ore_subtype');
    });
}