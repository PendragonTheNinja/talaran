import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Opening things (Nathan, 2026-11-12). Bird Nests and River Mussels were
// shipped as containers that could not be opened yet (20260808170000: "they
// open when the container system lands"). This is that system.
//
//   container_types   one row per item that can be opened: the skill its XP
//                     goes to, how long one takes, the XP, coins it may hold,
//                     and what an empty one says. What is inside is ordinary
//                     drop_table_entries rows under 'open:<item name>', rolled
//                     by rollSecondaryDrops, so contents are tuned like any
//                     other drop. services/containers.ts opens them, one at a
//                     time through the stack ('container_open' in the tick).
//
// Also: any recipe may now hold finds, rows under 'recipe:<recipe name>',
// rolled once a craft succeeds (services/recipes.ts). Mussel Chowder's pearl
// is the first.
//
// XP: 10 s at the band of level 1 (2,200 an hour) at x1.3, the ore rate (not
// common items, so a little above the rate: Nathan), so 8. Nests pay
// Woodcutting, where they come from; mussels pay Cooking (Nathan).
//
// Nest contents (Nathan, 2026-11-12): seeds about 30% (three at 1 in 10),
// coins 1 in 20, 1 to 3 Feathers 1 in 10, an Egg 1 in 30, Rough Quartz 1 in
// 50, a Chick 1 in 100, and a Magpie's Ring 1 in 2,000. Feathers break the
// "feathers stay in pheasants and chickens" rule on purpose, at a trickle:
// about one nest in ten at two nests an hour of chopping.
// Mussels: a Freshwater Pearl 1 in 30, and 1 in 30 a chowder.

const RING = {
    name: "Magpie's Ring", type: 'curio', subtype: 'trinket', tier: 1, level_required: 1,
    description: 'A thin band gone dark with years, pulled out of a nest of twigs and string. Somebody lost it. A magpie found it first.',
};

const CONTAINERS = [
    {
        item: 'Bird Nest', key: 'bird_nest', skill: 'Woodcutting', timer_seconds: 10, xp: 8,
        coin_one_in: 20, coin_min: 5, coin_max: 15,
        empty_text: 'Twigs, moss and a little down. Nothing else.',
    },
    {
        item: 'River Mussel', key: 'river_mussel', skill: 'Cooking', timer_seconds: 10, xp: 8,
        coin_one_in: null, coin_min: null, coin_max: null,
        empty_text: 'Grit and a little shell. No pearl in this one.',
    },
];

const FINDS: { source: string; item: string; one_in: number; min: number; max: number }[] = [
    { source: 'open:Bird Nest', item: 'Flax Seeds', one_in: 10, min: 1, max: 2 },
    { source: 'open:Bird Nest', item: 'Pea Seeds', one_in: 10, min: 1, max: 2 },
    { source: 'open:Bird Nest', item: 'Wild Grain', one_in: 10, min: 1, max: 2 },
    { source: 'open:Bird Nest', item: 'Feathers', one_in: 10, min: 1, max: 3 },
    { source: 'open:Bird Nest', item: 'Egg', one_in: 30, min: 1, max: 1 },
    { source: 'open:Bird Nest', item: 'Rough Quartz', one_in: 50, min: 1, max: 1 },
    { source: 'open:Bird Nest', item: 'Chick', one_in: 100, min: 1, max: 1 },
    { source: 'open:Bird Nest', item: RING.name, one_in: 2000, min: 1, max: 1 },
    { source: 'open:River Mussel', item: 'Freshwater Pearl', one_in: 30, min: 1, max: 1 },
    { source: 'recipe:Mussel Chowder', item: 'Freshwater Pearl', one_in: 30, min: 1, max: 1 },
];

const PRESENTATION = [
    { action_type: 'container_open', kind: null, scene_text: 'You work it open and see what is inside.', cancel_label: 'Stop Opening' },
    { action_type: 'container_open', kind: 'bird_nest', scene_text: 'You pick the nest apart, twig by twig.', cancel_label: 'Stop Opening' },
    { action_type: 'container_open', kind: 'river_mussel', scene_text: 'You work a blade into the seam of the shell.', cancel_label: 'Stop Opening' },
];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('container_types'))) {
        await knex.schema.createTable('container_types', (t) => {
            t.increments('id').primary();
            t.integer('item_id').notNullable().unique().references('id').inTable('items').onDelete('CASCADE');
            t.string('key', 60).notNullable().unique();
            t.string('skill', 60).notNullable();
            t.integer('timer_seconds').notNullable();
            t.integer('xp').notNullable();
            t.integer('coin_one_in').nullable();
            t.integer('coin_min').nullable();
            t.integer('coin_max').nullable();
            t.text('empty_text').nullable();
            t.boolean('is_active').notNullable().defaultTo(true);
            t.timestamps(true, true);
        });
    }
    if (!(await hasContent(knex))) return;

    const ring = await knex('items').where({ name: RING.name }).first('id');
    if (ring) await knex('items').where({ id: ring.id }).update(RING);
    else await knex('items').insert({ ...RING, is_active: true });

    for (const c of CONTAINERS) {
        const item = await knex('items').where({ name: c.item }).first('id');
        if (!item) throw new Error(`containers: item ${c.item} not found`);
        const { item: _name, ...row } = c;
        const existing = await knex('container_types').where({ key: c.key }).first('id');
        if (existing) await knex('container_types').where({ id: existing.id }).update({ ...row, item_id: item.id });
        else await knex('container_types').insert({ ...row, item_id: item.id });
    }

    for (const f of FINDS) {
        const item = await knex('items').where({ name: f.item }).first('id');
        if (!item) throw new Error(`containers: item ${f.item} not found`);
        const row = { source_key: f.source, item_id: item.id, chance_one_in: f.one_in, chance_percent: null, min_qty: f.min, max_qty: f.max, is_active: true };
        const existing = await knex('drop_table_entries').where({ source_key: f.source, item_id: item.id }).first('id');
        if (existing) await knex('drop_table_entries').where({ id: existing.id }).update(row);
        else await knex('drop_table_entries').insert(row);
    }

    for (const p of PRESENTATION) {
        const existing = await knex('action_presentation').where({ action_type: p.action_type, kind: p.kind }).first('id');
        if (existing) await knex('action_presentation').where({ id: existing.id }).update(p);
        else await knex('action_presentation').insert(p);
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable('action_presentation')) await knex('action_presentation').where({ action_type: 'container_open' }).delete();
    if (await knex.schema.hasTable('drop_table_entries')) {
        await knex('drop_table_entries').where('source_key', 'like', 'open:%').delete();
        await knex('drop_table_entries').where({ source_key: 'recipe:Mussel Chowder' }).delete();
    }
    await knex.schema.dropTableIfExists('container_types');
    // The ring stays if anyone holds one; otherwise it goes.
    const ring = await knex('items').where({ name: RING.name }).first('id');
    if (ring && !(await knex('player_inventory').where({ item_id: ring.id }).first())) {
        await knex('items').where({ id: ring.id }).delete();
    }
}
