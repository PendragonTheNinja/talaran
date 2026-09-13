import type { Knex } from 'knex';

/**
 * Forward-fix for 20260813120000_workstation_slots.
 *
 * Two corrections:
 *
 *   1. Slot definitions matched tools by explicit item NAME, which would need a
 *      row edit per slot per metal tier. Every tool already carries a subtype
 *      (anvil, hammer, tongs, saw, plane, sawhorse), and pickaxes and hatchets
 *      already span all nine metals under one subtype, so slots now match on
 *      subtype and future tiers need no data change at all.
 *
 *   2. Five Smithing recipes shipped with station NULL and could be forged
 *      anywhere at full speed. They now require a forge like every other
 *      smithing recipe.
 *
 * IDEMPOTENT. Safe whether the original ran with name lists or subtypes, and
 * safe to run twice.
 */

const SLOT_SUBTYPE: Record<string, string> = {
    anvil: 'anvil',
    hammer: 'hammer',
    tongs: 'tongs',
    sawhorse: 'sawhorse',
    saw: 'saw',
    plane: 'plane',
    hearth: 'hearth',
    cauldron: 'cauldron',
    skillet: 'skillet',
    cooking_knife: 'cooking_knife',
    meat_cleaver: 'meat_cleaver',
    ladle: 'ladle',
    flesh_hook: 'flesh_hook',
    mortar_pestle: 'mortar_pestle',
    flower: 'flower',
};

const FORGE_ONLY = [
    'Fletch Arrows',
    'Forge Ambren Foraging Knife',
    'Hammer Ambren Nails',
    'Forge Ambren Hoe',
    'Forge Ambren Butchering Knife',
];

export async function up(knex: Knex): Promise<void> {
    // 1. Match by subtype, drop the name lists.
    for (const [slot, subtype] of Object.entries(SLOT_SUBTYPE)) {
        await knex('workstation_slot_types')
            .where({ slot })
            .update({ accepts_subtype: subtype, accepts_names: null });
    }

    // 2. Per-recipe tool requirements. Re-applied here so the fix stands alone
    //    even if the original ran before these were added.
    //    Tool recipes must never require their own output (CLAUDE.md section 4):
    //    an anvil is forged with hammer and tongs, a sawhorse is built with a saw.
    const tools = (...slots: string[]) => JSON.stringify(slots);
    const perRecipe: Array<[string, string]> = [
        ['Ambren Anvil', tools('hammer', 'tongs')],
        ['Ambren Hammer', tools('anvil', 'tongs')],
        ['Ambren Tongs', tools('anvil', 'hammer')],
        ['Ambren Pickaxe', tools('anvil', 'hammer', 'tongs')],
        ['Ambren Hatchet', tools('anvil', 'hammer', 'tongs')],
        ['Ambren Saw', tools('anvil', 'hammer', 'tongs')],
        ['Ambren Plane', tools('anvil', 'hammer', 'tongs')],
        ['Lanai Sawhorse', tools('saw')],
        ['Split Arrow Shafts', tools('saw')],
        ['Lanai Tool Rod', tools('saw', 'sawhorse')],
        ['Lanai Staff', tools('saw', 'sawhorse', 'plane')],
        ['Lanai Mallet', tools('saw', 'sawhorse', 'plane')],
        ['Build Tanning Rack', tools('saw', 'sawhorse')],
        ['Build Tanning Barrel', tools('saw', 'sawhorse')],
        ['Raise a Bucket', tools('saw', 'sawhorse', 'plane')],
    ];
    for (const [name, required] of perRecipe) {
        await knex('recipes').where({ name }).update({ required_tools: required });
    }

    // Anything still unset needs no tools: tanning is passive at a rack or
    // barrel, and the hand-work recipes need nothing.
    await knex('recipes').whereNull('required_tools').update({ required_tools: '[]' });

    // 3. BEHAVIOUR CHANGE: these five become forge-gated, so a player without a
    //    workstation now pays the usual away-from-station penalty on them.
    //    Note this pulls Ambren Foraging Knife and Ambren Butchering Knife
    //    behind a Smithing station, which Foraging and Hunting did not
    //    previously depend on.
    await knex('recipes').whereIn('name', FORGE_ONLY).update({
        station: 'smithing',
        required_tools: JSON.stringify(['anvil', 'hammer', 'tongs']),
    });
}

export async function down(knex: Knex): Promise<void> {
    // Put the five recipes back to station-less.
    await knex('recipes').whereIn('name', FORGE_ONLY).update({
        station: null,
        required_tools: '[]',
    });

    // Restore name matching for the slots that had it.
    const names: Record<string, string[]> = {
        anvil: ['Ambren Anvil'],
        hammer: ['Ambren Hammer'],
        tongs: ['Ambren Tongs'],
        sawhorse: ['Lanai Sawhorse'],
        saw: ['Ambren Saw'],
        plane: ['Ambren Plane'],
    };
    for (const [slot, list] of Object.entries(names)) {
        await knex('workstation_slot_types')
            .where({ slot })
            .update({ accepts_subtype: null, accepts_names: JSON.stringify(list) });
    }
}
