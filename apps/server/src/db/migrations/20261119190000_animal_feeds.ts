import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The homestead, part two: animals eat whatever they really would
// (docs/foraging-farming-ladder.md §2, locked in principle by Nathan,
// 2026-11-15). A species had exactly one feed (animal_species.feed_item_name
// and feed_qty); now it has a list.
//
//   animal_feeds   species, item, and how many a head eats of it. Every valid
//                  feed counts the same; only the amount differs, by how
//                  filling it is: grain, barley, peas, and beans at the
//                  species' own amount, roots, greens, and nuts at twice it.
//   By hand the player picks the feed; Feed All and Larder Ward use the
//   cheapest the pack or the storehouse holds enough of (services/husbandry.ts
//   feedsFor). feed_item_name stays on the species as its first, plainest
//   feed, read wherever one name is wanted.

// [species, item, multiple of the species' feed_qty]
const FEEDS: [string, string, number][] = [
    ['Chicken', 'Grain', 1], ['Chicken', 'Barley', 1], ['Chicken', 'Peas', 1], ['Chicken', 'Cabbage', 2],
    ['Cow', 'Grain', 1], ['Cow', 'Barley', 1], ['Cow', 'Turnip', 2], ['Cow', 'Beet', 2],
    ['Pig', 'Grain', 1], ['Pig', 'Barley', 1], ['Pig', 'Peas', 1], ['Pig', 'Broad Beans', 1],
    ['Pig', 'Turnip', 2], ['Pig', 'Beet', 2], ['Pig', 'Cabbage', 2], ['Pig', 'Hazelnuts', 2],
    ['Rouncey', 'Grain', 1], ['Rouncey', 'Barley', 1], ['Rouncey', 'Broad Beans', 1], ['Rouncey', 'Carrot', 2],
    ['Palfrey', 'Grain', 1], ['Palfrey', 'Barley', 1], ['Palfrey', 'Broad Beans', 1], ['Palfrey', 'Carrot', 2],
];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('animal_feeds'))) {
        await knex.schema.createTable('animal_feeds', (t) => {
            t.increments('id').primary();
            t.integer('species_id').notNullable().references('id').inTable('animal_species').onDelete('CASCADE');
            t.string('item_name', 100).notNullable();
            t.integer('qty').notNullable();
            t.integer('display_order').notNullable().defaultTo(0);
            t.boolean('is_active').notNullable().defaultTo(true);
            t.unique(['species_id', 'item_name']);
        });
        await knex.raw('ALTER TABLE animal_feeds ADD CONSTRAINT animal_feeds_qty_positive CHECK (qty > 0)');
    }
    if (!(await hasContent(knex))) return;

    for (const [i, [speciesName, item, multiple]] of FEEDS.entries()) {
        const species = await knex('animal_species').where({ name: speciesName }).first('id', 'feed_qty');
        if (!species) throw new Error(`animal_feeds: no species named ${speciesName}`);
        if (!(await knex('items').where({ name: item }).first('id'))) throw new Error(`animal_feeds: no item named ${item}`);
        const qty = Math.max(1, Number(species.feed_qty) || 1) * multiple;
        await knex('animal_feeds').insert({ species_id: species.id, item_name: item, qty, display_order: i, is_active: true })
            .onConflict(['species_id', 'item_name']).merge();
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('animal_feeds');
}
