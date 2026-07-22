import type { Knex } from 'knex';

// Foraging balance pass. The first cut shipped with woodcutting-fast timers
// (6-8s) and XP tuned for them — ~3-4x over the gathering band. This retunes the
// four Lanaivale habitats to the woodcutting cadence (Lanai Tree = 45s/28xp @L1,
// Old Growth = 60s @L13) and sets per-find XP so each habitat's WEIGHTED-AVERAGE
// lands on band (gathering policy, ×1.0, ×1.10 unlock dip). Commons sit near band;
// notable rares are big round pops whose low weight barely moves the average.
// Update-by-(location,name); idempotent.

const HABITATS = [
    {
        name: 'Sunlit Meadow', base_timer: 45, min_timer: 25,
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
        name: 'Forest Floor', base_timer: 50, min_timer: 27,
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
        name: 'Creekbank', base_timer: 55, min_timer: 30,
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
        name: 'Bramble Thicket', base_timer: 60, min_timer: 32,
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

export async function up(knex: Knex): Promise<void> {
    const lanaivale = await knex('locations').where({ name: 'Lanaivale' }).first();
    if (!lanaivale) throw new Error('retune_foraging_balance: Lanaivale not found');

    for (const h of HABITATS) {
        await knex('foraging_habitats')
            .where({ location_id: lanaivale.id, name: h.name })
            .update({
                base_timer: h.base_timer,
                min_timer: h.min_timer,
                drop_table: JSON.stringify(h.drop_table),
            });
    }
}

export async function down(): Promise<void> {
    // No-op: the previous values were an unbalanced first cut; nothing to restore to.
}
