import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Raw food (Nathan, 2026-10-16, from a forum post). Things you would eat as
// they come, a carrot pulled from the ground, a handful of blackberries, can
// now be eaten without cooking. Anything with heal_amount above 0 and no buff
// is food (isFightFood in services/combatFights.ts), from the pack or mid-fight,
// so this is data only.
//
// Priced by the work behind each one:
//   • Grown or raised (a seed foraged, sown, waited on and pulled; an egg from
//     a kept hen): 40% of what a cooked dish of the same level heals, the
//     direct-cooking curve of about 8 + 2.5 x level (20260905070000), rounded.
//   • Foraged and eaten on the spot: 2 or 3, whatever the level.
// Cooking a thing always mends more than eating it raw, so the Cooking skill
// keeps its point.
//
// Left out on purpose: elderberries and morels (poisonous raw), herbs, garlic,
// grain and flax (not food on their own). Wild Strawberry, wild Raspberries and
// Sloe Berries no longer drop anywhere (20260722030000, 20260722080000).
//
// down() takes the heal back off: none of these healed before.

const RAW_FOOD: Array<[name: string, heal: number]> = [
    // grown or raised
    ['Carrot', 4],      // Farming 1
    ['Onion', 4],       // Farming 1
    ['Egg', 4],         // hens, Husbandry 1
    ['Turnip', 5],      // Farming 2
    ['Peas', 10],       // Farming 7
    ['Strawberry', 13], // Farming 10
    ['Raspberry', 15],  // Farming 12
    // foraged
    ['Hazelnuts', 2],
    ['Blackberries', 3],
    ['Rosehips', 3],
];

export async function up(knex: Knex): Promise<void> {
    // A fresh database before content:import (lib/migrationContent.ts).
    if (!(await hasContent(knex))) return;

    for (const [name, heal] of RAW_FOOD) {
        const item = await knex('items').where({ name }).first();
        if (!item) throw new Error(`raw_food: no item named ${name}`);
        if (item.buff_effect) throw new Error(`raw_food: ${name} carries a buff, so a heal would not make it food`);
        await knex('items').where({ id: item.id }).update({ heal_amount: heal });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex('items').whereIn('name', RAW_FOOD.map(([name]) => name)).update({ heal_amount: null });
}
