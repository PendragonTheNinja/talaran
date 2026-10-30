import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Tether can be cast before a fall, as insurance (Nathan, 2026-10-30).
//   player_spells.armed_at   a spell cast ahead and waiting to take effect;
//                            for Tether, set by the cast and cleared by the
//                            next fall (dropEverythingWithin), which it holds.
// The description says so.

const BEFORE = 'After a fall, keep a hold on what you dropped, so it stays yours alone a quarter of an hour longer. Once for each fall.';
const AFTER = 'Keep a hold on what you drop when you fall, so it stays yours alone a quarter of an hour longer. Cast it beforehand and it waits for your next fall; cast it after, and it holds what is already lying there. One fall at a time.';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('player_spells', 'armed_at'))) {
        await knex.schema.alterTable('player_spells', t => {
            t.timestamp('armed_at', { useTz: true }).nullable();
        });
    }
    if (!(await hasContent(knex))) return;
    const spell = await knex('spells').where({ key: 'tether' }).first();
    if (!spell) throw new Error('tether_ahead: no spell with key tether');
    await knex('spells').where({ id: spell.id }).update({ description: AFTER });
}

export async function down(knex: Knex): Promise<void> {
    await knex('spells').where({ key: 'tether' }).update({ description: BEFORE });
    if (await knex.schema.hasColumn('player_spells', 'armed_at')) {
        await knex.schema.alterTable('player_spells', t => { t.dropColumn('armed_at'); });
    }
}
