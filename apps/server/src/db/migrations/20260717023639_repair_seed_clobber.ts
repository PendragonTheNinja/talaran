import type { Knex } from 'knex';

// REPAIR. seed_trapping_content.ts lost its timestamp prefix via a browser
// download, so knex saw a new migration and ran it LAST (filename order: 's' > '2'),
// after the migrations that corrected its values. It force-wrote:
//   - Fletch Arrows back to planks (undoing add_recipe_flavor_and_arrow_shafts)
//   - the tans to station:null / no bark (undoing fix_tanning_recipe_modes)
//   - Snare trap back to Hunting 5 (undoing fix_trapping_bootstrap)
//   - Pheasant feathers back to 4-8 (undoing raise_pheasant_feather_yield)
// This sets every value explicitly and idempotently. Safe to re-run.

const RECIPES: Record<string, any> = {
    'Tan Deerhide': {
        required_level: 1, timer_seconds: 21600, xp: 25, output_qty: 1,
        station: 'tanning', mode: 'passive', for_skill: 'Crafting',
        inputs: JSON.stringify([
            { itemName: 'Deerhide', qty: 1 },
            { itemName: 'Lanai Bark', qty: 3 },
        ]),
    },
    'Tan Boarhide': {
        required_level: 9, timer_seconds: 21600, xp: 50, output_qty: 2,
        station: 'tanning', mode: 'passive', for_skill: 'Crafting',
        inputs: JSON.stringify([
            { itemName: 'Boarhide', qty: 1 },
            { itemName: 'Lanai Bark', qty: 5 },
        ]),
    },
    'Tan Slothhide': {
        required_level: 17, timer_seconds: 21600, xp: 90, output_qty: 3,
        station: 'tanning', mode: 'passive', for_skill: 'Crafting',
        inputs: JSON.stringify([
            { itemName: 'Slothhide', qty: 1 },
            { itemName: 'Lanai Bark', qty: 8 },
        ]),
    },
    'Fletch Arrows': {
        required_level: 1, timer_seconds: 30, xp: 20, output_qty: 5,
        station: null, mode: 'active', for_skill: 'Hunting',
        flavor_text: 'You are fletching arrows.',
        inputs: JSON.stringify([
            { itemName: 'Lanai Arrow Shafts', qty: 5 },
            { itemName: 'Ambren Ingot', qty: 1 },
            { itemName: 'Feathers', qty: 2 },
        ]),
    },
    'Cut Buckskin Strips': {
        required_level: 1, timer_seconds: 20, xp: 13, output_qty: 3,
        station: null, mode: 'active', for_skill: 'Crafting',
        flavor_text: 'You are cutting buckskin into strips.',
        inputs: JSON.stringify([{ itemName: 'Buckskin', qty: 1 }]),
    },
    'Tie Snare': {
        required_level: 1, timer_seconds: 60, xp: 66, output_qty: 1,
        station: null, mode: 'active', for_skill: 'Hunting',
        flavor_text: 'You are tying a snare.',
        inputs: JSON.stringify([
            { itemName: 'Lanai Planks', qty: 2 },
            { itemName: 'Leather Strips', qty: 2 },
        ]),
    },
};

export async function up(knex: Knex): Promise<void> {
    for (const [name, fields] of Object.entries(RECIPES)) {
        const row = await knex('recipes').where({ name }).first();
        if (!row) throw new Error(`repair_seed_clobber: recipe "${name}" not found`);
        await knex('recipes').where({ id: row.id }).update(fields);
    }

    // Trapping unlocks at Hunting 1 — the snare was always the real gate
    const snare = await knex('trap_types').where({ name: 'Snare' }).first();
    if (!snare) throw new Error('repair_seed_clobber: Snare trap type not found');
    await knex('trap_types').where({ id: snare.id }).update({ required_level: 1 });

    // Pheasants carry ~20 usable flight feathers; 4-8 starved the arrow economy
    const pheasant = await knex('trap_targets').where({ name: 'Pheasant' }).first();
    if (!pheasant) throw new Error('repair_seed_clobber: Pheasant target not found');
    await knex('trap_targets').where({ id: pheasant.id }).update({
        drop_table: JSON.stringify([
            { itemName: 'Pheasant Meat', min: 1, max: 1, chance: 100, perishable: true },
            { itemName: 'Feathers', min: 12, max: 20, chance: 100 },
            { itemName: 'Prized Plume', min: 1, max: 1, chance: 5, notable: true },
        ]),
    });
}

export async function down(knex: Knex): Promise<void> {
    // A repair has no meaningful inverse — the prior state was corrupt.
}