import type { Knex } from 'knex';

// Husbandry content. Three livestock species and the first two growable mounts,
// their products, the three tools, and the Cowhide -> Leather tanning rung.
//
// XP TUNING (docs/xp-rebalance.md §3, and the husbandry uptime sim): a full pen
// earns what a full plot earns, so a single animal targets
//     (0.12 / pen_capacity) x activeXpForSeconds band(species level)
// per fed hour. That puts a starter coop at 12% of the active band and a filled
// farm at ~63% at realistic feeding uptime — the same place Farming sits.
//
// xp_slaughter is the FULL-LIFE maximum. The service pays
// (life accrued / full lifespan), capped at 1.0 once an animal turns elder,
// because otherwise slaughtering the instant an animal matured paid up to 6.4x
// the intended rate. Meat and hide do NOT scale — a fresh adult butchers out the
// same as an elder. Only the XP is time-weighted, and only the repeating
// products (eggs, milk, truffles) get slower with age.
//
// Mounts are the exception: their terminal payout is flat, because collecting a
// mount the moment it matures is the intended play, not an exploit.
//
// Feed All and Muck Pen are not priced here — they are timer actions paid by
// activeXpForSeconds in the service, the way sowing and harvesting are.

const H = 3600;

const ITEMS = [
    // Babies — the item a rare Trapping/Hunting find gives you, spent by placing
    // it in a pen. Naming happens at placement, so these stack.
    { name: 'Chick', type: 'animal', subtype: 'baby', tier: 1, quality: null, slot: null, level_required: 1, description: 'A ball of yellow down with an opinion. Cheeping, constantly.', stackable: true },
    { name: 'Calf', type: 'animal', subtype: 'baby', tier: 1, quality: null, slot: null, level_required: 1, description: 'Knock-kneed and enormous-eyed. It will follow anything that feeds it.', stackable: true },
    { name: 'Piglet', type: 'animal', subtype: 'baby', tier: 1, quality: null, slot: null, level_required: 1, description: 'Pink, bristled, and already rooting at the ground for something better.', stackable: true },
    { name: 'Rouncey Foal', type: 'animal', subtype: 'baby', tier: 1, quality: null, slot: null, level_required: 1, description: 'All legs and no sense. In a year it will carry you the length of the island.', stackable: true },
    { name: 'Palfrey Foal', type: 'animal', subtype: 'baby', tier: 2, quality: null, slot: null, level_required: 1, description: 'Finer-boned than a rouncey foal, and it already knows it.', stackable: true },

    // Repeating products
    { name: 'Egg', type: 'food', subtype: 'produce', tier: 1, quality: null, slot: null, level_required: 1, description: 'Still warm from the straw. The beginning of a great many recipes.', stackable: true },
    { name: 'Milk', type: 'food', subtype: 'produce', tier: 1, quality: null, slot: null, level_required: 1, description: 'A pail of it, sweet and frothing. It will not keep long.', stackable: true },
    { name: 'Truffle', type: 'food', subtype: 'produce', tier: 3, quality: null, slot: null, level_required: 1, description: 'Knuckled, black, and smelling of the forest floor. The sow found it; the sow does not get it.', stackable: true },

    // Slaughter yields
    { name: 'Chicken Meat', type: 'food', subtype: 'raw', tier: 1, quality: null, slot: null, level_required: 1, description: 'Plucked and drawn, ready for the spit.', stackable: true },
    { name: 'Beef', type: 'food', subtype: 'raw', tier: 2, quality: null, slot: null, level_required: 1, description: 'Heavy red cuts. A single beast feeds a household for a week.', stackable: true },
    { name: 'Pork', type: 'food', subtype: 'raw', tier: 2, quality: null, slot: null, level_required: 1, description: 'Fat-marbled and generous. Nothing of a pig goes to waste.', stackable: true },
    { name: 'Cowhide', type: 'material', subtype: 'hide', tier: 1, quality: null, slot: null, level_required: 1, description: 'A whole hide off a farmed beast, stiff and raw. Bark and time will make leather of it.', stackable: true },

    // The farmed leather line (buckskin stays the wild family; this is cattle).
    { name: 'Leather', type: 'material', subtype: 'leather', tier: 1, quality: null, slot: null, level_required: 1, description: 'A supple tanned sheet. Everything a strip cannot do begins here.', stackable: true },

    // Tools — equipped, not merely carried.
    { name: 'Feed Pail', type: 'tool', subtype: 'pail', tier: 1, quality: null, slot: 'offhand', level_required: 1, description: 'A banded wooden pail. Carries feed out and milk back.', stackable: false },
    { name: 'Mucking Fork', type: 'tool', subtype: 'fork', tier: 1, quality: null, slot: 'mainhand', level_required: 1, description: 'Long-tined and worn smooth at the haft. The least loved tool on any farm.', stackable: false },
    { name: 'Halter & Lead', type: 'tool', subtype: 'halter', tier: 1, quality: null, slot: 'hands', level_required: 1, description: 'Plaited strips and a good buckle. The difference between a horse and your horse.', stackable: false },

    // Mounts. travel_speed_modifier is where the mount starts at Equitation 0;
    // travel_floor is what it approaches and never crosses (services/travel.ts).
    { name: 'Rouncey', type: 'mount', subtype: 'horse', tier: 1, quality: null, slot: 'mount', level_required: 1, travel_speed_modifier: 0.55, travel_floor: 0.30, description: 'An honest, thick-set riding horse. No breeding to speak of and no complaints either.', stackable: false },
    { name: 'Palfrey', type: 'mount', subtype: 'horse', tier: 2, quality: null, slot: 'mount', level_required: 13, travel_speed_modifier: 0.53, travel_floor: 0.28, description: 'Smooth-gaited and bred for the long road. A day in this saddle costs you nothing.', stackable: false },
];

