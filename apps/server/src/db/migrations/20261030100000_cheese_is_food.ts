import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Cheese is food (Nathan, 2026-10-30): left out of the raw-food pass
// (20261016150000), which covered things eaten as they come. Cheese is not raw;
// it is made (Press Cheese, Husbandry 12), so it mends what a cooked dish of its
// level does on the direct-cooking curve, about 8 + 2.5 x level: 38. Anything
// with heal_amount above 0 and no buff is food (isFightFood), from the pack or
// mid-fight, so this is data only. Butter stays out: not a meal on its own.

const FOOD: Array<[name: string, heal: number]> = [
    ['Cheese', 38],
];

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    for (const [name, heal] of FOOD) {
        const item = await knex('items').where({ name }).first();
        if (!item) throw new Error(`cheese_is_food: no item named ${name}`);
        if (item.buff_effect) throw new Error(`cheese_is_food: ${name} carries a buff, so a heal would not make it food`);
        await knex('items').where({ id: item.id }).update({ heal_amount: heal });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex('items').whereIn('name', FOOD.map(([name]) => name)).update({ heal_amount: null });
}
