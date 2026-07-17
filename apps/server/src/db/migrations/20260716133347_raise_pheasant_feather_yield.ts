import type { Knex } from 'knex';

// The arrow economy was feather-starved: at 1 snare a hunter got 30% of the
// feathers their own hunting burned, and needed Hunting 37 (4 snares) to break
// even. 4-8 feathers/pheasant was also just unrealistic — a bird carries ~20
// usable flight feathers, and one goose wing historically fletched ~10 arrows.
// 12-20 puts one snare at 81% of demand and two at 161%.
// Long term, Husbandry (geese) is the volume source; wild birds stay a trickle.

export async function up(knex: Knex): Promise<void> {
    const pheasant = await knex('trap_targets').where({ name: 'Pheasant' }).first();
    if (!pheasant) throw new Error('raise_pheasant_feather_yield: Pheasant target not found');
    await knex('trap_targets').where({ id: pheasant.id }).update({
        drop_table: JSON.stringify([
            { itemName: 'Pheasant Meat', min: 1, max: 1, chance: 100, perishable: true },
            { itemName: 'Feathers', min: 12, max: 20, chance: 100 },
            { itemName: 'Prized Plume', min: 1, max: 1, chance: 5, notable: true },
        ]),
    });
}

export async function down(knex: Knex): Promise<void> {
    const pheasant = await knex('trap_targets').where({ name: 'Pheasant' }).first();
    if (!pheasant) return;
    await knex('trap_targets').where({ id: pheasant.id }).update({
        drop_table: JSON.stringify([
            { itemName: 'Pheasant Meat', min: 1, max: 1, chance: 100, perishable: true },
            { itemName: 'Feathers', min: 4, max: 8, chance: 100 },
            { itemName: 'Prized Plume', min: 1, max: 1, chance: 5, notable: true },
        ]),
    });
}