const SPECIES = [
    {
        name: 'Chicken', pen_type: 'coop', husbandry_level: 1,
        grow_seconds: 2 * H, elder_seconds: 24 * H,
        baby_item_name: 'Chick',
        feed_item_name: 'Grain', feed_qty: 1,
        product_item_name: 'Egg', product_seconds: 45 * 60, product_qty: 1, product_chance: 100,
        elder_yield_multiplier: 1.0, elder_time_multiplier: 1.5,
        slaughter_table: JSON.stringify([
            { itemName: 'Chicken Meat', min: 1, max: 2, chance: 100 },
            { itemName: 'Feathers', min: 5, max: 9, chance: 100 },
        ]),
        mount_item_name: null,
        xp_product: 30, xp_mature: 70, xp_slaughter: 211,
        description: 'Loud, ungrateful, and the fastest return on a farm. Feathers by the handful and an egg most of the morning.',
    },
    {
        name: 'Cow', pen_type: 'paddock', husbandry_level: 9,
        grow_seconds: 8 * H, elder_seconds: 48 * H,
        baby_item_name: 'Calf',
        feed_item_name: 'Grain', feed_qty: 2,
        product_item_name: 'Milk', product_seconds: 3 * H, product_qty: 1, product_chance: 100,
        elder_yield_multiplier: 1.0, elder_time_multiplier: 1.5,
        slaughter_table: JSON.stringify([
            { itemName: 'Beef', min: 2, max: 4, chance: 100 },
            { itemName: 'Cowhide', min: 1, max: 1, chance: 100 },
        ]),
        mount_item_name: null,
        xp_product: 310, xp_mature: 362, xp_slaughter: 1086,
        description: 'The whole argument of husbandry in one animal: milk for as long as you keep her, or hide and beef the day you stop.',
    },
    {
        name: 'Pig', pen_type: 'paddock', husbandry_level: 17,
        grow_seconds: 6 * H, elder_seconds: 36 * H,
        baby_item_name: 'Piglet',
        feed_item_name: 'Grain', feed_qty: 2,
        product_item_name: 'Truffle', product_seconds: 4 * H, product_qty: 1, product_chance: 25,
        elder_yield_multiplier: 1.0, elder_time_multiplier: 1.5,
        slaughter_table: JSON.stringify([
            { itemName: 'Pork', min: 3, max: 5, chance: 100 },
        ]),
        mount_item_name: null,
        xp_product: 750, xp_mature: 328, xp_slaughter: 4267,
        description: 'Kept for the killing, but a good sow pays her way first; there is no better nose for a truffle in Talaran.',
    },
    {
        name: 'Rouncey', pen_type: 'paddock', husbandry_level: 1,
        grow_seconds: 4 * H, elder_seconds: 24 * H,
        baby_item_name: 'Rouncey Foal',
        feed_item_name: 'Grain', feed_qty: 2,
        product_item_name: null, product_seconds: null, product_qty: 1, product_chance: 100,
        elder_yield_multiplier: 1.0, elder_time_multiplier: 1.5,
        slaughter_table: JSON.stringify([]),
        mount_item_name: 'Rouncey',
        xp_product: 0, xp_mature: 70, xp_slaughter: 282,
        description: 'Raised to be ridden, not eaten. Halter it once it is grown and it is yours for good.',
    },
    {
        name: 'Palfrey', pen_type: 'paddock', husbandry_level: 13,
        grow_seconds: 6 * H, elder_seconds: 30 * H,
        baby_item_name: 'Palfrey Foal',
        feed_item_name: 'Grain', feed_qty: 2,
        product_item_name: null, product_seconds: null, product_qty: 1, product_chance: 100,
        elder_yield_multiplier: 1.0, elder_time_multiplier: 1.5,
        slaughter_table: JSON.stringify([]),
        mount_item_name: 'Palfrey',
        xp_product: 0, xp_mature: 140, xp_slaughter: 562,
        description: 'A traveller\'s horse, worth three of a rouncey to anyone who rides far.',
    },
];

