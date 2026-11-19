import type { Knex } from 'knex';

// A rock's drops by place, not only by kind of rock (docs/antura-plan.md §4
// and §14). Every granite rolls `mining:rock:granite` today, so Antura's
// granite would give Taiar's gem odds. A node may now name its own drop
// table; a node that names none rolls by its rock's subtype, as before.
//
//   resource_nodes.drop_source_key   e.g. 'mining:rock:granite@antura'; null
//                                    for every node today.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('resource_nodes', 'drop_source_key'))) {
        await knex.schema.alterTable('resource_nodes', (t) => { t.string('drop_source_key', 100).nullable(); });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('resource_nodes', 'drop_source_key')) {
        await knex.schema.alterTable('resource_nodes', (t) => { t.dropColumn('drop_source_key'); });
    }
}
