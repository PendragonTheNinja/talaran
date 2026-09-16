import type { Knex } from 'knex';

/**
 * 1.19.1 hotfix.
 *
 * BREADTH FEATS COUNT THEMSELVES NOW. All three asked for "all trades" and
 * checked eleven when there were thirteen, and only one was corrected when
 * Agility and Equitation arrived, so the panel showed a player two different
 * answers to the same question.
 *
 * Hardcoding thirteen would just move the problem to the day combat ships. The
 * new 'breadth_all' kind counts the implemented skills at read time, so the
 * target raises itself and no migration is needed for the next skill. What each
 * feat still owns is its BAR: level 10, 25 or 50.
 *
 * TINDERBOX. Filed under for_skill Smithing, so it sat in the Smithing tab at
 * the forge rather than with the cooking tools it exists to light. Players
 * found it in the manual and not in the game. It is still a Smithing recipe
 * made at an anvil; only the tab it appears under changes.
 */

export async function up(knex: Knex): Promise<void> {
    // criterion_value is unused by breadth_all, but left as a sane fallback in
    // case a future reader treats it as the number.
    const count = Number(
        (await knex('skills').where({ is_active: true, is_implemented: true }).count({ c: '*' }).first())?.c ?? 13,
    );

    for (const slug of ['a-bit-of-everything', 'every-trade-in-talaran', 'jack-of-the-parish']) {
        await knex('feats').where({ slug }).update({
            criterion_kind: 'breadth_all',
            criterion_value: count,
        });
    }

    // "every trade" rather than a number, since the number now moves.
    await knex('feats').where({ slug: 'a-bit-of-everything' })
        .update({ description: 'Reach level 10 in every trade in Talaran.' });
    await knex('feats').where({ slug: 'every-trade-in-talaran' })
        .update({ description: 'Reach level 25 in every trade in Talaran.' });
    await knex('feats').where({ slug: 'jack-of-the-parish' })
        .update({ description: 'Reach level 50 in every trade in Talaran.' });

    await knex('recipes').where({ name: 'Ambren Tinderbox' }).update({ for_skill: 'Cooking' });
}

export async function down(knex: Knex): Promise<void> {
    for (const slug of ['a-bit-of-everything', 'every-trade-in-talaran', 'jack-of-the-parish']) {
        await knex('feats').where({ slug }).update({ criterion_kind: 'breadth', criterion_value: 11 });
    }
    await knex('recipes').where({ name: 'Ambren Tinderbox' }).update({ for_skill: 'Smithing' });
}
