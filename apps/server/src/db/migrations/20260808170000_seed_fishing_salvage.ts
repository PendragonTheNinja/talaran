import type { Knex } from 'knex';

// Salvage: things the water gives you INSTEAD of a fish.
//
// Not a bonus drop. A bonus would inflate the skill's output, and every fish
// was priced assuming one catch per cast; a REPLACEMENT conserves the value of
// an action while adding variety. Salvage therefore pays about half a fish's
// XP (you did the work, you just did not land a fish), rolls no weight, and
// sets no personal best, because it is not a fish.
//
// THE RULE: salvage is never junk. Fishing already has one way to waste a cast
// in the line snap, and a second would tip a deliberately slow skill from
// characterful into tiresome. Every item here is something a player wanted,
// just not what they were fishing for.
//
// BAIT SUPPRESSES SALVAGE (6% unbaited, 2% baited). That is bait's third
// benefit after the faster timer and the weighted odds: a baited hook is
// presenting food a fish wants, so it fouls less. Players discover it rather
// than read it.
//
// Rates are per cast; at the 70s base timer that is roughly 51 casts an hour:
//   River Mussel  6% x 80  = 4.8%   ~2.4/hr    common, it is a container
//   Frogspawn     6% x 15  = 0.9%   ~0.46/hr   deliberately BELOW Creekbank's
//                                              ~0.55/hr, so foraging stays the
//                                              reliable source and this only
//                                              tops up supply
//   Bog Lanai     6% x  5  = 0.3%   ~0.15/hr   one per ~7 hours, a luxury
//   Locked Rusty  6% x 85  = 5.1%   ~2.6/hr
//   Amber         6% x 15  = 0.9%   ~0.46/hr
//
// Locked Rusty Chest and River Mussel ship INERT: they are obviously containers,
// so
// players read them as "not yet" rather than "pointless", and they open when
// the container system lands. Bog Lanai has no recipe yet either; its purpose
// is the fine-frame upgrade for homesteads and (mainly) player shops, which
// arrives with the shops patch. The patch notes say all of this plainly.

const ITEMS = [
    {
        name: 'River Mussel', type: 'collectible', subtype: 'container', tier: 1,
        quality: null, slot: null, level_required: 1,
        description: 'A knuckle of dark shell, clamped shut and gritty with silt. Something rattles faintly inside, or possibly nothing does.',
    },
    {
        name: 'Bog Lanai', type: 'material', subtype: 'log', tier: 1,
        quality: null, slot: null, level_required: 1,
        description: 'Lanai that lay under the lake so long it turned black and hard as iron. Too fine to burn and too stubborn to waste.',
    },
    // Containers come in pairs: a LOCKED item and its opened counterpart. Picking
    // the lock consumes the first and yields the second, so they need different
    // names and different art. Only the locked one is fished up; the open one
    // exists solely as what a picked lock leaves behind.
    {
        name: 'Locked Rusty Chest', type: 'collectible', subtype: 'container_locked', tier: 1,
        quality: null, slot: null, level_required: 1,
        description: 'A small strongbox furred with rust, its lock seized solid. Someone lost this over a gunwale a long time ago and never said what was in it.',
    },
    {
        name: 'Rusty Chest', type: 'collectible', subtype: 'container', tier: 1,
        quality: null, slot: null, level_required: 1,
        description: 'The lid gives at last, on a hinge that has forgotten how. Whatever the sea left inside is yours now.',
    },
    {
        name: 'Amber', type: 'material', subtype: 'gem', tier: 1,
        quality: null, slot: null, level_required: 1,
        description: 'A warm gold nodule polished smooth by the tide. Hold it to the light and something very old is caught inside.',
    },
    {
        name: 'Freshwater Pearl', type: 'material', subtype: 'gem', tier: 1,
        quality: null, slot: null, level_required: 1,
        description: 'Small, irregular, and the colour of a rain cloud with the sun behind it. Worth more than the fish that shared its bed.',
    },
];

// Frogspawn is deliberately absent: it already exists as a Foraging drop and is
// reused here rather than duplicated.
const SALVAGE: Array<{
    name: string; water: string; weight: number; xp: number;
}> = [
    { name: 'River Mussel', water: 'fresh', weight: 80, xp: 22 },
    { name: 'Frogspawn', water: 'fresh', weight: 15, xp: 22 },
    { name: 'Bog Lanai', water: 'fresh', weight: 5, xp: 22 },
    { name: 'Locked Rusty Chest', water: 'salt', weight: 85, xp: 22 },
    { name: 'Amber', water: 'salt', weight: 15, xp: 22 },
];

const LOCATION_BY_WATER: Record<string, string> = { fresh: 'Luxmere', salt: 'Dawncrest' };

export async function up(knex: Knex): Promise<void> {
    // `kind` splits the table in two. Salvage rows live in fish_species because
    // they share every column that matters (location, weight, xp, discovery),
    // but they are picked from their own pool, so the salvage rate does not
    // drift as fish are added.
    if (!(await knex.schema.hasColumn('fish_species', 'kind'))) {
        await knex.schema.alterTable('fish_species', (t) => {
            t.string('kind', 10).notNullable().defaultTo('fish');   // 'fish' | 'salvage'
        });
    }

    for (const item of ITEMS) {
        const existing = await knex('items').where({ name: item.name }).first();
        if (existing) await knex('items').where({ id: existing.id }).update(item);
        else await knex('items').insert(item);
    }

    const locationIds: Record<string, number> = {};
    for (const [water, locationName] of Object.entries(LOCATION_BY_WATER)) {
        const location = await knex('locations').where({ name: locationName }).first();
        if (!location) throw new Error(`seed_fishing_salvage: location '${locationName}' not found`);
        locationIds[water] = location.id;
    }

    let order = 100;   // after the fish, so the panel lists them below
    for (const s of SALVAGE) {
        const item = await knex('items').where({ name: s.name }).first();
        if (!item) throw new Error(`seed_fishing_salvage: item '${s.name}' not found`);
        const row = {
            name: s.name,
            item_name: s.name,
            location_id: locationIds[s.water],
            water: s.water,
            kind: 'salvage',
            required_level: 1,          // rarity is the gate, not level
            base_weight: s.weight,
            bait_category: null,        // bait suppresses salvage, never steers it
            time_window: null,
            window_exclusive: false,
            seasons: null,
            season_exclusive: false,
            min_weight_cw: 0,           // salvage is not weighed
            max_weight_cw: 0,
            xp: s.xp,
            bait_value: 1,
            display_order: order++,
            is_active: true,
        };
        const existing = await knex('fish_species').where({ name: s.name }).first();
        if (existing) await knex('fish_species').where({ id: existing.id }).update(row);
        else await knex('fish_species').insert(row);
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex('fish_species').whereIn('name', SALVAGE.map((s) => s.name)).delete();
    await knex('items').whereIn('name', ITEMS.map((i) => i.name)).delete();
    if (await knex.schema.hasColumn('fish_species', 'kind')) {
        await knex.schema.alterTable('fish_species', (t) => t.dropColumn('kind'));
    }
}
