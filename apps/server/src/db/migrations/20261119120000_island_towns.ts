import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Where an island's homestead and player shops stand, and how many fields its
// homestead may hold (docs/antura-plan.md §6 and §14; CLAUDE.md §8). Code
// read one town of each before: FARMSTEAD_TOWN Novita, SHOP_TOWN Talador, and
// PLOT_MAX 20. Now each is the player's island's (services/islands.ts).
//
//   islands.homestead_place   the place a player raises their homestead on
//                             this island (Novita; Farefield on Antura).
//   islands.shop_town         the island's port, where its player shops stand
//                             (Talador; Wendhaven on Antura).
//   islands.plot_max          the most fields a homestead here may hold: 20 on
//                             Taiar, 10 on every island after (Nathan, 2026-11-15).

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('islands', 'homestead_place'))) {
        await knex.schema.alterTable('islands', (t) => {
            t.string('homestead_place', 100).nullable();
            t.string('shop_town', 100).nullable();
            t.integer('plot_max').notNullable().defaultTo(10);
        });
    }
    if (!(await hasContent(knex))) return;
    for (const name of ['Novita', 'Talador']) {
        if (!(await knex('locations').where({ name }).first('id'))) throw new Error(`island_towns: no location named ${name}`);
    }
    const n = await knex('islands').where({ name: 'Taiar Island' })
        .update({ homestead_place: 'Novita', shop_town: 'Talador', plot_max: 20 });
    if (n !== 1) throw new Error('island_towns: no islands row for Taiar Island (run 20261119100000 first)');
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('islands', 'homestead_place')) {
        await knex.schema.alterTable('islands', (t) => {
            t.dropColumn('homestead_place');
            t.dropColumn('shop_town');
            t.dropColumn('plot_max');
        });
    }
}
