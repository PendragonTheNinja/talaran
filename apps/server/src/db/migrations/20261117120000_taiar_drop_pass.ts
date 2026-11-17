import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Taiar's drop pass (docs/antura-plan.md §10; Nathan, 2026-11-17). Combat paid
// too little: most creatures' commonest drop was 1 in 10 to 1 in 25, and the
// crabs gave nothing but a whole armour piece at 1 in 300. Every creature now
// has a frequent drop of its own, about one kill in four, that is not food
// and has a use; seeds, fuel, ore, and chests come oftener; three trophies
// that now go into crafts come at 1 in 300, the rate hunting's trophies run at.
//
//   New drops    Ratskin (both rats) and Jackalope Pelt, for the ratskin set
//                and the Knuckle Ring and Jackalope Charm; Crabshell Plate
//                (Shore Crab) and Shellback Plate (Ol' Shellback), from which
//                the Crabshell pieces are now made (20261117130000); Granite
//                and the odd Granite Block from the Knocker; Onion Seeds from
//                the Feral Dog, Pea Seeds from the Gouger, Strawberry Runners
//                from the Hodag.
//   Removed      the Dock Rat's Bones (Bones stay Hunting's), and the six
//                whole Crabshell pieces, which are crafted from plates now.
//   Changed      the rates in CHANGED below, each with its old rate for down().
//
// Plates per piece are set so a crab's three pieces take about as long as the
// drops did: three pieces at 1 in 300 each, rolled together, are about 550
// kills; 135 plates at 1 in 4 are 540.
//
// values:derive prices the four new materials from the kill, as it does the
// Wolf Pelt (COMBAT_ONLY_ITEMS); run `pnpm values:derive -- --write` after.
// Items stay on down(), as with every content migration: players may hold them.

type NewItem = Record<string, unknown> & { name: string };

const MATERIAL = (name: string, subtype: string, description: string): NewItem => ({
    name, type: 'material', subtype, tier: 1, level_required: 1, description,
});

const ITEMS: NewItem[] = [
    MATERIAL('Ratskin', 'hide', 'A rat\'s hide, scraped and dried flat. Thin, and no bigger than a hand, but there is never any shortage of rats.'),
    MATERIAL('Jackalope Pelt', 'hide', 'Soft grey fur off a jackalope, finer than any rabbit\'s. The people who say there are no jackalopes have never had to skin one.'),
    MATERIAL('Crabshell Plate', 'shell', 'A curved plate of Shore Crab shell, prised loose at the seam. Hard as fired clay and half the weight.'),
    MATERIAL('Shellback Plate', 'shell', "A thick slab off Ol' Shellback's back, ridged and pale with old barnacle scars. It takes both hands to lift."),
];

// [source key, item, 1 in N, min, max]
const ADDED: [string, string, number, number, number][] = [
    ['combat:dock_rat', 'Ratskin', 4, 1, 1],
    ['combat:granary_rat', 'Ratskin', 4, 1, 1],
    ['combat:jackalope', 'Jackalope Pelt', 4, 1, 1],
    ['combat:feral_dog', 'Onion Seeds', 15, 1, 1],
    ['combat:shore_crab', 'Crabshell Plate', 4, 1, 1],
    ['combat:sidehill_gouger', 'Pea Seeds', 20, 1, 1],
    ['combat:ol_shellback', 'Shellback Plate', 4, 1, 1],
    ['combat:knocker', 'Granite', 4, 1, 2],
    ['combat:knocker', 'Granite Block', 40, 1, 1],
    ['combat:hodag', 'Strawberry Runner', 15, 1, 1],
];

// [source key, item, old 1 in N, new 1 in N, new min, new max]; old min and
// max are kept in OLD_QTY where they change.
const CHANGED: [string, string, number, number, number, number][] = [
    ['combat:granary_rat', 'Carrot Seeds', 20, 12, 1, 1],
    ['combat:jackalope', 'Turnip Seeds', 20, 12, 1, 1],
    ['combat:jackalope', 'Jackalope Antler', 750, 300, 1, 1],
    ['combat:feral_dog', 'Garlic Cloves', 25, 8, 1, 1],
    ['combat:wrecker', 'Locked Rusty Chest', 55, 30, 1, 1],
    ['combat:sidehill_gouger', 'Wild Grain', 25, 8, 1, 2],
    ['combat:jumper', 'Charc', 10, 6, 1, 2],
    ['combat:jumper@grundagr_workings', 'Burgh Ore', 20, 10, 2, 4],
    ['combat:jumper@origrund_spoil', 'Ambren Ore', 20, 10, 2, 4],
    ['combat:grey_wolf', 'Wolf Pelt', 12, 8, 1, 1],
    ['combat:grey_wolf', 'Wolf Fang', 750, 300, 1, 1],
    ['combat:agropelter', 'Feathers', 20, 10, 1, 2],
    ['combat:agropelter', 'Agropelter Knuckle', 750, 300, 1, 1],
    ['combat:hodag', 'Raspberry Cane', 100, 12, 1, 1],
];
const OLD_QTY: Record<string, [number, number]> = { 'combat:sidehill_gouger|Wild Grain': [1, 1] };

