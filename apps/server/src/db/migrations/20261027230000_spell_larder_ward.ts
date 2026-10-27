import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Talar, step 4c (docs/talar-spec.md §6): Larder Ward.
//
//   player_pens.warded_from / warded_until   the ward over a pen. While it holds,
//       a trough that runs dry is topped up from the farmstead's storage and the
//       muck deadline waits until it ends (services/husbandry.ts, settled on
//       read). warded_from also moves forward when a top-up finds the store
//       short, so feed put in later is never counted as eaten earlier.
//   spells row   cost is Talar per head-hour covered; 12 h cooldown.

const SPELL = {
    key: 'larder_ward', name: 'Larder Ward', talar_level: 8, cost: 0.5,
    cooldown_kind: 'timer', cooldown_seconds: 12 * 3600, display_order: 1,
    description: 'Set a ward over the pens at your farmstead. While it holds, an empty trough is filled from your store and the bedding can wait. The more head you keep, the more it takes.',
};

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('player_pens', 'warded_from'))) {
        await knex.schema.alterTable('player_pens', t => { t.timestamp('warded_from', { useTz: true }).nullable(); });
    }
    if (!(await knex.schema.hasColumn('player_pens', 'warded_until'))) {
        await knex.schema.alterTable('player_pens', t => { t.timestamp('warded_until', { useTz: true }).nullable(); });
    }

    if (!(await hasContent(knex))) return;
    if (!(await knex.schema.hasTable('spells'))) throw new Error('spell_larder_ward: no spells table (run 20261027210000_spells first)');

    const existing = await knex('spells').where({ key: SPELL.key }).first();
    if (existing) await knex('spells').where({ id: existing.id }).update({ ...SPELL, updated_at: knex.fn.now() });
    else await knex('spells').insert(SPELL);
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable('spells')) await knex('spells').where({ key: SPELL.key }).delete();
    for (const column of ['warded_until', 'warded_from']) {
        if (await knex.schema.hasColumn('player_pens', column)) {
            await knex.schema.alterTable('player_pens', t => { t.dropColumn(column); });
        }
    }
}
