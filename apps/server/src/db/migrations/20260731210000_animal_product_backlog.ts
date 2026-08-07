import type { Knex } from 'knex';

// Animals bank what they make instead of stopping at one.
//
// A hen that lays an egg and then does nothing until you come and take it is a
// hen that needs visiting every forty-five minutes, and six of them is a chore
// rather than a farm. Now each animal keeps producing into a small backlog and
// stops only when that fills.
//
// The cap is what keeps it honest: production is wasted once an animal is full,
// so a farm still rewards being visited — it just does not demand a timer.
// Nothing else changes about the rate, so the XP-per-hour parity with Farming
// established in the husbandry sim still holds; the same output simply arrives in
// batches instead of one at a time.
//
// Caps are set so a full animal is roughly half a feeding window (12h) behind:
// long enough that two visits a day collects everything, short enough that a
// farm left for a week has plainly wasted something.

const CAPS: Record<string, number> = {
    Chicken: 8,     // 45m eggs -> full at 6h
    Cow: 4,         // 3h milk  -> full at 12h
    Pig: 3,         // 4h truffle rolls -> full at 12h
};

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('animal_species', 'product_max_stored'))) {
        await knex.schema.alterTable('animal_species', (t) => {
            t.integer('product_max_stored').unsigned().notNullable().defaultTo(4);
        });
    }

    for (const [name, cap] of Object.entries(CAPS)) {
        await knex('animal_species').where({ name }).update({ product_max_stored: cap });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('animal_species', 'product_max_stored')) {
        await knex.schema.alterTable('animal_species', (t) => t.dropColumn('product_max_stored'));
    }
}
