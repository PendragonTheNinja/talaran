import type { Knex } from 'knex';

/**
 * Beekeeping.
 *
 * Honey is the sweetener the preserve and pastry lines need, and it arrives
 * with beeswax attached. The chain is the historical one:
 *
 *   Weave a skep from straw  ->  carry it while woodcutting  ->  a wild hive
 *   drops  ->  the colony transfers into the skep  ->  place it in an apiary.
 *
 * Without a skep you rob the nest instead: one honeycomb, and the colony is
 * lost. That is what most people actually did; keeping bees meant catching them
 * rather than raiding them. It also means the drop is never wasted and honey
 * trickles in before anyone owns an apiary.
 *
 * WOODCUTTING IS THE ONLY SOURCE. No swarms, no breeding, no elder stage. Every
 * hive anyone ever owns came off a tree, so the drop rate is the permanent
 * control on honey supply.
 *
 * SEASONS: production never stops. Winter is lean, not dead, so no recipe
 * becomes unmakeable for three months of the year.
 */

const SEASON_YIELD = { spring: 100, summer: 100, autumn: 67, winter: 33 };

export async function up(knex: Knex): Promise<void> {
    // ── Schema ────────────────────────────────────────────────────

    // Bees forage for themselves, so feed has to become optional. Every other
    // animal keeps its feed and nothing else changes.
    await knex.schema.alterTable('animal_species', (t) => {
        t.string('feed_item_name', 60).nullable().alter();
    });

    // Seasonal yield, as a JSON map of season to percentage. Null means the
    // animal does not care what month it is, which is every animal but bees.
    if (!(await knex.schema.hasColumn('animal_species', 'season_yield'))) {
        await knex.schema.alterTable('animal_species', (t) => {
            t.text('season_yield').nullable();
        });
    }

    // Hives sit beside pens and plots rather than competing with livestock for
    // pen_slots, matching how the property row already carries capacity.
    if (!(await knex.schema.hasColumn('player_properties', 'apiary_slots'))) {
        await knex.schema.alterTable('player_properties', (t) => {
            t.integer('apiary_slots').unsigned().notNullable().defaultTo(0);
        });
    }
    // Three hives at tier 1. One covers personal cooking, three supplies a small
    // trade. Since bees never reproduce in game, this is a cap on ambition and
    // the woodcutting drop is doing the real gating.
    await knex('player_properties').where('tier', '>=', 1).update({ apiary_slots: 3 });

    // ── Items ─────────────────────────────────────────────────────
    const items = [
        {
            name: 'Straw Skep', type: 'tool', subtype: 'skep', tier: 1, level_required: 1,
            description: 'A dome of coiled straw, bound tight. Empty, and waiting for a colony.',
            is_active: true,
        },
        {
            name: 'Skep of Bees', type: 'tool', subtype: 'skep_full', tier: 1, level_required: 1,
            description: 'The same dome, humming. Carry it gently and do not set it down hard.',
            is_active: true,
        },
        {
            name: 'Honeycomb', type: 'material', subtype: 'hive', tier: 1, level_required: 1,
            description: 'Heavy wax comb, capped and dripping. Press it to part the honey from the wax.',
            is_active: true,
        },
        {
            name: 'Honey', type: 'food', subtype: 'sweetener', tier: 1, level_required: 1,
            heal_amount: 6,
            description: 'Strained from crushed comb and kept in a sealed crock. Sweet enough to preserve anything.',
            is_active: true,
        },
        {
            name: 'Beeswax', type: 'material', subtype: 'wax', tier: 1, level_required: 1,
            description: 'Pale blocks pressed from spent comb. Burns clean and keeps water out of everything.',
            is_active: true,
        },
    ];
    for (const item of items) {
        const existing = await knex('items').where({ name: item.name }).first();
        if (!existing) await knex('items').insert(item);
    }

    // ── Recipes ───────────────────────────────────────────────────
    const rHat = (u: number) => 2000 * Math.pow(1.33, (u - 1) / 12);
    const craftTarget = (u: number) => 1.8 * 1.10 * rHat(u);

    const recipes = [
        {
            skill: 'Crafting', name: 'Weave Skep', output_item_name: 'Straw Skep', output_qty: 1,
            inputs: JSON.stringify([{ itemName: 'Straw', qty: 8 }]),
            required_level: 1, timer_seconds: 120,
            xp: Math.round(craftTarget(1) * 120 / 3600),
            station: null, required_tools: JSON.stringify([]),
            mode: 'active', for_skill: 'Crafting',
            flavor_text: 'You are coiling straw into a dome.',
            is_active: true,
        },
        {
            // Two outputs, using the byproduct column rather than a bespoke path.
            skill: 'Cooking', name: 'Press Honeycomb', output_item_name: 'Honey', output_qty: 2,
            inputs: JSON.stringify([{ itemName: 'Honeycomb', qty: 1 }]),
            required_level: 5, timer_seconds: 60,
            xp: Math.round(craftTarget(5) * 60 / 3600),
            station: 'cooking', required_tools: JSON.stringify([]),
            byproduct_item_name: 'Beeswax', byproduct_qty: 1,
            mode: 'active', for_skill: 'Cooking',
            flavor_text: 'You are pressing the comb to part honey from wax.',
            is_active: true,
        },
    ];
    for (const recipe of recipes) {
        const existing = await knex('recipes').where({ name: recipe.name }).first();
        if (!existing) await knex('recipes').insert(recipe);
    }

    // ── The bees themselves ───────────────────────────────────────
    const existingBee = await knex('animal_species').where({ name: 'Bees' }).first();
    if (!existingBee) {
        await knex('animal_species').insert({
            name: 'Bees',
            pen_type: 'apiary',
            husbandry_level: 5,
            grow_seconds: 8 * 60 * 60,      // a caught colony settling in
            elder_seconds: 2147483,          // effectively never: a hive does not age out
            baby_item_name: 'Skep of Bees',
            feed_item_name: null,            // they feed themselves
            feed_qty: 0,
            product_item_name: 'Honeycomb',
            product_seconds: 4 * 60 * 60,
            product_qty: 1,
            product_chance: 100,
            season_yield: JSON.stringify(SEASON_YIELD),
            xp_mature: 200,
            // 22 xp/hr. Well under Chicken at 40, which is the point: a hive is
            // the only animal with no feeding, no mucking and no growing to wait
            // through, so it should not out-earn the ones that ask for work.
            xp_product: 90,
            elder_yield_multiplier: 1.0,
            elder_time_multiplier: 1.0,
            slaughter_table: JSON.stringify([]),  // you do not slaughter bees
            description: 'A caught colony, working a skep. They ask for nothing but flowers within reach.',
            is_active: true,
        });
    }

    // ── The wild hive, off a tree ─────────────────────────────────
    //
    // Drops hang off drop_table_entries keyed 'woodcutting:<subtype>', which is
    // how woodcutting.ts builds the key at roll time. One entry per tree type
    // rather than per node: a colony is as likely in one species as another.
    //
    // Rare on purpose. This is the only source of bees there will ever be, so
    // this number is the permanent ceiling on honey supply.
    const hiveExisting = await knex('items').where({ name: 'Wild Hive' }).first();
    const hiveId = hiveExisting
        ? hiveExisting.id
        : (await knex('items').insert({
            name: 'Wild Hive', type: 'material', subtype: 'hive', tier: 1, level_required: 1,
            description: 'A colony found in a hollow trunk. It will go into a skep, if you brought one.',
            is_active: true,
        }).returning('id')).map((r: any) => r.id ?? r)[0];

    const treeSubtypes = await knex('items')
        .whereIn('subtype', ['lanai', 'bearn', 'craxial', 'hatch', 'mirrith'])
        .distinct('subtype')
        .pluck('subtype');

    for (const subtype of treeSubtypes) {
        const sourceKey = `woodcutting:${subtype}`;
        const already = await knex('drop_table_entries')
            .where({ source_key: sourceKey, item_id: hiveId })
            .first();
        if (already) continue;
        await knex('drop_table_entries').insert({
            source_key: sourceKey,
            item_id: hiveId,
            chance_one_in: 400,
            min_qty: 1,
            max_qty: 1,
            discovery_xp: 40,
            is_active: true,
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    const hive = await knex('items').where({ name: 'Wild Hive' }).first();
    if (hive) await knex('drop_table_entries').where({ item_id: hive.id }).delete();

    await knex('animal_species').where({ name: 'Bees' }).delete();
    await knex('recipes').whereIn('name', ['Weave Skep', 'Press Honeycomb']).delete();
    await knex('items').whereIn('name', [
        'Straw Skep', 'Skep of Bees', 'Honeycomb', 'Honey', 'Beeswax', 'Wild Hive',
    ]).delete();

    if (await knex.schema.hasColumn('player_properties', 'apiary_slots')) {
        await knex.schema.alterTable('player_properties', (t) => t.dropColumn('apiary_slots'));
    }
    if (await knex.schema.hasColumn('animal_species', 'season_yield')) {
        await knex.schema.alterTable('animal_species', (t) => t.dropColumn('season_yield'));
    }
    // feed_item_name stays nullable: restoring NOT NULL would fail on any row
    // that legitimately has none.
}
