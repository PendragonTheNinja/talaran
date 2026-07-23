import type { Knex } from 'knex';

// Trimming foraging content that had no real job.
//   • Acorn Flour       — a second, worse flour. Only justified if Cooking ever
//                         distinguishes coarse bread from wheat bread; that skill
//                         doesn't exist, so this was speculative. Acorns keep their
//                         use as Husbandry feed.
//   • Sloe Berries      — nothing set it apart from the other hedgerow berries.
//   • Bramble Vine      — a third cordage fibre. Reeds already do basketry and Hemp
//                         will do rope.
//   • Oak Gall          — added for iron-gall ink and a scribing skill that isn't
//                         planned. Lovely folklore, no purpose.
//   • Willow Bark       — there are no willow trees in Talaran (the woods are Lanai,
//                         Bearn, Craxial, Hatch, Mirrith), and Lanai Bark already
//                         covers bark as a tanning material. Wrong world, and a
//                         duplicate besides.
// Affected habitats are re-tuned so their weighted-average XP stays on band.
// The items themselves stay in the table — players may hold them.

const HABITATS = [
    {
        name: 'Forest Floor',
        drop_table: [
            { itemName: 'Chanterelle Mushroom', weight: 110, min: 1, max: 2, xp: 25 },
            { itemName: 'Garlic Cloves', weight: 110, min: 1, max: 3, xp: 24 },
            { itemName: 'Acorns', weight: 100, min: 2, max: 4, xp: 22 },
            { itemName: 'Fiddlehead Ferns', weight: 90, min: 1, max: 3, xp: 26 },
            { itemName: 'Hazelnuts', weight: 50, min: 1, max: 3, xp: 34 },
            { itemName: 'Morel Mushroom', weight: 35, min: 1, max: 1, xp: 46 },
            { itemName: 'Witch\'s Butter', weight: 5, min: 1, max: 1, xp: 350, notable: true },
            { itemName: 'Ghost Pipe', weight: 3, min: 1, max: 1, xp: 500, notable: true },
        ],
    },
    {
        name: 'Creekbank',
        drop_table: [
            { itemName: 'Watercress', weight: 120, min: 1, max: 3, xp: 32 },
            { itemName: 'Wild Mint', weight: 110, min: 1, max: 3, xp: 31 },
            { itemName: 'Reeds', weight: 100, min: 2, max: 5, xp: 28 },
            { itemName: 'Meadowsweet', weight: 45, min: 1, max: 2, xp: 49 },
            { itemName: 'Flax Seeds', weight: 50, min: 1, max: 2, xp: 36 },
            { itemName: 'Pea Seeds', weight: 45, min: 1, max: 2, xp: 35 },
            { itemName: 'Frogspawn', weight: 4, min: 1, max: 1, xp: 400, notable: true },
            { itemName: 'Wisp Cap', weight: 2, min: 1, max: 1, xp: 600, notable: true },
        ],
    },
    {
        name: 'Bramble Thicket',
        drop_table: [
            { itemName: 'Blackberries', weight: 110, min: 1, max: 3, xp: 31 },
            { itemName: 'Rosehips', weight: 90, min: 1, max: 2, xp: 32 },
            { itemName: 'Strawberry Runner', weight: 45, min: 1, max: 1, xp: 31 },
            { itemName: 'Raspberry Cane', weight: 40, min: 1, max: 1, xp: 32 },
            { itemName: 'Stinging Nettle', weight: 80, min: 1, max: 3, xp: 34, requiresGloves: true },
            { itemName: 'Elderberry', weight: 35, min: 1, max: 2, xp: 90, requiresGloves: true, notable: true },
            { itemName: 'Blackthorn Sprig', weight: 5, min: 1, max: 1, xp: 450, requiresGloves: true, notable: true },
            { itemName: 'Hedgewitch\'s Sprig', weight: 2, min: 1, max: 1, xp: 650, requiresGloves: true, notable: true },
        ],
    },
];

export async function up(knex: Knex): Promise<void> {
    await knex('recipes').where({ name: 'Leach and Grind Acorns' }).delete();

    const lanaivale = await knex('locations').where({ name: 'Lanaivale' }).first();
    if (!lanaivale) throw new Error('trim_foraging_items: Lanaivale not found');

    for (const h of HABITATS) {
        await knex('foraging_habitats')
            .where({ location_id: lanaivale.id, name: h.name })
            .update({ drop_table: JSON.stringify(h.drop_table) });
    }
}

export async function down(): Promise<void> {
    // No-op: the prior tables were an untrimmed first cut.
}
