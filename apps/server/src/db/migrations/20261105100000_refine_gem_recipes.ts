import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// "Cut Rough Quartz" made a Cut, Polished or Flawless Quartz by a roll
// (recipes.grade_outputs), but its card read "Cut Quartz", the name of one
// outcome, over that one stone's picture (forum, 2026-11-05). The recipes are
// renamed for what they do, and RecipeList draws a graded recipe's card under
// its own name with every grade it can give, the plainest in front.

const RENAMES = [
    { from: 'Cut Rough Quartz', to: 'Refine Quartz' },
    { from: 'Cut Rough Garnet', to: 'Refine Garnet' },
];

async function rename(knex: Knex, pairs: { from: string; to: string }[]) {
    for (const { from, to } of pairs) {
        if (await knex('recipes').where({ name: to }).first()) continue;   // already renamed
        const n = await knex('recipes').where({ name: from }).update({ name: to });
        if (n !== 1) throw new Error(`refine_gem_recipes: recipe ${from} not found`);
    }
}

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    await rename(knex, RENAMES);
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    await rename(knex, RENAMES.map(r => ({ from: r.to, to: r.from })));
}
