import type { Knex } from 'knex';

/**
 * Records, and a correction.
 *
 * MILESTONES. A table for the first player in Talaran to reach 25, 50, 75 and
 * 100 in each skill. Claimed by unique index on (skill, level) rather than by
 * checking and then inserting, so two players levelling in the same tick cannot
 * both be told they were first.
 *
 * MASTERY IS 100. The mastery feats shipped asking for 99, which is the wrong
 * number for this game: Talaran's ladder runs to 100 and the tier bands in
 * CLAUDE.md put T9 at exactly 100. 99 is another game's habit and it would have
 * meant the mastery feat arriving one level before the actual summit.
 */

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('skill_milestone_firsts'))) {
        await knex.schema.createTable('skill_milestone_firsts', (t) => {
            t.increments('id').primary();
            t.string('skill_name', 60).notNullable();
            t.integer('level').notNullable();
            t.integer('player_id').unsigned().notNullable()
                .references('id').inTable('players').onDelete('CASCADE');
            t.timestamp('achieved_at').notNullable().defaultTo(knex.fn.now());
            // The claim itself. One holder per rung, forever.
            t.unique(['skill_name', 'level']);
        });
    }

    // Mastery is the top of the ladder, not one short of it.
    await knex('feats')
        .where({ criterion_kind: 'skill', criterion_value: 99 })
        .update({ criterion_value: 100 });

    await knex('feats').where({ slug: 'master-woodcutter' }).update({ description: 'Reach Woodcutting 100.' });
    await knex('feats').where({ slug: 'master-miner' }).update({ description: 'Reach Mining 100.' });
    await knex('feats').where({ slug: 'master-fisher' }).update({ description: 'Reach Fishing 100.' });
    await knex('feats').where({ slug: 'master-forager' }).update({ description: 'Reach Foraging 100.' });
    await knex('feats').where({ slug: 'master-hunter' }).update({ description: 'Reach Hunting 100.' });
    await knex('feats').where({ slug: 'master-farmer' }).update({ description: 'Reach Farming 100.' });
    await knex('feats').where({ slug: 'master-stockman' }).update({ description: 'Reach Husbandry 100.' });
    await knex('feats').where({ slug: 'master-smith' }).update({ description: 'Reach Smithing 100.' });
    await knex('feats').where({ slug: 'master-wright' }).update({ description: 'Reach Carpentry 100.' });
    await knex('feats').where({ slug: 'master-crafter' }).update({ description: 'Reach Crafting 100.' });
    await knex('feats').where({ slug: 'master-cook' }).update({ description: 'Reach Cooking 100.' });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('skill_milestone_firsts');
    await knex('feats')
        .where({ criterion_kind: 'skill', criterion_value: 100 })
        .update({ criterion_value: 99 });
}
