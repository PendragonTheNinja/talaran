import type { Knex } from 'knex';

// Combat, step 3 (docs/combat-spec.md §8, docs/combat-build-plan.md).
//
// Creatures and the places to fight them, as rows.
//
//   creatures                level, profile (multipliers on the level's grunt,
//                            null = baseline), stance per damage type, XP
//   fighting_spots           a place to fight at a location: 'drawn' (the next
//                            creature is drawn by weight) or 'chosen' (the
//                            player picks one)
//   fighting_spot_creatures  which creatures a spot holds, with draw weights.
//                            A creature can live in several spots (the Jumper).
//
// XP per kill is DERIVED (`pnpm combat:derive`, scripts/deriveCreatureXp.ts):
// the numbers below are what it gave on 2026-10-10, written out so this
// migration never changes under a later formula change. Re-run the script after
// changing a level, a multiplier or the formulas.
//
// Profiles and stances are the roster as decided with Nathan 2026-10-05
// (combatSim.ts TAIAR, `combatSim.ts roster` checks them against the ±15% XP
// guardrail).
//
// Loot goes on drop_table_entries under 'combat:<creature>' for every spot, and
// 'combat:<creature>@<spot>' for drops that depend on where it was killed
// (Jumpers carry their own mine's ore). Only drops of items that already exist
// are seeded here; the trophies, rare weapons, the Crabshell set, Knocker veins
// and Wrecker coins come with their own items in step 8.

type Stance = 'weak' | 'neutral' | 'resistant';
const W: Stance = 'weak';
const N: Stance = 'neutral';
const X: Stance = 'resistant';

type Creature = {
    key: string; name: string; level: number; xp: number;
    accuracy?: number; defence?: number; power?: number; hp?: number; swing?: number;
    pierce: Stance; slash: Stance; crush: Stance;
    description: string;
};

