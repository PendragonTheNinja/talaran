import type { Knex } from 'knex';

// Wearsight keeps what it saw (forum, 2026-11-05 and 11-11; Nathan, 2026-11-12).
//
//   player_spells.last_reading   the last reading of each kind a spell gave,
//                                as { <look>: { at, lines } }. Only Wearsight
//                                writes it today: 'worn', 'pack' or 'benches'.
//
// The spell can now look at the pack and at the tools on the player's own
// benches as well as at what is worn, and says how much sure use is left in
// numbers, so its description changes with it.

const DESCRIPTION = 'Look over what you wear, what you carry or the tools on your own benches, and see how much sure use is left in each.';
const OLD_DESCRIPTION = 'Look over what you are wearing and see how much use is left in it.';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('player_spells', 'last_reading'))) {
        await knex.schema.alterTable('player_spells', (t) => {
            t.jsonb('last_reading').nullable();
        });
    }
    // The spells table is created empty on a fresh database; its rows come with content.
    const spell = await knex('spells').where({ key: 'wearsight' }).first('id');
    if (spell) await knex('spells').where({ id: spell.id }).update({ description: DESCRIPTION, updated_at: knex.fn.now() });
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('player_spells', 'last_reading')) {
        await knex.schema.alterTable('player_spells', (t) => {
            t.dropColumn('last_reading');
        });
    }
    await knex('spells').where({ key: 'wearsight' }).update({ description: OLD_DESCRIPTION });
}
