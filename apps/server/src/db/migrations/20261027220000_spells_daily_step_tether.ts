import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Talar, step 4b (docs/talar-spec.md §6): Daily Step and Tether, with the
// code that makes them work (services/spells.ts). Upsert by key.
//
//   Daily Step   cost is Talar per base second of road skipped (shortest way
//                there by road), so 4 to 38 on Taiar. Once a game day.
//   Tether       a flat 25, once per death: the effect refuses a pile it has
//                already held, so no clock is needed.

const SPELLS = [
    {
        key: 'daily_step', name: 'Daily Step', talar_level: 5, cost: 0.1,
        cooldown_kind: 'daily', cooldown_seconds: null, display_order: 1,
        description: 'Step out of one place and into another you have walked to before on this island. Once a day. The longer the road you skip, the more it takes out of you.',
    },
    {
        key: 'tether', name: 'Tether', talar_level: 10, cost: 25,
        cooldown_kind: 'per_death', cooldown_seconds: null, display_order: 1,
        description: 'After a fall, keep a hold on what you dropped, so it stays yours alone a quarter of an hour longer. Once for each fall.',
    },
];

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    if (!(await knex.schema.hasTable('spells'))) throw new Error('spells_daily_step_tether: no spells table (run 20261027210000_spells first)');

    for (const s of SPELLS) {
        const existing = await knex('spells').where({ key: s.key }).first();
        if (existing) await knex('spells').where({ id: existing.id }).update({ ...s, updated_at: knex.fn.now() });
        else await knex('spells').insert(s);
    }
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('spells'))) return;
    await knex('spells').whereIn('key', SPELLS.map(s => s.key)).delete();
}