const CREATURES: Creature[] = [
    { key: 'dock_rat', name: 'Dock Rat', level: 1, xp: 26,
      pierce: N, slash: W, crush: N,
      description: 'Came ashore with a cargo of something warm and never went back aboard. Bold as a gull and about as polite.' },
    { key: 'granary_rat', name: 'Granary Rat', level: 2, xp: 27, hp: 1.1, power: 0.9, accuracy: 0.9, swing: 3.6,
      pierce: X, slash: W, crush: N,
      description: "Fat on Novita's barley and slow with it. It will fight for its hoard, but it would much rather sit on it." },
    { key: 'jackalope', name: 'Jackalope', level: 3, xp: 28, hp: 0.85, defence: 1.1, accuracy: 1.05, power: 0.85, swing: 2.4,
      pierce: N, slash: W, crush: X,
      description: "A hare with a little stag's crown. Quick across the stubble, and never quite where the blow comes down." },
    { key: 'feral_dog', name: 'Feral Dog', level: 4, xp: 29, accuracy: 1.1, power: 0.85, hp: 0.9, swing: 2.4,
      pierce: W, slash: N, crush: N,
      description: "Somebody's sheepdog, once. Now it runs with three others and takes a lamb a week." },
    { key: 'shore_crab', name: 'Shore Crab', level: 5, xp: 30, defence: 1.1, hp: 1.15, power: 0.85, swing: 3.6,
      pierce: N, slash: X, crush: W,
      description: 'Broad as a buckler, with a shell that turns a blade. It sidles, it pinches, and it does not hurry.' },
    { key: 'wrecker', name: 'Wrecker', level: 6, xp: 32, power: 1.1, accuracy: 0.95,
      pierce: W, slash: N, crush: N,
      description: 'Hangs a lantern on the rocks on a black night and waits for a ship to steer by it. Carries a cudgel and whatever the sea gave up last.' },
    { key: 'sidehill_gouger', name: 'Sidehill Gouger', level: 6, xp: 32, accuracy: 0.85, power: 1.3, hp: 1.1,
      pierce: W, slash: N, crush: X,
      description: 'Its legs are shorter on one side from a lifetime of circling the same hill. Clumsy on the flat. It hits like a runaway cart.' },
    { key: 'jumper', name: 'Jumper', level: 8, xp: 34, defence: 1.1, hp: 1.15, power: 0.9, swing: 3.6,
      pierce: N, slash: X, crush: W,
      description: "A claim-jumper in a mail shirt, squatting on another man's vein. Slow, stubborn and hard to hurt. His pockets are full of other people's ore." },
    { key: 'grey_wolf', name: 'Grey Wolf', level: 8, xp: 34, accuracy: 1.15, power: 0.8, hp: 0.9, swing: 2.4,
      pierce: N, slash: W, crush: X,
      description: 'Thick grey fur and patient yellow eyes. Where there is one, the rest are close by in the trees.' },
    { key: 'ol_shellback', name: "Ol' Shellback", level: 9, xp: 35, defence: 1.1, hp: 1.12, power: 1.0, accuracy: 0.9, swing: 3.6,
      pierce: N, slash: X, crush: W,
      description: 'The old crab of Dawncrest, crusted with barnacles and weed. The fishermen say it was big when their grandfathers were boys.' },
    { key: 'knocker', name: 'Knocker', level: 9, xp: 35, defence: 1.15, accuracy: 1.1, hp: 0.8, power: 0.85, swing: 2.4,
      pierce: X, slash: N, crush: W,
      description: 'Small as a child and grey as the rock. Miners hear it tapping in the walls, and some swear it knocks where the ore runs rich.' },
    { key: 'agropelter', name: 'Agropelter', level: 10, xp: 37, accuracy: 1.15, hp: 0.85, power: 0.95,
      pierce: W, slash: N, crush: N,
      description: 'Lives in the hollow of a dead tree and throws branches at anyone underneath. Eld Grove woodcutters wear their hats thick.' },
    { key: 'hodag', name: 'Hodag', level: 12, xp: 40, power: 1.25, hp: 1.2, accuracy: 0.9, swing: 3.6,
      pierce: N, slash: X, crush: W,
      description: 'Horns on its head, spines down its back and a grin full of teeth. The old woodcutters will not say its name after dark.' },
];

type Spot = {
    key: string; location: string; name: string; kind: 'drawn' | 'chosen'; order: number;
    description: string;
    creatures: [string, number][];   // [creature key, weight]; a chosen spot's weights only order the list
};

const SPOTS: Spot[] = [
    { key: 'talador_docks', location: 'Talador', name: 'The Docks', kind: 'drawn', order: 1,
      description: 'Warehouses along the quay, where the ships unload and the rats come ashore with the cargo.',
      creatures: [['dock_rat', 1]] },
    { key: 'novita_yards', location: 'Novita', name: 'The Stackyards', kind: 'drawn', order: 1,
      description: 'Barns, ricks and the stubble round them. Rats in the grain, jackalopes in the fields, dogs after the flocks.',
      creatures: [['granary_rat', 45], ['jackalope', 35], ['feral_dog', 20]] },
    { key: 'dawncrest_rocks', location: 'Dawncrest', name: 'The Wrecking Rocks', kind: 'chosen', order: 1,
      description: 'Black rocks under the cliff. Crabs feed in the shallows, and the wreckers wait above them for a ship.',
      creatures: [['shore_crab', 3], ['ol_shellback', 2], ['wrecker', 1]] },
    { key: 'origrund_spoil', location: 'Origrund', name: 'The Spoil Heaps', kind: 'drawn', order: 1,
      description: 'Waste rock tipped down the hillside from the workings. Gougers graze the slope and jumpers watch the ore carts.',
      creatures: [['sidehill_gouger', 60], ['jumper', 40]] },
    { key: 'grundagr_workings', location: 'Grundagr', name: 'The Old Workings', kind: 'drawn', order: 1,
      description: 'Galleries the miners gave up long ago. Jumpers squat in the dry ones. Something knocks in the deep ones.',
      creatures: [['jumper', 70], ['knocker', 30]] },
    { key: 'eld_grove_deep', location: 'Eld Grove', name: 'The Deep Wood', kind: 'drawn', order: 1,
      description: 'Past the last felling, where the trees are old and the light comes down green. Wolves run here, and worse.',
      creatures: [['grey_wolf', 50], ['agropelter', 35], ['hodag', 15]] },
];

