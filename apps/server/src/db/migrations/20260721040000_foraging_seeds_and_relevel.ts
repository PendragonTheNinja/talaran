import type { Knex } from 'knex';

// Foraging → farming prep. Re-levels the four Lanaivale habitats to 1/4/7/10 (all
// under the old L13 ceiling), swaps the lowest-use "chaff" drops for crop SEEDS,
// removes Four-Leaf Clover (reserved as an Agility find, a Syrnia walking-callback),
// keeps Forest Floor as pure wild food (no seeds), and rebalances every table's
// weighted-average XP to the gathering band for its new level. Seeds are inert for
// now — the farming skill will consume them. Update-by-name; idempotent.

const SEED_ITEMS = [
    { name: 'Carrot Seeds', type: 'material', subtype: 'seed', tier: 1, quality: null, slot: null, level_required: 1, description: 'A pinch of fine carrot seed from a bolted wild plant. Sow it in tilled ground.', stackable: true },
    { name: 'Onion Seeds', type: 'material', subtype: 'seed', tier: 1, quality: null, slot: null, level_required: 1, description: 'Small black onion seeds. Sown in good soil, they raise a crop of onions.', stackable: true },
    { name: 'Turnip Seeds', type: 'material', subtype: 'seed', tier: 1, quality: null, slot: null, level_required: 1, description: 'A hardy, fast root crop — good on the table and better as fodder.', stackable: true },
    { name: 'Wild Grain', type: 'material', subtype: 'grain', tier: 1, quality: null, slot: null, level_required: 1, description: 'A handful of wild grain heads. Sown it yields wheat or barley; left whole it feeds livestock.', stackable: true },
    { name: 'Flax Seeds', type: 'material', subtype: 'seed', tier: 1, quality: null, slot: null, level_required: 1, description: 'Flat brown flax seed. Grown for its long fibres — and its oil.', stackable: true },
    { name: 'Pea Seeds', type: 'material', subtype: 'seed', tier: 1, quality: null, slot: null, level_required: 1, description: 'Dried peas for sowing. The plant feeds the soil as much as the pot.', stackable: true },
    { name: 'Strawberry Runner', type: 'material', subtype: 'seed', tier: 1, quality: null, slot: null, level_required: 1, description: 'A rooted runner pinched from a wild strawberry, ready to replant.', stackable: true },
    { name: 'Raspberry Cane', type: 'material', subtype: 'seed', tier: 1, quality: null, slot: null, level_required: 1, description: 'A cutting of wild raspberry cane that will root and fruit for years.', stackable: true },
];

