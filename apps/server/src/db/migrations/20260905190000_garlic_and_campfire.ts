import type { Knex } from 'knex';

/**
 * Garlic, and the campfire.
 *
 * GARLIC: Garlic Cloves forage out of Forest Floor at level 4 and were always
 * meant to plant into Garlic, but no crop row was ever written. Ten cooking
 * recipes name Garlic and none of them can be made, because nothing in the game
 * produces it.
 *
 * XP follows the constant the other crops already sit on. Solving
 * xp = k * Rhat(level) * grow_hours against Carrot, Turnip, Wild Grain and Pea
 * gives k = 0.01197 every time, so garlic at plant level 4 over 14 hours is
 * 0.01197 * 2148 * 14 = 360. Not a number picked to look right.
 *
 * CAMPFIRE: a workstation with an expiry and no slots.
 *
 * Rather than a new station type, it reuses the one that exists. A campfire is
 * a `cooking` workstation with expires_at set, which means checkStation already
 * finds it, already knows it has no tools, and already refuses anything needing
 * a cauldron. The only new rule is that a temporary station runs slower than a
 * real cookhouse and cannot hold tools.
 */

const H = 60 * 60;

export async function up(knex: Knex): Promise<void> {
    // ── Garlic ────────────────────────────────────────────────────
    const existingCrop = await knex('crops').where({ name: 'Garlic' }).first();
    if (!existingCrop) {
        const cloves = await knex('items').where({ name: 'Garlic Cloves' }).first();
        const garlic = await knex('items').where({ name: 'Garlic' }).first();
        if (!cloves) throw new Error('Garlic migration: no Garlic Cloves item. Foraging content must ship first.');
        if (!garlic) throw new Error('Garlic migration: no Garlic item.');

        await knex('crops').insert({
            name: 'Garlic',
            seed_item_name: 'Garlic Cloves',
            produce_item_name: 'Garlic',
            plant_level: 4,
            grow_seconds: 14 * H,
            yield_per_seed: 3,
            xp_per_seed: 360,
            crop_type: 'vegetable',
            is_perennial: false,
            regrow_seconds: null,
            soil_effect: 'deplete',
            // Without a region the island lock has nothing to match and the crop
            // grows nowhere at all, which is a silent way to ship a dead row.
            region: 'Taiar Island',
            grows_anywhere: null,
            is_active: true,
        });
    }

    // ── Campfire ──────────────────────────────────────────────────
    if (!(await knex.schema.hasColumn('workstations', 'expires_at'))) {
        await knex.schema.alterTable('workstations', (t) => {
            // Null for a real bench. Set for a campfire, which burns out.
            t.timestamp('expires_at').nullable();
            t.index(['expires_at']);
        });
    }

    const fire = await knex('items').where({ name: 'Campfire' }).first();
    if (!fire) {
        await knex('items').insert({
            name: 'Campfire',
            type: 'tool',
            subtype: 'campfire',
            tier: 1,
            level_required: 1,
            description: 'Kindling and split wood, bound ready to light. Enough of a fire to cook a fish over, and no more.',
            is_active: true,
        });
    }

    // Cheap and made from what a woodcutter already carries. This is a
    // convenience, not a second cookhouse, so it should never be worth
    // stockpiling over building a hearth.
    const existingRecipe = await knex('recipes').where({ name: 'Campfire' }).first();
    if (!existingRecipe) {
        const rHat = (u: number) => 2000 * Math.pow(1.33, (u - 1) / 12);
        const timer = 30;
        await knex('recipes').insert({
            skill: 'Crafting',
            name: 'Campfire',
            output_item_name: 'Campfire',
            output_qty: 1,
            inputs: JSON.stringify([{ itemName: 'Lanai Log', qty: 2 }]),
            required_level: 1,
            timer_seconds: timer,
            xp: Math.round(1.8 * 1.10 * rHat(1) * timer / 3600),
            station: null,
            required_tools: JSON.stringify([]),
            mode: 'active',
            for_skill: 'Cooking',
            flavor_text: 'You are binding kindling into a bundle.',
            is_active: true,
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').where({ name: 'Campfire' }).delete();
    await knex('items').where({ name: 'Campfire' }).delete();
    await knex('crops').where({ name: 'Garlic' }).delete();

    // Any campfire still burning goes out with the column.
    await knex('workstations').whereNotNull('expires_at').delete();
    if (await knex.schema.hasColumn('workstations', 'expires_at')) {
        await knex.schema.alterTable('workstations', (t) => t.dropColumn('expires_at'));
    }
}
