import type { Knex } from 'knex';

// Foraging content (docs/foraging-spec.md). Tier 1 lives at Lanaivale — the same
// T1 site as Woodcutting. Four habitats the player chooses between; each cycle is
// a WEIGHTED PICK of one find from that habitat's drop_table. Prickly rows carry
// requiresGloves:true and are excluded unless the player owns foraging gloves.
// `notable:true` rows sparkle client-side and are the rare/folklore finds.
// Upsert-by-name throughout — idempotent on prod, local, and fresh installs.
//
// SEASONS: drop_table entries may carry a `season` field later; absent = all year.
// Everything ships seasonless for now (the nullable seam, empty).

const ITEMS = [
    // ── Tools ────────────────────────────────────────────────────────────────
    { name: 'Foraging Basket', type: 'tool', subtype: 'foraging_basket', tier: 1, quality: null, slot: null, level_required: 1, description: 'A wide reed basket. Carrying more means bringing a little more home each time.', stackable: false },
    { name: 'Ambren Foraging Knife', type: 'tool', subtype: 'foraging_knife', tier: 1, quality: null, slot: null, level_required: 1, description: 'A slim Ambren blade for cutting stems and roots cleanly. Quickens the work.', stackable: false },
    { name: 'Buckskin Foraging Gloves', type: 'tool', subtype: 'foraging_gloves', tier: 1, quality: null, slot: null, level_required: 1, description: 'Supple buckskin gloves. Nettles, brambles, and thorns hold no sting for hands so covered.', stackable: false },

    // ── Meadow ────────────────────────────────────────────────────────────────
    { name: 'Chamomile', type: 'material', subtype: 'herb', tier: 1, quality: null, slot: null, level_required: 1, description: 'Small daisy-like flowers, apple-sweet. Steeped for a calming tea.', stackable: true },
    { name: 'Dandelion', type: 'material', subtype: 'herb', tier: 1, quality: null, slot: null, level_required: 1, description: 'Root, leaf, and flower — every part of the humble dandelion has a use.', stackable: true },
    { name: 'Yarrow', type: 'material', subtype: 'herb', tier: 1, quality: null, slot: null, level_required: 1, description: 'A feathery-leaved herb long carried to staunch bleeding.', stackable: true },
    { name: 'Wild Clover', type: 'material', subtype: 'herb', tier: 1, quality: null, slot: null, level_required: 1, description: 'Sweet three-leafed clover. Good fodder, and better luck if you find its fourth leaf.', stackable: true },
    { name: 'Wild Strawberry', type: 'material', subtype: 'berry', tier: 1, quality: null, slot: null, level_required: 1, description: 'Tiny, intensely sweet berries hidden low in the meadow grass.', stackable: true },
    { name: 'Wild Thyme', type: 'material', subtype: 'herb', tier: 1, quality: null, slot: null, level_required: 1, description: 'A low, creeping herb sharp with fragrance.', stackable: true },
    { name: 'Lavender', type: 'material', subtype: 'flower', tier: 1, quality: null, slot: null, level_required: 1, description: 'Purple spikes heavy with scent. Prized for calm and for flavour.', stackable: true },
    { name: 'Four-Leaf Clover', type: 'material', subtype: 'trophy', tier: 1, quality: null, slot: null, level_required: 1, description: 'One leaf more than nature intended. Kept by the hopeful and the desperate alike.', stackable: true },
    { name: 'Faelight Bloom', type: 'material', subtype: 'reagent', tier: 1, quality: null, slot: null, level_required: 1, description: 'A pale flower that only opens at dusk, glowing faintly. The old folk left the field before it did.', stackable: true },

    // ── Forest Floor ──────────────────────────────────────────────────────────
    { name: 'Chanterelle Mushroom', type: 'material', subtype: 'mushroom', tier: 1, quality: null, slot: null, level_required: 1, description: 'Golden, funnel-shaped, faintly apricot. A forager\'s prize on any table.', stackable: true },
    { name: 'Wild Garlic', type: 'material', subtype: 'herb', tier: 1, quality: null, slot: null, level_required: 1, description: 'Broad green leaves that betray themselves by scent. Ramps, some call them.', stackable: true },
    { name: 'Acorns', type: 'material', subtype: 'nut', tier: 1, quality: null, slot: null, level_required: 1, description: 'Oak mast. Bitter until leached, then ground into a hearty flour.', stackable: true },
    { name: 'Fiddlehead Ferns', type: 'material', subtype: 'herb', tier: 1, quality: null, slot: null, level_required: 1, description: 'Tightly coiled young fern shoots, gathered before they unfurl.', stackable: true },
    { name: 'Hazelnuts', type: 'material', subtype: 'nut', tier: 1, quality: null, slot: null, level_required: 1, description: 'Rich, oily nuts in the husk. A squirrel\'s treasure and a baker\'s.', stackable: true },
    { name: 'Morel Mushroom', type: 'material', subtype: 'mushroom', tier: 1, quality: null, slot: null, level_required: 1, description: 'Honeycombed and hollow, appearing only briefly. Coveted, and never where you looked last.', stackable: true },
    { name: 'Oak Gall', type: 'material', subtype: 'reagent', tier: 1, quality: null, slot: null, level_required: 1, description: 'A hard brown swelling on an oak twig, born of a wasp. Crushed and steeped, it makes a black and lasting ink.', stackable: true },
    { name: 'Witch\'s Butter', type: 'material', subtype: 'fungus', tier: 1, quality: null, slot: null, level_required: 1, description: 'A quivering yellow jelly-fungus on dead wood. To find it on your gate, the old wives said, meant a witch had you in mind.', stackable: true },
    { name: 'Ghost Pipe', type: 'material', subtype: 'reagent', tier: 1, quality: null, slot: null, level_required: 1, description: 'A waxen white plant with no green in it at all, feeding on the forest\'s dead. It blackens at a touch.', stackable: true },

    // ── Creekbank ─────────────────────────────────────────────────────────────
    { name: 'Watercress', type: 'material', subtype: 'herb', tier: 1, quality: null, slot: null, level_required: 1, description: 'Peppery green leaves gathered from cold running water.', stackable: true },
    { name: 'Wild Mint', type: 'material', subtype: 'herb', tier: 1, quality: null, slot: null, level_required: 1, description: 'Bruise a leaf and the whole bank smells of it.', stackable: true },
    { name: 'Cattail Root', type: 'material', subtype: 'root', tier: 1, quality: null, slot: null, level_required: 1, description: 'Starchy rhizomes from the reed beds. Filling, once cleaned and cooked.', stackable: true },
    { name: 'Reeds', type: 'material', subtype: 'reed', tier: 1, quality: null, slot: null, level_required: 1, description: 'Long, pliant water-reeds. Dried and woven into baskets and mats.', stackable: true },
    { name: 'Willow Bark', type: 'material', subtype: 'bark', tier: 1, quality: null, slot: null, level_required: 1, description: 'Strips of bitter bark. Chewed against aches long before anyone knew why it worked.', stackable: true },
    { name: 'Meadowsweet', type: 'material', subtype: 'herb', tier: 1, quality: null, slot: null, level_required: 1, description: 'Frothy cream-white flowers, almond-scented, crowding the wet ground.', stackable: true },
    { name: 'Frogspawn', type: 'material', subtype: 'reagent', tier: 1, quality: null, slot: null, level_required: 1, description: 'A cool clutch of jelly and dark eyes from the shallows. Unpleasant, and useful.', stackable: true },
    { name: 'Wisp Cap', type: 'material', subtype: 'reagent', tier: 1, quality: null, slot: null, level_required: 1, description: 'A marsh mushroom that glows a cold green after dark. Follow its light and you\'ll find only bog.', stackable: true },

    // ── Thicket / Hedgerow ────────────────────────────────────────────────────
    { name: 'Blackberries', type: 'material', subtype: 'berry', tier: 1, quality: null, slot: null, level_required: 1, description: 'Dark, seedy, sun-warm. The hedgerow\'s reward for a scratched hand.', stackable: true },
    { name: 'Raspberries', type: 'material', subtype: 'berry', tier: 1, quality: null, slot: null, level_required: 1, description: 'Soft red berries that come away from the cane like little thimbles.', stackable: true },
    { name: 'Rosehips', type: 'material', subtype: 'berry', tier: 1, quality: null, slot: null, level_required: 1, description: 'The scarlet fruit of the wild rose, tart and rich once the seeds are cleaned out.', stackable: true },
    { name: 'Stinging Nettle', type: 'material', subtype: 'herb', tier: 1, quality: null, slot: null, level_required: 1, description: 'It bites the bare hand, but cooking draws the sting and leaves only good green nourishment.', stackable: true },
    { name: 'Bramble Vine', type: 'material', subtype: 'reed', tier: 1, quality: null, slot: null, level_required: 1, description: 'Tough, thorned, and endlessly long. Stripped of thorns, it binds and weaves.', stackable: true },
    { name: 'Hawthorn Haw', type: 'material', subtype: 'berry', tier: 1, quality: null, slot: null, level_required: 1, description: 'Small red hedge-fruit from the hawthorn. The tree of the good folk — cut it and regret it.', stackable: true },
    { name: 'Elderberry', type: 'material', subtype: 'berry', tier: 1, quality: null, slot: null, level_required: 1, description: 'Heavy umbels of tiny dark berries. Never eaten raw; always cooked.', stackable: true },
    { name: 'Sloe Berries', type: 'material', subtype: 'berry', tier: 1, quality: null, slot: null, level_required: 1, description: 'The blackthorn\'s bitter blue-black fruit, gathered after the first frost.', stackable: true },
    { name: 'Blackthorn Sprig', type: 'material', subtype: 'reagent', tier: 1, quality: null, slot: null, level_required: 1, description: 'A straight, wicked-thorned length of blackthorn. The wood of cursing-rods and blackthorn wands.', stackable: true },
    { name: 'Hedgewitch\'s Sprig', type: 'material', subtype: 'trophy', tier: 1, quality: null, slot: null, level_required: 1, description: 'A small bundle of herbs bound with red thread — plainly tied by a hand, though no one lives near this hedge.', stackable: true },
];

