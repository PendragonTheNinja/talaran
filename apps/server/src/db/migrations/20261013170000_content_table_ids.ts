import type { Knex } from 'knex';

// Three tables from the combat update were keyed only by their natural key
// (durability_tiers by tier, player_item_wear and player_creature_kills by
// player and item or creature). The admin content browser reads, orders and
// edits every table by `id` (routes/adminContent.ts), so they failed there
// with "column id does not exist". Each gets an `id` like every other table.
// The natural keys stay the primary keys, so every ON CONFLICT that names them
// works unchanged. Schema only.

const TABLES = ['durability_tiers', 'player_item_wear', 'player_creature_kills'];

export async function up(knex: Knex): Promise<void> {
    for (const t of TABLES) {
        if (await knex.schema.hasTable(t) && !(await knex.schema.hasColumn(t, 'id'))) {
            await knex.raw('ALTER TABLE ?? ADD COLUMN id serial NOT NULL UNIQUE', [t]);
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    for (const t of TABLES) {
        if (await knex.schema.hasColumn(t, 'id')) {
            await knex.schema.alterTable(t, tb => { tb.dropColumn('id'); });
        }
    }
}
