import type { Knex } from 'knex';

// Leather gets consumers.
//
// Tanning cowhide already worked — it is the same Tanning Rack, the same 6h soak
// and the same Lanai Bark tannins as the buckskin line. What was missing was
// anything to DO with the leather afterwards, so a player could take a cow all
// the way through slaughter and tanning and finish holding a dead-end item.
//
// Three changes:
//
// 0. TAN COWHIDE NEVER APPEARED AT THE RACK. It shipped with
//    station: 'Tanning Rack' — the display name — copied from the original
//    tanning seed. But 20260716025233 had already normalised `station` to a
//    workstations.type ('tanning', matching 'carpentry'/'smithing') precisely
//    because a display name "could never match a row". services/tanning.ts
//    queries station: 'tanning', so the recipe existed and was simply invisible.
//
// 1. Cowhide yields 3 leather, not 2. Buckskin runs 1/2/3 for deer/boar/sloth;
//    a cow is a big animal and, per CLAUDE.md §4, the farmed side of a material
//    pair is the volume side. Cattle should out-yield the wild hides, not sit
//    mid-table among them.
//
// 2. FORAGING GLOVES become obtainable. Migration 20260721040000 deleted the
//    placeholder Buckskin recipe with a note: "Gloves will be leather-worked in
//    Husbandry later, not Buckskin." This is that later. The item is renamed to
//    match — nothing references it by name, only by subtype `foraging_gloves` —
//    and the Bramble Thicket's glove-gated rows finally open.
//
// 3. LEATHER BOOTS, new. `services/travel.ts` already reads agility_reduction off
//    the feet slot; nothing has ever occupied it. The Lanai Staff gives 0.03 in
//    the mainhand, so boots at 0.05 make a walker's kit worth assembling, and the
//    two stack. Both close a share of the gap Agility has not already closed, so
//    they never push through the floor.

const BOOTS = {
    name: 'Leather Boots',
    type: 'armor', subtype: 'boots', tier: 1, quality: null,
    slot: 'feet', level_required: 1,
    agility_reduction: 0.05,
    description: 'Stitched and double-soled. The road is just as long, but it stops arguing with your feet.',
    stackable: true,
};

const RECIPES = [
    {
        skill: 'Crafting', for_skill: 'Foraging', name: 'Stitch Leather Foraging Gloves',
        output_item_name: 'Leather Foraging Gloves', output_qty: 1,
        inputs: JSON.stringify([{ itemName: 'Leather', qty: 3 }, { itemName: 'Leather Strips', qty: 2 }]),
        required_level: 5, timer_seconds: 45, xp: 33, station: null, mode: 'active', is_active: true,
        flavor_text: 'You cut, stitch and turn them, and the seams end up on the inside where they belong.',
    },
    {
        skill: 'Crafting', for_skill: 'Agility', name: 'Stitch Leather Boots',
        output_item_name: 'Leather Boots', output_qty: 1,
        inputs: JSON.stringify([{ itemName: 'Leather', qty: 5 }, { itemName: 'Leather Strips', qty: 3 }]),
        required_level: 9, timer_seconds: 70, xp: 55, station: null, mode: 'active', is_active: true,
        flavor_text: 'Sole, upper, and a great deal of waxed thread. They will outlast the roads.',
    },
];

export async function up(knex: Knex): Promise<void> {
    // 0 + 1. Make the recipe visible at the rack, and raise the yield.
    const tan = await knex('recipes').where({ name: 'Tan Cowhide' }).first();
    if (!tan) throw new Error('leather_consumers: Tan Cowhide recipe not found');
    await knex('recipes').where({ id: tan.id }).update({
        station: 'tanning',
        mode: 'passive',
        output_qty: 3,
    });

    // 2. Gloves: rename in place. Referenced only by subtype, so this is safe,
    //    and it keeps the gloves any player already owns working.
    const gloves = await knex('items').where({ name: 'Buckskin Foraging Gloves' }).first();
    if (gloves) {
        await knex('items').where({ id: gloves.id }).update({
            name: 'Leather Foraging Gloves',
            slot: 'hands',
            description: 'Supple leather gloves, seams turned inward. Nettles, brambles, and thorns hold no sting for hands so covered.',
        });
    }

    // 3. Boots
    const existingBoots = await knex('items').where({ name: BOOTS.name }).first();
    if (existingBoots) await knex('items').where({ id: existingBoots.id }).update(BOOTS);
    else await knex('items').insert(BOOTS);

    for (const recipe of RECIPES) {
        const existing = await knex('recipes').where({ name: recipe.name }).first();
        if (existing) await knex('recipes').where({ id: existing.id }).update(recipe);
        else await knex('recipes').insert(recipe);
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').whereIn('name', RECIPES.map((r) => r.name)).delete();
    await knex('recipes').where({ name: 'Tan Cowhide' }).update({ output_qty: 2, station: 'Tanning Rack' });
    await knex('items').where({ name: 'Leather Foraging Gloves' }).update({
        name: 'Buckskin Foraging Gloves',
        slot: null,
        description: 'Supple buckskin gloves. Nettles, brambles, and thorns hold no sting for hands so covered.',
    });
    // Boots left in place — players may be wearing them.
}
