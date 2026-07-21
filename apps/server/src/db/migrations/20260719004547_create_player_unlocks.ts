import type { Knex } from 'knex';

// Phase C of Support Us (docs/support-spec.md §6): cosmetic ownership.
// unlock_key examples: 'theme:moonveil', 'perk:custom_palette',
// 'badge:founding_supporter'. Unlocks are granted inside the same DB
// transaction as their Taler debit — never separately.
export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('player_unlocks', (t) => {
        t.increments('id').primary();
        t.integer('player_id').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');
        t.string('unlock_key', 80).notNullable();
        t.timestamp('created_at').defaultTo(knex.fn.now());
        t.unique(['player_id', 'unlock_key']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('player_unlocks');
}