// [source key, item, 1 in N, min, max]
const DROPS: [string, string, number, number, number][] = [
    // Its hoard.
    ['combat:granary_rat', 'Grain', 5, 1, 3],
    ['combat:granary_rat', 'Wild Grain', 8, 1, 2],
    // From the sea and the ships it wrecks. Linen is sailcloth: about 2 an
    // hour farming Wreckers, against Foraging's flax as the main source.
    ['combat:wrecker', 'Locked Rusty Chest', 40, 1, 1],
    ['combat:wrecker', 'Ambren Tinderbox', 60, 1, 1],
    ['combat:wrecker', 'Linen Cloth', 25, 1, 1],
    ['combat:wrecker', 'Amber', 150, 1, 1],
    // Raided from the smelters, and the ore of whichever mine he squats in.
    ['combat:jumper', 'Charc', 8, 1, 2],
    ['combat:jumper@origrund_spoil', 'Ambren Ore', 6, 2, 4],
    ['combat:jumper@grundagr_workings', 'Burgh Ore', 6, 2, 4],
    // Knocks where the ore runs rich.
    ['combat:knocker', 'Dense Burgh Ore', 100, 1, 1],
    // The branches it throws, and the owls it eats. Feathers stay well under
    // a pheasant snare's 12 to 20 a catch.
    ['combat:agropelter', 'Poor Lanai Log', 5, 1, 3],
    ['combat:agropelter', 'Feathers', 20, 1, 2],
];

