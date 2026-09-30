import type { Knex } from 'knex';
import { exhibitFor } from '../../lib/museumPlacement';

// Island Museums (docs/WORLD-EVENTS-AND-MUSEUMS.md, Part 2).
//
//   museums           one per island: its name and the town it stands in.
//   museum_exhibits   a museum's walls, in order. `match` says which items
//                     belong on it ({ type, subtype? } patterns, read by
//                     lib/museumPlacement.ts); one exhibit per museum is the
//                     catch-all for anything no rule claims.
//   museum_cases      one item each, on one exhibit. An item is in at most one
//                     museum.
//   museum_donations  state: one row per player per case. The plaque (who gave
//                     it first, and when) is the earliest row for a case;
//                     donations to a case are made under its row lock, so
//                     there is exactly one.
//
// The first three are content, snapshotted and editable in the admin panel;
// moving or removing a case is an edit there. This fills the Taiar Museum
// with every item the island yields today. New items place themselves when
// they are first found (services/museum.ts).

const MUSEUM = { key: 'taiar', name: 'Taiar Museum', island: 'Taiar Island', town: 'Talador' };

// In display order. Descriptions are the line under each exhibit's name.
const EXHIBITS: { name: string; description: string; match: { type: string; subtype?: string }[]; catchAll?: boolean }[] = [
    { name: 'Timber', description: 'Every wood the island grows, in the log and in the plank.',
      match: [{ type: 'log' }, { type: 'plank' }, { type: 'material', subtype: 'log' }, { type: 'material', subtype: 'bark' },
              { type: 'material', subtype: 'shaft' }, { type: 'material', subtype: 'tool_rod' }] },
    { name: 'Stone and Ore', description: 'What the picks bring up, and what the forge makes of it.',
      match: [{ type: 'ore' }, { type: 'rock' }, { type: 'ingot' }, { type: 'gem' }, { type: 'fuel' },
              { type: 'material', subtype: 'stone' }, { type: 'material', subtype: 'gem' }, { type: 'material', subtype: 'component' }] },
    { name: 'Fish of the Coast', description: 'From the lakes, the rivers and the cold water off the headlands.',
      match: [{ type: 'food', subtype: 'raw_fish' }] },
    { name: 'Hedgerow and Herb', description: 'Picked by hand from the verges, the woods and the wet ground.',
      match: [{ type: 'material', subtype: 'herb' }, { type: 'material', subtype: 'berry' }, { type: 'material', subtype: 'flower' },
              { type: 'material', subtype: 'mushroom' }, { type: 'material', subtype: 'fungus' }, { type: 'material', subtype: 'nut' },
              { type: 'material', subtype: 'root' }, { type: 'material', subtype: 'reagent' }, { type: 'material', subtype: 'reed' }] },
    { name: 'Field and Fold', description: 'Sown, raised and brought in at Novita.',
      match: [{ type: 'material', subtype: 'seed' }, { type: 'material', subtype: 'grain' }, { type: 'material', subtype: 'produce' },
              { type: 'material', subtype: 'fodder' }, { type: 'material', subtype: 'fertiliser' }, { type: 'material', subtype: 'hive' },
              { type: 'material', subtype: 'wax' }, { type: 'material', subtype: 'liquid' }, { type: 'food', subtype: 'produce' },
              { type: 'food', subtype: 'dairy' }, { type: 'animal' }, { type: 'mount' }] },
    { name: 'Hide, Bone and Feather', description: 'What a hunt leaves once the meat is taken, and what the tanner makes of it.',
      match: [{ type: 'material', subtype: 'hide' }, { type: 'material', subtype: 'leather' }, { type: 'material', subtype: 'bones' },
              { type: 'material', subtype: 'feather' }, { type: 'material', subtype: 'cloth' }, { type: 'material', subtype: 'fiber' }] },
    { name: 'The Larder', description: 'Meat, stores and the kitchen\'s work, burnt pans included.',
      match: [{ type: 'food' }, { type: 'material', subtype: 'foodstuff' }] },
    { name: 'Tools of the Trades', description: 'The axes, knives, nets and racks every trade on the island is worked with.',
      match: [{ type: 'tool' }] },
    { name: 'Arms and Armour', description: 'What is worn against the weather and carried against the wild.',
      match: [{ type: 'armor' }, { type: 'ammo' }, { type: 'weapon' }] },
    { name: 'Curiosities', description: 'Keepsakes, oddments and the things nobody could put anywhere else.',
      match: [{ type: 'curio' }, { type: 'collectible' }, { type: 'material', subtype: 'trophy' }], catchAll: true },
];

