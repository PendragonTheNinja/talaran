import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('npc_dialogues', (table) => {
        table.increments('id').primary();
        table.integer('npc_id').unsigned().notNullable()
            .references('id').inTable('npcs').onDelete('CASCADE');
        table.string('stage_key', 50).notNullable(); // intro, offer, progress, ready, complete
        table.specificType('text_lines', 'text[]').notNullable(); // array of paragraphs
        table.jsonb('options').notNullable().defaultTo('[]');
        // options format: [{ label: string, next_stage: string | null, action: string | null }]
        table.timestamps(true, true);
        table.unique(['npc_id', 'stage_key']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('npc_dialogues');
}