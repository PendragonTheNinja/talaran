import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Ale and the cask (docs/antura-plan.md §11; Nathan, 2026-11-20). A cask stands
// in Mettlefell, Antura's cooking town, and only there. It brews on its own
// clock, as the kiln burns: load batches, walk away, come back in six hours.
// A batch is 3 Barley and 1 Meadowsweet for 4 Ale, and a cask takes more
// batches as Cooking rises (services/brewing.ts). It is the town's, so it
// never wears and never needs building.
//
//   locations.has_cask   where a cask stands
//   brew_jobs            one brew per player per cask, as kiln_jobs
//   Ale                  every skill 1% faster for 6 hours (§11), never combat
//                        food (it carries a buff, CLAUDE.md §2 Combat)

const ALE = {
    name: 'Ale', type: 'food', subtype: 'provision', tier: 2, level_required: 1, heal_amount: 10, is_active: true,
    buff_effect: 'timer', buff_skill: null, buff_magnitude: 1, buff_seconds: 6 * 3600,
    description: 'A brown ale, cloudy and sweet with meadowsweet, poured from the cask with a head on it.',
};

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('locations', 'has_cask'))) {
        await knex.schema.alterTable('locations', (t) => { t.boolean('has_cask').notNullable().defaultTo(false); });
    }
    if (!(await knex.schema.hasTable('brew_jobs'))) {
        await knex.schema.createTable('brew_jobs', (t) => {
            t.increments('id').primary();
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.integer('location_id').notNullable().references('id').inTable('locations').onDelete('CASCADE');
            t.integer('batches').notNullable();
            t.integer('ale_yield').notNullable();
            t.integer('xp_reward').notNullable();
            t.timestamp('started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.timestamp('ready_at', { useTz: true }).notNullable();
            t.boolean('is_collected').notNullable().defaultTo(false);
            t.index(['player_id', 'is_collected']);
        });
        // One brew a player at a time, whatever races: the index is the real gate.
        await knex.raw('CREATE UNIQUE INDEX brew_jobs_one_open ON brew_jobs (player_id) WHERE NOT is_collected');
    }

    if (!(await hasContent(knex))) return;

    for (const n of ['Barley', 'Meadowsweet']) {
        if (!(await knex('items').where({ name: n }).first('id'))) throw new Error(`brewing: item "${n}" not found`);
    }
    const had = await knex('items').where({ name: ALE.name }).first('id');
    if (had) await knex('items').where({ id: had.id }).update(ALE);
    else await knex('items').insert(ALE);

    const town = await knex('locations').where({ name: 'Mettlefell' }).first('id');
    if (!town) throw new Error('brewing: no location named Mettlefell (run 20261119130000 first)');
    await knex('locations').where({ id: town.id }).update({ has_cask: true });

}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('brew_jobs');
    if (await knex.schema.hasColumn('locations', 'has_cask')) {
        await knex.schema.alterTable('locations', (t) => { t.dropColumn('has_cask'); });
    }
    // Ale stays, as players may hold it.
}