// weight = relative pick chance within the habitat; min/max = quantity; xp per find.
const HABITATS = [
    {
        name: 'Sunlit Meadow', required_level: 1, base_timer: 45, min_timer: 25, display_order: 1,
        description: 'Open grassland thick with wildflowers and herbs, humming in the sun.',
        drop_table: [
            { itemName: 'Chamomile', weight: 120, min: 1, max: 3, xp: 22 },
            { itemName: 'Dandelion', weight: 120, min: 1, max: 3, xp: 22 },
            { itemName: 'Yarrow', weight: 100, min: 1, max: 2, xp: 24 },
            { itemName: 'Wild Clover', weight: 100, min: 1, max: 3, xp: 20 },
            { itemName: 'Wild Strawberry', weight: 80, min: 1, max: 2, xp: 27 },
            { itemName: 'Wild Thyme', weight: 45, min: 1, max: 2, xp: 34 },
            { itemName: 'Lavender', weight: 40, min: 1, max: 2, xp: 39 },
            { itemName: 'Four-Leaf Clover', weight: 4, min: 1, max: 1, xp: 250, notable: true },
            { itemName: 'Faelight Bloom', weight: 2, min: 1, max: 1, xp: 450, notable: true },
        ],
    },
    {
        name: 'Forest Floor', required_level: 5, base_timer: 50, min_timer: 27, display_order: 2,
        description: 'The shaded understory beneath the Lanai canopy — leaf-litter, moss, and mushrooms.',
        drop_table: [
            { itemName: 'Chanterelle Mushroom', weight: 110, min: 1, max: 2, xp: 24 },
            { itemName: 'Wild Garlic', weight: 110, min: 1, max: 3, xp: 22 },
            { itemName: 'Acorns', weight: 100, min: 2, max: 4, xp: 21 },
            { itemName: 'Fiddlehead Ferns', weight: 90, min: 1, max: 3, xp: 25 },
            { itemName: 'Hazelnuts', weight: 50, min: 1, max: 3, xp: 32 },
            { itemName: 'Morel Mushroom', weight: 35, min: 1, max: 1, xp: 44 },
            { itemName: 'Oak Gall', weight: 20, min: 1, max: 2, xp: 90, notable: true },
            { itemName: 'Witch\'s Butter', weight: 5, min: 1, max: 1, xp: 350, notable: true },
            { itemName: 'Ghost Pipe', weight: 3, min: 1, max: 1, xp: 500, notable: true },
        ],
    },
    {
        name: 'Creekbank', required_level: 9, base_timer: 55, min_timer: 30, display_order: 3,
        description: 'The soft, wet margin of a running creek, crowded with reeds and water-herbs.',
        drop_table: [
            { itemName: 'Watercress', weight: 120, min: 1, max: 3, xp: 32 },
            { itemName: 'Wild Mint', weight: 110, min: 1, max: 3, xp: 30 },
            { itemName: 'Cattail Root', weight: 95, min: 1, max: 2, xp: 32 },
            { itemName: 'Reeds', weight: 100, min: 2, max: 5, xp: 27 },
            { itemName: 'Meadowsweet', weight: 45, min: 1, max: 2, xp: 48 },
            { itemName: 'Willow Bark', weight: 40, min: 1, max: 2, xp: 80, notable: true },
            { itemName: 'Frogspawn', weight: 4, min: 1, max: 1, xp: 400, notable: true },
            { itemName: 'Wisp Cap', weight: 2, min: 1, max: 1, xp: 600, notable: true },
        ],
    },
    {
        name: 'Bramble Thicket', required_level: 13, base_timer: 60, min_timer: 32, display_order: 4,
        description: 'A dense, thorny tangle of hedgerow. Much of its bounty guards itself — gloves are wanted here.',
        drop_table: [
            { itemName: 'Blackberries', weight: 110, min: 1, max: 3, xp: 35 },
            { itemName: 'Raspberries', weight: 110, min: 1, max: 3, xp: 35 },
            { itemName: 'Rosehips', weight: 90, min: 1, max: 2, xp: 36 },
            { itemName: 'Hawthorn Haw', weight: 45, min: 1, max: 3, xp: 58 },
            { itemName: 'Stinging Nettle', weight: 80, min: 1, max: 3, xp: 40, requiresGloves: true },
            { itemName: 'Bramble Vine', weight: 70, min: 1, max: 2, xp: 36, requiresGloves: true },
            { itemName: 'Sloe Berries', weight: 40, min: 1, max: 2, xp: 66, requiresGloves: true },
            { itemName: 'Elderberry', weight: 35, min: 1, max: 2, xp: 90, requiresGloves: true, notable: true },
            { itemName: 'Blackthorn Sprig', weight: 5, min: 1, max: 1, xp: 450, requiresGloves: true, notable: true },
            { itemName: 'Hedgewitch\'s Sprig', weight: 2, min: 1, max: 1, xp: 650, requiresGloves: true, notable: true },
        ],
    },
];