const HABITATS = [
    {
        name: 'Sunlit Meadow', required_level: 1, base_timer: 45, min_timer: 25,
        scene_text: 'You move through a sunlit meadow, gathering as you go.',
        drop_table: [
            { itemName: 'Chamomile', weight: 120, min: 1, max: 3, xp: 23 },
            { itemName: 'Dandelion', weight: 120, min: 1, max: 3, xp: 23 },
            { itemName: 'Wild Strawberry', weight: 80, min: 1, max: 2, xp: 28 },
            { itemName: 'Wild Thyme', weight: 45, min: 1, max: 2, xp: 35 },
            { itemName: 'Lavender', weight: 40, min: 1, max: 2, xp: 39 },
            { itemName: 'Carrot Seeds', weight: 50, min: 1, max: 2, xp: 24 },
            { itemName: 'Onion Seeds', weight: 50, min: 1, max: 2, xp: 24 },
            { itemName: 'Turnip Seeds', weight: 40, min: 1, max: 2, xp: 25 },
            { itemName: 'Wild Grain', weight: 45, min: 1, max: 3, xp: 26 },
            { itemName: 'Faelight Bloom', weight: 2, min: 1, max: 1, xp: 450, notable: true },
        ],
    },
    {
        name: 'Forest Floor', required_level: 4, base_timer: 50, min_timer: 27,
        scene_text: 'You forage across the shaded forest floor, turning the leaf-litter as you go.',
        drop_table: [
            { itemName: 'Chanterelle Mushroom', weight: 110, min: 1, max: 2, xp: 23 },
            { itemName: 'Wild Garlic', weight: 110, min: 1, max: 3, xp: 22 },
            { itemName: 'Acorns', weight: 100, min: 2, max: 4, xp: 20 },
            { itemName: 'Fiddlehead Ferns', weight: 90, min: 1, max: 3, xp: 24 },
            { itemName: 'Hazelnuts', weight: 50, min: 1, max: 3, xp: 31 },
            { itemName: 'Morel Mushroom', weight: 35, min: 1, max: 1, xp: 42 },
            { itemName: 'Oak Gall', weight: 20, min: 1, max: 2, xp: 90, notable: true },
            { itemName: 'Witch\'s Butter', weight: 5, min: 1, max: 1, xp: 350, notable: true },
            { itemName: 'Ghost Pipe', weight: 3, min: 1, max: 1, xp: 500, notable: true },
        ],
    },
    {
        name: 'Creekbank', required_level: 7, base_timer: 55, min_timer: 30,
        scene_text: 'You work along the creekbank, gathering among the reeds and water-herbs.',
        drop_table: [
            { itemName: 'Watercress', weight: 120, min: 1, max: 3, xp: 29 },
            { itemName: 'Wild Mint', weight: 110, min: 1, max: 3, xp: 28 },
            { itemName: 'Reeds', weight: 100, min: 2, max: 5, xp: 25 },
            { itemName: 'Meadowsweet', weight: 45, min: 1, max: 2, xp: 44 },
            { itemName: 'Flax Seeds', weight: 50, min: 1, max: 2, xp: 32 },
            { itemName: 'Pea Seeds', weight: 45, min: 1, max: 2, xp: 31 },
            { itemName: 'Willow Bark', weight: 40, min: 1, max: 2, xp: 80, notable: true },
            { itemName: 'Frogspawn', weight: 4, min: 1, max: 1, xp: 400, notable: true },
            { itemName: 'Wisp Cap', weight: 2, min: 1, max: 1, xp: 600, notable: true },
        ],
    },
    {
        name: 'Bramble Thicket', required_level: 10, base_timer: 60, min_timer: 32,
        scene_text: 'You pick your way through a bramble thicket, gathering what you can reach.',
        drop_table: [
            { itemName: 'Blackberries', weight: 110, min: 1, max: 3, xp: 35 },
            { itemName: 'Raspberries', weight: 110, min: 1, max: 3, xp: 35 },
            { itemName: 'Rosehips', weight: 90, min: 1, max: 2, xp: 36 },
            { itemName: 'Strawberry Runner', weight: 45, min: 1, max: 1, xp: 35 },
            { itemName: 'Raspberry Cane', weight: 40, min: 1, max: 1, xp: 36 },
            { itemName: 'Stinging Nettle', weight: 80, min: 1, max: 3, xp: 39, requiresGloves: true },
            { itemName: 'Bramble Vine', weight: 70, min: 1, max: 2, xp: 36, requiresGloves: true },
            { itemName: 'Sloe Berries', weight: 40, min: 1, max: 2, xp: 55, requiresGloves: true },
            { itemName: 'Elderberry', weight: 35, min: 1, max: 2, xp: 90, requiresGloves: true, notable: true },
            { itemName: 'Blackthorn Sprig', weight: 5, min: 1, max: 1, xp: 450, requiresGloves: true, notable: true },
            { itemName: 'Hedgewitch\'s Sprig', weight: 2, min: 1, max: 1, xp: 650, requiresGloves: true, notable: true },
        ],
    },
];

export async function up(knex: Knex): Promise<void> {
    // Per-habitat scene line (natural prose, not the proper-noun name).
    if (!(await knex.schema.hasColumn('foraging_habitats', 'scene_text'))) {
        await knex.schema.alterTable('foraging_habitats', (t) => {
            t.string('scene_text', 300).nullable();
        });
    }

    for (const item of SEED_ITEMS) {
        const existing = await knex('items').where({ name: item.name }).first();
        if (existing) await knex('items').where({ id: existing.id }).update(item);
        else await knex('items').insert(item);
    }

    const lanaivale = await knex('locations').where({ name: 'Lanaivale' }).first();
    if (!lanaivale) throw new Error('foraging_seeds_and_relevel: Lanaivale not found');

    for (const h of HABITATS) {
        await knex('foraging_habitats')
            .where({ location_id: lanaivale.id, name: h.name })
            .update({
                required_level: h.required_level,
                base_timer: h.base_timer,
                min_timer: h.min_timer,
                scene_text: h.scene_text,
                drop_table: JSON.stringify(h.drop_table),
            });
    }

    // Gloves will be leather-worked in Husbandry later, not Buckskin — drop the
    // placeholder recipe so gloves stay unavailable until then. The item remains
    // defined; the Bramble Thicket's glove-gated rows simply won't drop yet.
    await knex('recipes').where({ name: 'Stitch Buckskin Foraging Gloves' }).delete();
}

export async function down(): Promise<void> {
    // No-op: the prior state was a pre-farming intermediate; nothing to restore to.
}