export async function up(knex: Knex): Promise<void> {
    const itemIds = new Map<string, number>();
    for (const name of new Set(DROPS.map(d => d[1]))) {
        const item = await knex('items').where({ name }).first();
        if (!item) throw new Error(`taiar_creatures: drop item ${name} not found`);
        itemIds.set(name, item.id);
    }
    const locationIds = new Map<string, number>();
    for (const name of new Set(SPOTS.map(s => s.location))) {
        const location = await knex('locations').where({ name }).first();
        if (!location) throw new Error(`taiar_creatures: location ${name} not found`);
        locationIds.set(name, location.id);
    }

    if (!(await knex.schema.hasTable('creatures'))) {
        await knex.schema.createTable('creatures', t => {
            t.increments('id').primary();
            t.string('key', 50).notNullable().unique();
            t.string('name', 100).notNullable().unique();
            t.integer('level').notNullable();
            // Profile: multipliers on the level's baseline grunt (lib/combatMath.ts
            // CreatureProfile). Null is the baseline.
            t.double('accuracy').nullable();
            t.double('defence').nullable();
            t.double('power').nullable();
            t.double('hp').nullable();
            t.double('swing_seconds').nullable();
            t.string('stance_pierce', 10).notNullable().defaultTo('neutral');
            t.string('stance_slash', 10).notNullable().defaultTo('neutral');
            t.string('stance_crush', 10).notNullable().defaultTo('neutral');
            // XP per kill = the level's derived rate x this (pnpm combat:derive).
            t.double('xp_multiplier').notNullable().defaultTo(1);
            t.integer('xp_per_kill').notNullable();
            t.text('description').nullable();
            t.boolean('is_active').notNullable().defaultTo(true);
        });
        await knex.raw(`ALTER TABLE creatures ADD CONSTRAINT creatures_stances_valid CHECK (
            stance_pierce IN ('weak','neutral','resistant') AND stance_slash IN ('weak','neutral','resistant')
            AND stance_crush IN ('weak','neutral','resistant'))`);
        await knex.raw('ALTER TABLE creatures ADD CONSTRAINT creatures_level_positive CHECK (level >= 1)');
    }

    if (!(await knex.schema.hasTable('fighting_spots'))) {
        await knex.schema.createTable('fighting_spots', t => {
            t.increments('id').primary();
            t.string('key', 50).notNullable().unique();
            t.integer('location_id').unsigned().notNullable()
                .references('id').inTable('locations').onDelete('CASCADE');
            t.string('name', 100).notNullable();
            t.string('kind', 10).notNullable().defaultTo('drawn');
            t.text('description').nullable();
            t.integer('display_order').notNullable().defaultTo(0);
            t.boolean('is_active').notNullable().defaultTo(true);
            t.index(['location_id']);
        });
        await knex.raw(`ALTER TABLE fighting_spots ADD CONSTRAINT fighting_spots_kind_valid CHECK (kind IN ('drawn','chosen'))`);
    }

    if (!(await knex.schema.hasTable('fighting_spot_creatures'))) {
        await knex.schema.createTable('fighting_spot_creatures', t => {
            t.increments('id').primary();
            t.integer('spot_id').unsigned().notNullable()
                .references('id').inTable('fighting_spots').onDelete('CASCADE');
            t.integer('creature_id').unsigned().notNullable()
                .references('id').inTable('creatures').onDelete('CASCADE');
            t.integer('weight').notNullable().defaultTo(1);
            t.unique(['spot_id', 'creature_id']);
        });
        await knex.raw('ALTER TABLE fighting_spot_creatures ADD CONSTRAINT fighting_spot_creatures_weight_positive CHECK (weight > 0)');
    }

    const creatureIds = new Map<string, number>();
    for (const c of CREATURES) {
        const row = {
            key: c.key, name: c.name, level: c.level, xp_per_kill: c.xp,
            accuracy: c.accuracy ?? null, defence: c.defence ?? null, power: c.power ?? null,
            hp: c.hp ?? null, swing_seconds: c.swing ?? null,
            stance_pierce: c.pierce, stance_slash: c.slash, stance_crush: c.crush,
            description: c.description,
        };
        const existing = await knex('creatures').where({ key: c.key }).first();
        if (existing) await knex('creatures').where({ id: existing.id }).update(row);
        else await knex('creatures').insert(row);
        creatureIds.set(c.key, (await knex('creatures').where({ key: c.key }).first()).id);
    }

    for (const s of SPOTS) {
        const row = {
            key: s.key, location_id: locationIds.get(s.location), name: s.name, kind: s.kind,
            description: s.description, display_order: s.order,
        };
        const existing = await knex('fighting_spots').where({ key: s.key }).first();
        if (existing) await knex('fighting_spots').where({ id: existing.id }).update(row);
        else await knex('fighting_spots').insert(row);
        const spotId = (await knex('fighting_spots').where({ key: s.key }).first()).id;
        for (const [creatureKey, weight] of s.creatures) {
            const creatureId = creatureIds.get(creatureKey);
            if (!creatureId) throw new Error(`taiar_creatures: spot ${s.key} names unknown creature ${creatureKey}`);
            await knex('fighting_spot_creatures')
                .insert({ spot_id: spotId, creature_id: creatureId, weight })
                .onConflict(['spot_id', 'creature_id']).merge();
        }
    }

    for (const [sourceKey, itemName, oneIn, min, max] of DROPS) {
        const row = { source_key: sourceKey, item_id: itemIds.get(itemName), chance_one_in: oneIn, min_qty: min, max_qty: max, is_active: true };
        const existing = await knex('drop_table_entries').where({ source_key: sourceKey, item_id: row.item_id }).first();
        if (existing) await knex('drop_table_entries').where({ id: existing.id }).update({ ...row, updated_at: knex.fn.now() });
        else await knex('drop_table_entries').insert(row);
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex('drop_table_entries').where('source_key', 'like', 'combat:%').delete();
    await knex.schema.dropTableIfExists('fighting_spot_creatures');
    await knex.schema.dropTableIfExists('fighting_spots');
    await knex.schema.dropTableIfExists('creatures');
}
