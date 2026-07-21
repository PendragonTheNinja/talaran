import type { Knex } from 'knex';

// Support Us Phase C2: custom palettes (docs/support-spec.md §4).
// tokens is a whitelisted map of theme token -> hex color, validated
// server-side on every write. is_shared palettes are viewable by anyone on
// the owner's profile but applicable only by Custom Palette perk owners.
export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('player_palettes', (t) => {
        t.increments('id').primary();
        t.integer('player_id').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');
        t.string('name', 40).notNullable();
        t.jsonb('tokens').notNullable();
        t.boolean('is_shared').notNullable().defaultTo(false);
        t.timestamps(true, true);
        t.unique(['player_id', 'name']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('player_palettes');
}
