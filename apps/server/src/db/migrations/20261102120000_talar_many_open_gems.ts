import type { Knex } from 'knex';

// Several part-filled gems at once (forum, 2026-11; Nathan): a player who
// started a Flawless Quartz could not stop and fill a Cut one instead without
// finishing the first, which can be an hour and a half.
//
//   player_talar_open_gem   was keyed by player (one open stone each). Now one
//                           open stone per player PER GEM KIND, so a Flawless
//                           and a Cut Quartz can both wait half full. Two of the
//                           same kind are never needed: starting that kind again
//                           resumes the one already open.
//   is_filling              which open stone the running talar_fill action is
//                           pouring into. At most one per player (a partial
//                           unique index), set by startFill. The action's
//                           action_data stays the full-at time the client draws.
//
// Every row that exists today is its player's only open stone, so it is marked
// filling: a fill running across the deploy carries on into it.

const TABLE = 'player_talar_open_gem';
const ONE_FILLING = 'player_talar_open_gem_one_filling';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn(TABLE, 'is_filling'))) {
        await knex.schema.alterTable(TABLE, t => { t.boolean('is_filling').notNullable().defaultTo(false); });
        await knex(TABLE).update({ is_filling: true });
    }
    await knex.raw(`ALTER TABLE ${TABLE} DROP CONSTRAINT IF EXISTS player_talar_open_gem_pkey`);
    await knex.raw(`ALTER TABLE ${TABLE} ADD CONSTRAINT player_talar_open_gem_pkey PRIMARY KEY (player_id, item_id)`);
    await knex.raw(`CREATE UNIQUE INDEX IF NOT EXISTS ${ONE_FILLING} ON ${TABLE} (player_id) WHERE is_filling`);
}

export async function down(knex: Knex): Promise<void> {
    // Going back to one stone per player would have to destroy the others.
    // Refuse loudly instead; empty them by hand first if this is really wanted.
    const crowded = await knex(TABLE).select('player_id').groupBy('player_id').havingRaw('count(*) > 1');
    if (crowded.length > 0) {
        throw new Error(`${crowded.length} player(s) hold more than one open gem; down() would destroy them. Resolve those rows first.`);
    }
    await knex.raw(`DROP INDEX IF EXISTS ${ONE_FILLING}`);
    await knex.raw(`ALTER TABLE ${TABLE} DROP CONSTRAINT IF EXISTS player_talar_open_gem_pkey`);
    await knex.raw(`ALTER TABLE ${TABLE} ADD CONSTRAINT player_talar_open_gem_pkey PRIMARY KEY (player_id)`);
    if (await knex.schema.hasColumn(TABLE, 'is_filling')) {
        await knex.schema.alterTable(TABLE, t => { t.dropColumn('is_filling'); });
    }
}