export async function up(knex: Knex): Promise<void> {
    if (!await knex.schema.hasTable('museums')) {
        await knex.schema.createTable('museums', (t) => {
            t.increments('id').primary();
            t.string('key', 60).notNullable().unique();
            t.string('name', 100).notNullable();
            // locations.region: the island this museum is for.
            t.string('island', 100).notNullable().unique();
            t.integer('location_id').nullable().references('id').inTable('locations').onDelete('SET NULL');
            t.integer('display_order').notNullable().defaultTo(0);
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        });
    }
    if (!await knex.schema.hasTable('museum_exhibits')) {
        await knex.schema.createTable('museum_exhibits', (t) => {
            t.increments('id').primary();
            t.integer('museum_id').notNullable().references('id').inTable('museums').onDelete('CASCADE');
            t.string('name', 100).notNullable();
            t.text('description').nullable();
            t.integer('display_order').notNullable().defaultTo(0);
            t.jsonb('match').notNullable().defaultTo('[]');
            t.boolean('is_catch_all').notNullable().defaultTo(false);
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.unique(['museum_id', 'name']);
        });
    }
    if (!await knex.schema.hasTable('museum_cases')) {
        await knex.schema.createTable('museum_cases', (t) => {
            t.increments('id').primary();
            t.integer('exhibit_id').notNullable().references('id').inTable('museum_exhibits').onDelete('CASCADE');
            t.integer('item_id').notNullable().unique().references('id').inTable('items').onDelete('CASCADE');
            t.integer('display_order').notNullable().defaultTo(0);
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.index(['exhibit_id']);
        });
    }
    if (!await knex.schema.hasTable('museum_donations')) {
        await knex.schema.createTable('museum_donations', (t) => {
            t.increments('id').primary();
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.integer('case_id').notNullable().references('id').inTable('museum_cases').onDelete('CASCADE');
            t.timestamp('donated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.unique(['player_id', 'case_id']);
            t.index(['case_id']);
        });
    }

    // ── The Taiar Museum ──────────────────────────────────────────────────
    if (await knex('museums').where({ key: MUSEUM.key }).first()) return;
    const town = await knex('locations').where({ name: MUSEUM.town }).first();
    if (!town) {
        // A fresh database migrates before its content is imported, and the
        // import brings the museum with it. Anywhere else, no Talador is a
        // mistake worth stopping for.
        const [{ n }] = await knex('locations').count('* as n');
        if (Number(n) === 0) return;
        throw new Error(`museums: no location named "${MUSEUM.town}"`);
    }

    const [museum] = await knex('museums').insert({
        key: MUSEUM.key, name: MUSEUM.name, island: MUSEUM.island, location_id: town.id,
    }).returning('*');
    const exhibits = [];
    for (const [i, e] of EXHIBITS.entries()) {
        const [row] = await knex('museum_exhibits').insert({
            museum_id: museum.id, name: e.name, description: e.description, display_order: i,
            match: JSON.stringify(e.match), is_catch_all: !!e.catchAll,
        }).returning('*');
        exhibits.push(row);
    }

    // Every item Taiar yields today: active, priced (a price is derived from
    // the work that yields it, so an item with none has no way to be had, or
    // is a quest's alone), and not gold.
    const items = await knex('items')
        .where({ is_active: true }).where('value', '>', 0).whereNot({ name: 'Gold' })
        .orderBy([{ column: 'tier' }, { column: 'name' }])
        .select('id', 'type', 'subtype');
    const next = new Map<number, number>();
    const cases = [];
    for (const item of items) {
        const exhibitId = exhibitFor(item, exhibits);
        if (exhibitId === null) continue;
        const order = next.get(exhibitId) ?? 0;
        next.set(exhibitId, order + 1);
        cases.push({ exhibit_id: exhibitId, item_id: item.id, display_order: order });
    }
    if (cases.length) await knex.batchInsert('museum_cases', cases, 200);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('museum_donations');
    await knex.schema.dropTableIfExists('museum_cases');
    await knex.schema.dropTableIfExists('museum_exhibits');
    await knex.schema.dropTableIfExists('museums');
}