// [source key, item, 1 in N, min, max] as they were, for down().
const REMOVED: [string, string, number, number, number][] = [
    ['combat:dock_rat', 'Bones', 5, 1, 1],
    ['combat:shore_crab', 'Crabshell Gauntlets', 300, 1, 1],
    ['combat:shore_crab', 'Crabshell Sabatons', 300, 1, 1],
    ['combat:shore_crab', 'Crabshell Helm', 300, 1, 1],
    ['combat:ol_shellback', 'Crabshell Shield', 300, 1, 1],
    ['combat:ol_shellback', 'Crabshell Greaves', 300, 1, 1],
    ['combat:ol_shellback', 'Crabshell Cuirass', 300, 1, 1],
];

async function itemId(knex: Knex, name: string): Promise<number> {
    const row = await knex('items').where({ name }).first('id');
    if (!row) throw new Error(`taiar_drop_pass: item "${name}" not found`);
    return row.id;
}

async function checkCreature(knex: Knex, sourceKey: string): Promise<void> {
    const key = sourceKey.slice('combat:'.length).split('@')[0];
    if (!(await knex('creatures').where({ key }).first('id'))) throw new Error(`taiar_drop_pass: creature "${key}" not found`);
}

async function upsertDrop(knex: Knex, sourceKey: string, name: string, oneIn: number, min: number, max: number): Promise<void> {
    await checkCreature(knex, sourceKey);
    const id = await itemId(knex, name);
    const row = { source_key: sourceKey, item_id: id, chance_one_in: oneIn, chance_percent: null, min_qty: min, max_qty: max, is_active: true };
    const existing = await knex('drop_table_entries').where({ source_key: sourceKey, item_id: id }).first('id');
    if (existing) await knex('drop_table_entries').where({ id: existing.id }).update({ ...row, updated_at: knex.fn.now() });
    else await knex('drop_table_entries').insert(row);
}

async function changeDrop(knex: Knex, sourceKey: string, name: string, oneIn: number, min: number, max: number): Promise<void> {
    await checkCreature(knex, sourceKey);
    const id = await itemId(knex, name);
    const changed = await knex('drop_table_entries').where({ source_key: sourceKey, item_id: id })
        .update({ chance_one_in: oneIn, min_qty: min, max_qty: max, updated_at: knex.fn.now() });
    if (changed !== 1) throw new Error(`taiar_drop_pass: expected one ${sourceKey} row for "${name}", found ${changed}`);
}

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;

    for (const item of ITEMS) {
        const existing = await knex('items').where({ name: item.name }).first('id');
        if (existing) await knex('items').where({ id: existing.id }).update(item);
        else await knex('items').insert({ ...item, is_active: true });
    }
    for (const [key, name, oneIn, min, max] of ADDED) await upsertDrop(knex, key, name, oneIn, min, max);
    for (const [key, name, , oneIn, min, max] of CHANGED) await changeDrop(knex, key, name, oneIn, min, max);
    for (const [key, name] of REMOVED) {
        await checkCreature(knex, key);
        await knex('drop_table_entries').where({ source_key: key, item_id: await itemId(knex, name) }).delete();
    }
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;

    for (const [key, name, oneIn, min, max] of REMOVED) await upsertDrop(knex, key, name, oneIn, min, max);
    for (const [key, name, oldOneIn, , min, max] of CHANGED) {
        const [oldMin, oldMax] = OLD_QTY[`${key}|${name}`] ?? [min, max];
        await changeDrop(knex, key, name, oldOneIn, oldMin, oldMax);
    }
    for (const [key, name] of ADDED) {
        await knex('drop_table_entries').where({ source_key: key, item_id: await itemId(knex, name) }).delete();
    }
}
