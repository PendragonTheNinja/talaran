import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The Gaster's Gaze, Wendhaven's taproom (Nathan, 2026-11-20): no bard, so no
// Chronicle, but a place to stand a round, and a keeper who sells Ale at a
// price that makes brewing your own the better bargain.
//
//   taverns.ale_price    gold an Ale from the keeper, or null where none is sold
//   taverns.keeper_name  who pours it

const TAVERN = {
    name: "The Gaster's Gaze",
    description: 'A low taproom on the Wendhaven quay with a painted eye over the door. The sailors touch it for luck on the way out. The ale is dear, and the keeper knows it.',
    ale_price: 30,
    keeper_name: 'Odda Fenn',
};

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('taverns', 'ale_price'))) {
        await knex.schema.alterTable('taverns', (t) => { t.integer('ale_price').nullable(); });
    }
    if (!(await knex.schema.hasColumn('taverns', 'keeper_name'))) {
        await knex.schema.alterTable('taverns', (t) => { t.string('keeper_name', 80).nullable(); });
    }
    if (!(await hasContent(knex))) return;
    const town = await knex('locations').where({ name: 'Wendhaven' }).first('id');
    if (!town) throw new Error('gasters_gaze: no location named Wendhaven (run 20261119130000 first)');
    const row = { ...TAVERN, location_id: town.id, bard_npc_id: null };
    const had = await knex('taverns').where({ name: TAVERN.name }).first('id');
    if (had) await knex('taverns').where({ id: had.id }).update(row);
    else await knex('taverns').insert(row);
}

export async function down(knex: Knex): Promise<void> {
    if (await hasContent(knex)) await knex('taverns').where({ name: TAVERN.name }).delete();
    if (await knex.schema.hasColumn('taverns', 'keeper_name')) await knex.schema.alterTable('taverns', (t) => { t.dropColumn('keeper_name'); });
    if (await knex.schema.hasColumn('taverns', 'ale_price')) await knex.schema.alterTable('taverns', (t) => { t.dropColumn('ale_price'); });
}
