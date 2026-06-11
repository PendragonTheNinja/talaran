import type { Knex } from 'knex';

const NEW_ITEMS = [
    // Planks — sawn from logs, mirroring the 5 wood tiers
    { name: 'Lanai Planks', type: 'plank', subtype: 'lanai', tier: 1, quality: null, slot: null, level_required: 1, description: 'Planks of Lanai wood, sawn smooth and ready for the workbench.', stackable: true },
    { name: 'Hatch Planks', type: 'plank', subtype: 'hatch', tier: 2, quality: null, slot: null, level_required: 1, description: 'Sturdy Hatch planks, sawn and squared.', stackable: true },
    { name: 'Bearn Planks', type: 'plank', subtype: 'bearn', tier: 3, quality: null, slot: null, level_required: 1, description: 'Heavy Bearn planks with a tight, even grain.', stackable: true },
    { name: 'Mirrith Planks', type: 'plank', subtype: 'mirrith', tier: 4, quality: null, slot: null, level_required: 1, description: 'Pale Mirrith planks, prized for fine work.', stackable: true },
    { name: 'Craxial Planks', type: 'plank', subtype: 'craxial', tier: 5, quality: null, slot: null, level_required: 1, description: 'Dense Craxial planks. Remarkably heavy, and remarkably strong.', stackable: true },

    // Carpentry workstation tools (consumed into the workstation, like Anvil/Hammer/Tongs)
    { name: 'Lanai Sawhorse', type: 'tool', subtype: 'sawhorse', tier: 1, quality: null, slot: null, level_required: 1, description: "A sturdy sawhorse of Lanai wood — the surface of a carpenter's workstation.", stackable: false },
    { name: 'Ambren Saw', type: 'tool', subtype: 'saw', tier: 1, quality: null, slot: null, level_required: 1, description: 'A saw with an Ambren blade and a Lanai handle. Part of a Carpentry workstation.', stackable: false },
    { name: 'Ambren Plane', type: 'tool', subtype: 'plane', tier: 1, quality: null, slot: null, level_required: 1, description: 'A plane with an Ambren blade and a Lanai handle. Part of a Carpentry workstation.', stackable: false },
];

export async function up(knex: Knex): Promise<void> {
    // 1. Insert new items if absent (idempotent — safe on the live DB).
    for (const item of NEW_ITEMS) {
        const exists = await knex('items').where({ name: item.name }).first();
        if (!exists) await knex('items').insert(item);
    }

    // 2. Ensure the Carpentry skill row exists on live.
    let carpentry = await knex('skills').where({ name: 'Carpentry' }).first();
    if (!carpentry) {
        await knex('skills').insert({
            name: 'Carpentry',
            type: 'crafting',
            description: 'Build structures, furniture, and wooden equipment.',
        });
        carpentry = await knex('skills').where({ name: 'Carpentry' }).first();
    }

    // 3. Backfill a Carpentry skill row for every existing player who lacks one.
    const players = await knex('players').select('id');
    for (const p of players) {
        const has = await knex('player_skills')
            .where({ player_id: p.id, skill_id: carpentry.id })
            .first();
        if (!has) {
            await knex('player_skills').insert({ player_id: p.id, skill_id: carpentry.id, xp: 0 });
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    // Remove only the items this migration added; leave the skill + backfill (harmless).
    const names = NEW_ITEMS.map((i) => i.name);
    await knex('player_inventory')
        .whereIn('item_id', knex('items').select('id').whereIn('name', names))
        .del();
    await knex('items').whereIn('name', names).del();
}