const RECIPES = [
    // Tools. skill gates the level and takes the XP; for_skill files them under
    // Husbandry in the recipe lists.
    {
        skill: 'Carpentry', for_skill: 'Husbandry', name: 'Build Feed Pail',
        output_item_name: 'Feed Pail', output_qty: 1,
        inputs: JSON.stringify([{ itemName: 'Lanai Planks', qty: 3 }, { itemName: 'Ambren Nails', qty: 4 }]),
        required_level: 1, timer_seconds: 20, xp: 30, station: null, mode: 'active', is_active: true,
        flavor_text: 'You set the staves, drive the band home, and the pail holds water on the first try.',
    },
    {
        skill: 'Carpentry', for_skill: 'Husbandry', name: 'Build Mucking Fork',
        output_item_name: 'Mucking Fork', output_qty: 1,
        inputs: JSON.stringify([{ itemName: 'Lanai Planks', qty: 2 }, { itemName: 'Ambren Nails', qty: 3 }]),
        required_level: 1, timer_seconds: 15, xp: 22, station: null, mode: 'active', is_active: true,
        flavor_text: 'Four tines, a long haft, and a job nobody thanks you for.',
    },
    {
        // Buckskin strips, not cattle leather — a Rouncey is a level 1 animal and
        // cattle are level 9, so a leather halter would have locked mounts behind
        // cows. Hunting supplies the strips, which suits the bridge better anyway.
        skill: 'Crafting', for_skill: 'Husbandry', name: 'Stitch Halter & Lead',
        output_item_name: 'Halter & Lead', output_qty: 1,
        inputs: JSON.stringify([{ itemName: 'Leather Strips', qty: 6 }]),
        required_level: 1, timer_seconds: 20, xp: 30, station: null, mode: 'active', is_active: true,
        flavor_text: 'Plait, buckle, and a lead long enough to give a nervous animal some room.',
    },
    {
        // The cattle leather line's first rung. Lanai Bark tans tier 1; the higher
        // barks are waiting for buffalo and aurochs.
        // `station` is a workstations.type, NOT a display name — services/tanning.ts
        // queries station: 'tanning'. Anything else and the recipe is invisible.
        skill: 'Crafting', for_skill: 'Husbandry', name: 'Tan Cowhide',
        output_item_name: 'Leather', output_qty: 2,
        inputs: JSON.stringify([{ itemName: 'Cowhide', qty: 1 }, { itemName: 'Lanai Bark', qty: 6 }]),
        required_level: 9, timer_seconds: 21600, xp: 60, station: 'tanning', mode: 'passive', is_active: true,
        flavor_text: 'The hide goes under the liquor and the vat is left to do the slow work.',
    },
];

export async function up(knex: Knex): Promise<void> {
    for (const item of ITEMS) {
        const existing = await knex('items').where({ name: item.name }).first();
        if (existing) await knex('items').where({ id: existing.id }).update(item);
        else await knex('items').insert(item);
    }

    for (const species of SPECIES) {
        const existing = await knex('animal_species').where({ name: species.name }).first();
        if (existing) await knex('animal_species').where({ id: existing.id }).update(species);
        else await knex('animal_species').insert(species);
    }

    for (const recipe of RECIPES) {
        const existing = await knex('recipes').where({ name: recipe.name }).first();
        if (existing) await knex('recipes').where({ id: existing.id }).update(recipe);
        else await knex('recipes').insert(recipe);
    }

    // Husbandry stays is_implemented = false until the service and routes land.
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').whereIn('name', RECIPES.map(r => r.name)).delete();
    await knex('animal_species').whereIn('name', SPECIES.map(s => s.name)).delete();
    // Items left in place — players may be holding produce, tools, or a mount.
}