const RECIPES = [
    {
        skill: 'Crafting', name: 'Weave Foraging Basket', output_item_name: 'Foraging Basket', output_qty: 1,
        inputs: JSON.stringify([{ itemName: 'Reeds', qty: 8 }]),
        required_level: 1, timer_seconds: 60, xp: 40, station: null, is_active: true,
    },
    {
        skill: 'Crafting', name: 'Stitch Buckskin Foraging Gloves', output_item_name: 'Buckskin Foraging Gloves', output_qty: 1,
        inputs: JSON.stringify([{ itemName: 'Buckskin', qty: 2 }, { itemName: 'Leather Strips', qty: 2 }]),
        required_level: 1, timer_seconds: 60, xp: 50, station: null, is_active: true,
    },
    {
        skill: 'Smithing', name: 'Forge Ambren Foraging Knife', output_item_name: 'Ambren Foraging Knife', output_qty: 1,
        inputs: JSON.stringify([{ itemName: 'Ambren Ingot', qty: 1 }, { itemName: 'Lanai Planks', qty: 1 }]),
        required_level: 1, timer_seconds: 45, xp: 30, station: null, is_active: true,
    },
];

export async function up(knex: Knex): Promise<void> {
    // Items — upsert by name.
    for (const item of ITEMS) {
        const existing = await knex('items').where({ name: item.name }).first();
        if (existing) await knex('items').where({ id: existing.id }).update(item);
        else await knex('items').insert(item);
    }

    // Habitats — need Lanaivale.
    const lanaivale = await knex('locations').where({ name: 'Lanaivale' }).first();
    if (!lanaivale) throw new Error('seed_foraging_content: Lanaivale location not found');

    for (const h of HABITATS) {
        const row = {
            location_id: lanaivale.id,
            name: h.name,
            description: h.description,
            required_level: h.required_level,
            base_timer: h.base_timer,
            min_timer: h.min_timer,
            display_order: h.display_order,
            drop_table: JSON.stringify(h.drop_table),
            is_active: true,
        };
        const existing = await knex('foraging_habitats')
            .where({ location_id: lanaivale.id, name: h.name }).first();
        if (existing) await knex('foraging_habitats').where({ id: existing.id }).update(row);
        else await knex('foraging_habitats').insert(row);
    }

    // Tool recipes — upsert by name.
    for (const recipe of RECIPES) {
        const existing = await knex('recipes').where({ name: recipe.name }).first();
        if (existing) await knex('recipes').where({ id: existing.id }).update(recipe);
        else await knex('recipes').insert(recipe);
    }

    // Light the skill up.
    await knex('skills').where({ name: 'Foraging' }).update({ is_implemented: true });
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').whereIn('name', RECIPES.map(r => r.name)).delete();
    const lanaivale = await knex('locations').where({ name: 'Lanaivale' }).first();
    if (lanaivale) {
        await knex('foraging_habitats')
            .where({ location_id: lanaivale.id })
            .whereIn('name', HABITATS.map(h => h.name))
            .delete();
    }
    await knex('skills').where({ name: 'Foraging' }).update({ is_implemented: false });
    // Items are deliberately left in place (players may hold them).
}
