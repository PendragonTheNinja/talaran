import type { Knex } from 'knex';

/**
 * Collect messages belong on the species.
 *
 * They were a ternary on the product name in husbandry.ts, falling through to
 * the pig's line for anything unrecognised. Adding bees therefore produced
 * "Bees roots at the earth and turns up something dark and knuckled", because a
 * hive is not Milk and not Egg, so it got the truffle text with the name
 * swapped in.
 *
 * That is a trap rather than a bug: the next animal added would inherit the
 * same line, and nothing about adding a row to animal_species tells you the
 * flavour lives in a service. Putting the text beside the animal it describes
 * means a new species cannot silently borrow another's voice, and it removes
 * the gendered pronouns that were hardcoded for hens and cows.
 *
 * {name} is substituted with the animal's own name.
 */

const TEXT: Record<string, { collect: string; empty: string; elder: string | null }> = {
    Chicken: {
        collect: 'You lift {name} aside and find what she has been sitting on.',
        empty: '{name} has left you nothing today.',
        elder: 'She is slower about it than she used to be.',
    },
    Cow: {
        collect: 'You settle beside {name} and milk her out.',
        empty: '{name} has nothing to give this morning.',
        elder: 'She is slower about it than she used to be.',
    },
    Pig: {
        collect: '{name} roots at the earth and turns up something dark and knuckled.',
        empty: '{name} snuffles the ground over and turns up nothing today.',
        elder: 'He is slower about it than he used to be.',
    },
    Bees: {
        collect: 'You lift the skep and cut away a heavy slab of comb, capped and dripping.',
        empty: 'The comb is still being drawn. Nothing worth taking yet.',
        // A hive has no age. It is the same colony it always was.
        elder: null,
    },
};

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('animal_species', 'collect_text'))) {
        await knex.schema.alterTable('animal_species', (t) => {
            t.text('collect_text').nullable();
            t.text('collect_empty_text').nullable();
            t.text('elder_note').nullable();
        });
    }

    for (const [name, text] of Object.entries(TEXT)) {
        await knex('animal_species').where({ name }).update({
            collect_text: text.collect,
            collect_empty_text: text.empty,
            elder_note: text.elder,
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('animal_species', 'collect_text')) {
        await knex.schema.alterTable('animal_species', (t) => {
            t.dropColumn('collect_text');
            t.dropColumn('collect_empty_text');
            t.dropColumn('elder_note');
        });
    }
}
