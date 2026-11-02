import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Seed return at harvest (Nathan, 2026-11-02). Each seed sown has this chance
// of coming back when the crop is lifted, so a farm keeps part of its own seed
// and foraging tops it up instead of supplying every sowing. Always below 1:
// a field can never seed more fields than it took.
//
// Grain and garlic save best, the way they do in a real barn; peas and flax
// give a fair share; roots give little, because the root is the harvest.
// Strawberry and raspberry stay at 0: they regrow from the plant already in
// the ground and never use another runner or cane.
//
// A Seedsaver's Ring adds its strength to the chance (services/farming.ts).

const RETURN: [string, number][] = [
    ['Wild Grain', 0.6],
    ['Garlic', 0.6],
    ['Pea', 0.4],
    ['Flax', 0.4],
    ['Carrot', 0.2],
    ['Onion', 0.2],
    ['Turnip', 0.2],
    ['Strawberry', 0],
    ['Raspberry', 0],
];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('crops', 'seed_return_chance'))) {
        await knex.schema.alterTable('crops', (t) => {
            t.float('seed_return_chance').notNullable().defaultTo(0);
        });
    }
    if (!(await hasContent(knex))) return;

    for (const [name, chance] of RETURN) {
        const n = await knex('crops').where({ name }).update({ seed_return_chance: chance });
        if (n !== 1) throw new Error(`crop_seed_return: crop "${name}" not found`);
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('crops', 'seed_return_chance')) {
        await knex.schema.alterTable('crops', (t) => {
            t.dropColumn('seed_return_chance');
        });
    }
}
