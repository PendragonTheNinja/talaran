import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Combat, step 8: the special drops (docs/combat-spec.md §8, §13; approved by
// Nathan 2026-10-12).
//
//   Rare weapons  one per damage type, each in a different form and never of
//                 its dropper's weakness, as strong as the next tier's smithed
//                 weapon of its form, gated at the creature's level, 1,500
//                 uses then 0.2% (items.durability_* overrides).
//   Crabshell     six pieces dropped whole by the Dawncrest crabs, gated at the
//                 late Ambren pieces' Defense levels, ~99 armour for the set,
//                 600 uses then 0.4%.
//   Trophies      keepsakes, 1 in 750, the same shape as Hunting's.
//   Coins         people carry them: creatures.coin_* (Wreckers, Jumpers).
//   Veins         creatures.vein_*: a Knocker kill now and then opens a vein
//                 where it fell, as a Granite find would.
//
// Nobody makes a rare weapon or Crabshell, so only the pawnbroker buys them
// (services/marketplace.ts). Values come from `pnpm values:derive`, which
// prices a combat drop from its creature's XP per kill and its chance.

type NewItem = Record<string, unknown> & { name: string };

const RARE: NewItem[] = [
    { name: 'Hodag Horn', type: 'weapon', subtype: 'rare_weapon', slot: 'mainhand', tier: 1, level_required: 12,
      weapon_form: 'twohand', damage_type: 'pierce', aim: 148, power: 74, durability_uses: 1500, durability_break_pct: 0.2,
      description: "A single horn off a Hodag's brow, long as a spear and sharpened by the beast itself on every tree in the Grove." },
    { name: "Wrecker's Cutlass", type: 'weapon', subtype: 'rare_weapon', slot: 'mainhand', tier: 1, level_required: 6,
      weapon_form: 'onehand', damage_type: 'slash', aim: 138, power: 46, durability_uses: 1500, durability_break_pct: 0.2,
      description: 'A ship\'s blade, taken off a drowned man and kept bright since. The wrecker never told anyone which ship.' },
    { name: "Gouger's Legbone", type: 'weapon', subtype: 'rare_weapon', slot: 'mainhand', tier: 1, level_required: 6,
      weapon_form: 'twohand', damage_type: 'crush', aim: 128, power: 81, durability_uses: 1500, durability_break_pct: 0.2,
      description: 'The long leg of a Sidehill Gouger, the one it walked the downhill side on. Heavy at the knuckle end. Swung with both hands.' },
];

const SHELL = (name: string, slot: string, defense: number, armour: number, description: string): NewItem => ({
    name, type: 'armor', subtype: 'shell_armor', slot, tier: 1, level_required: defense, armour,
    durability_uses: 600, durability_break_pct: 0.4, description,
});

const CRABSHELL: NewItem[] = [
    SHELL('Crabshell Gauntlets', 'hands', 7, 11, 'Claw plates off a Shore Crab, laced over the back of the hand. Lighter than iron and harder than it looks.'),
    SHELL('Crabshell Sabatons', 'feet', 8, 11, "Two halves of a crab's back, shaped to the foot. They clack on stone."),
    SHELL('Crabshell Helm', 'head', 9, 15, 'A whole carapace, scraped out and lined with leather. It still smells of the tide.'),
    SHELL('Crabshell Shield', 'offhand', 10, 19, "A plate off Ol' Shellback's back, barnacles and all. Blows skate off it."),
    SHELL('Crabshell Greaves', 'legs', 11, 19, "Leg plates cut from the old crab's shell, strapped over shin and knee."),
    SHELL('Crabshell Cuirass', 'chest', 12, 24, "The great crab's breastplate, near a hand thick. Whatever grew this lived a long time."),
];

const TROPHY = (name: string, description: string): NewItem => ({
    name, type: 'material', subtype: 'trophy', slot: null, tier: 1, level_required: 1, description,
});

const TROPHIES: NewItem[] = [
    TROPHY('Jackalope Antler', "One tine of a jackalope's crown. People who have never seen one will tell you they are made up."),
    TROPHY('Wolf Fang', 'A long yellow fang from a grey wolf. Hunters wear them on a cord, and so do people who want to be taken for hunters.'),
    TROPHY("Wrecker's Lantern", 'A shuttered lantern with a red glass. Hung on the rocks at night, it looked like the harbour light.'),
    TROPHY("Knocker's Hammer", 'A hammer the size of your thumb, its head of old black iron. The miners say to leave it where you found it. You did not.'),
    TROPHY('Agropelter Knuckle', "A knobbed joint off an agropelter's long arm, hard as a burl."),
];

// [creature key, item, 1 in N]
const DROPS: [string, string, number][] = [
    ['hodag', 'Hodag Horn', 2000],
    ['wrecker', "Wrecker's Cutlass", 1500],
    ['sidehill_gouger', "Gouger's Legbone", 1500],
    ['shore_crab', 'Crabshell Gauntlets', 100],
    ['shore_crab', 'Crabshell Sabatons', 100],
    ['shore_crab', 'Crabshell Helm', 100],
    ['ol_shellback', 'Crabshell Shield', 100],
    ['ol_shellback', 'Crabshell Greaves', 100],
    ['ol_shellback', 'Crabshell Cuirass', 100],
    ['jackalope', 'Jackalope Antler', 750],
    ['grey_wolf', 'Wolf Fang', 750],
    ['wrecker', "Wrecker's Lantern", 750],
    ['knocker', "Knocker's Hammer", 750],
    ['agropelter', 'Agropelter Knuckle', 750],
];

// People carry coins: [creature key, 1 in N kills, min, max]
const COINS: [string, number, number, number][] = [
    ['wrecker', 4, 3, 12],
    ['jumper', 4, 5, 15],
];

// Knockers knock where the ore runs rich: [creature key, 1 in N kills, ore, min, max]
const VEINS: [string, number, string, number, number][] = [
    ['knocker', 150, 'Burgh Ore', 50, 100],
];

export async function up(knex: Knex): Promise<void> {
    for (const [name, add] of [
        ['coin_chance_one_in', (t: Knex.AlterTableBuilder) => { t.integer('coin_chance_one_in').nullable(); }],
        ['coin_min', (t: Knex.AlterTableBuilder) => { t.integer('coin_min').nullable(); }],
        ['coin_max', (t: Knex.AlterTableBuilder) => { t.integer('coin_max').nullable(); }],
        ['vein_chance_one_in', (t: Knex.AlterTableBuilder) => { t.integer('vein_chance_one_in').nullable(); }],
        ['vein_ore_name', (t: Knex.AlterTableBuilder) => { t.string('vein_ore_name', 100).nullable(); }],
        ['vein_min', (t: Knex.AlterTableBuilder) => { t.integer('vein_min').nullable(); }],
        ['vein_max', (t: Knex.AlterTableBuilder) => { t.integer('vein_max').nullable(); }],
    ] as const) {
        if (!(await knex.schema.hasColumn('creatures', name))) await knex.schema.alterTable('creatures', add);
    }

    // A fresh database before content:import (lib/migrationContent.ts): schema only.
    if (!(await hasContent(knex))) return;

    for (const item of [...RARE, ...CRABSHELL, ...TROPHIES]) {
        const existing = await knex('items').where({ name: item.name }).first();
        if (existing) await knex('items').where({ id: existing.id }).update(item);
        else await knex('items').insert(item);
    }

    const creatureId = async (key: string) => {
        const c = await knex('creatures').where({ key }).first();
        if (!c) throw new Error(`combat_special_drops: creature ${key} not found`);
        return c.id;
    };

    for (const [key, itemName, oneIn] of DROPS) {
        await creatureId(key);
        const item = await knex('items').where({ name: itemName }).first();
        if (!item) throw new Error(`combat_special_drops: item ${itemName} not found`);
        const sourceKey = `combat:${key}`;
        const row = { source_key: sourceKey, item_id: item.id, chance_one_in: oneIn, min_qty: 1, max_qty: 1, is_active: true };
        const existing = await knex('drop_table_entries').where({ source_key: sourceKey, item_id: item.id }).first();
        if (existing) await knex('drop_table_entries').where({ id: existing.id }).update({ ...row, updated_at: knex.fn.now() });
        else await knex('drop_table_entries').insert(row);
    }

    for (const [key, oneIn, min, max] of COINS) {
        await knex('creatures').where({ id: await creatureId(key) }).update({ coin_chance_one_in: oneIn, coin_min: min, coin_max: max });
    }
    for (const [key, oneIn, ore, min, max] of VEINS) {
        if (!(await knex('items').where({ name: ore }).first())) throw new Error(`combat_special_drops: ore ${ore} not found`);
        await knex('creatures').where({ id: await creatureId(key) })
            .update({ vein_chance_one_in: oneIn, vein_ore_name: ore, vein_min: min, vein_max: max });
    }
}

export async function down(knex: Knex): Promise<void> {
    const names = [...RARE, ...CRABSHELL, ...TROPHIES].map(i => i.name);
    const ids = (await knex('items').whereIn('name', names).select('id')).map((r: { id: number }) => r.id);
    if (ids.length) await knex('drop_table_entries').where('source_key', 'like', 'combat:%').whereIn('item_id', ids).delete();
    // The items stay, as with every content migration: players may hold them.
    for (const name of ['vein_max', 'vein_min', 'vein_ore_name', 'vein_chance_one_in', 'coin_max', 'coin_min', 'coin_chance_one_in']) {
        if (await knex.schema.hasColumn('creatures', name)) await knex.schema.alterTable('creatures', t => { t.dropColumn(name); });
    }
}
