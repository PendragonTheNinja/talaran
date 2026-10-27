import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Talar, second tier (docs/talar-spec.md §6): Portal, and its writ.
//
//   portals         a doorway opened by a caster from where they stood to a
//                   place on the same island they had walked to. Open to anyone
//                   at its near end until closes_at; expired rows are ignored on
//                   read (services/spells.ts), never timed out in memory.
//   portal_riders   who has stepped through, once each: the caster is paid for
//                   up to five others.
//   Writ of the Open Door   dropped by Hodags (1 in 120) and Agropelters (1 in 200).
//   Portal          Talar 22; 20 Talar and a quarter more per base second of
//                   road it skips (services/spells.ts); every 2 hours.

const WRIT = {
    name: 'Writ of the Open Door', type: 'curio', subtype: 'writ', tier: 1, level_required: 1,
    description: 'A strip of bark, rolled tight and tied with gut. Someone cut a doorway into the inner face with a knife point, and wrote around it in a ring. The ring has no beginning that anyone can find.',
};

const SPELL = {
    key: 'portal', name: 'Portal', talar_level: 22, cost: 20,
    cooldown_kind: 'timer', cooldown_seconds: 2 * 3600, display_order: 1,
    vigil_minutes: 20, offering_item_name: 'Lit Garnet', writ_item_name: WRIT.name,
    description: 'Open a doorway from where you stand to any place on this island you have walked to. It stays open a few minutes, and anyone standing here may go through. The longer the road it skips, the more it takes.',
};

const WRIT_DROPS: [string, number][] = [
    ['combat:hodag', 120],
    ['combat:agropelter', 200],
];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('portals'))) {
        await knex.schema.createTable('portals', t => {
            t.increments('id').primary();
            t.integer('caster_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.integer('from_location_id').notNullable().references('id').inTable('locations').onDelete('CASCADE');
            t.integer('to_location_id').notNullable().references('id').inTable('locations').onDelete('CASCADE');
            t.timestamp('opened_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.timestamp('closes_at', { useTz: true }).notNullable();
            t.index(['from_location_id', 'closes_at']);
        });
    }
    if (!(await knex.schema.hasTable('portal_riders'))) {
        await knex.schema.createTable('portal_riders', t => {
            t.integer('portal_id').notNullable().references('id').inTable('portals').onDelete('CASCADE');
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.timestamp('stepped_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.primary(['portal_id', 'player_id']);
        });
    }

    if (!(await hasContent(knex))) return;
    if (!(await knex.schema.hasColumn('spells', 'writ_item_name'))) throw new Error('spell_portal: run 20261028100000_spell_vigils first');
    if (!(await knex('items').where({ name: SPELL.offering_item_name }).first())) throw new Error(`spell_portal: no item named ${SPELL.offering_item_name}`);

    let writ = await knex('items').where({ name: WRIT.name }).first();
    if (writ) await knex('items').where({ id: writ.id }).update(WRIT);
    else [writ] = await knex('items').insert(WRIT).returning('*');

    for (const [sourceKey, oneIn] of WRIT_DROPS) {
        const key = sourceKey.slice('combat:'.length);
        if (!(await knex('creatures').where({ key }).first())) throw new Error(`spell_portal: creature ${key} not found`);
        const row = { source_key: sourceKey, item_id: writ.id, chance_one_in: oneIn, chance_percent: null, min_qty: 1, max_qty: 1, is_active: true };
        const existing = await knex('drop_table_entries').where({ source_key: sourceKey, item_id: writ.id }).first();
        if (existing) await knex('drop_table_entries').where({ id: existing.id }).update({ ...row, updated_at: knex.fn.now() });
        else await knex('drop_table_entries').insert(row);
    }

    const existing = await knex('spells').where({ key: SPELL.key }).first();
    if (existing) await knex('spells').where({ id: existing.id }).update({ ...SPELL, updated_at: knex.fn.now() });
    else await knex('spells').insert(SPELL);
}

// The writ item stays, as items do: players may hold it.
export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable('spells')) await knex('spells').where({ key: SPELL.key }).delete();
    const writ = await knex('items').where({ name: WRIT.name }).first();
    if (writ) await knex('drop_table_entries').where({ item_id: writ.id }).whereIn('source_key', WRIT_DROPS.map(d => d[0])).delete();
    await knex.schema.dropTableIfExists('portal_riders');
    await knex.schema.dropTableIfExists('portals');
}
