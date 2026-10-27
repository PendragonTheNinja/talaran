import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Talar, second tier (docs/talar-spec.md §6): Kindle, and its writ.
//
//   world_events.per_player_cap   no player draws more than this from the pool
//                                 (Kindle: a quarter, so it takes four to empty).
//   world_events.kindled_by       the player who lit it; paid Talar XP for every
//                                 boosted action by someone else.
//   world_event_shares            what each player has drawn from a capped pool.
//   Writ of Kindling              a rare find while mining stone or ore, 1 in
//                                 1,500 swings: about a week of a miner's days.
//   Kindle                        Talar 20, 300 Talar, once a day.

const WRIT = {
    name: 'Writ of Kindling', type: 'curio', subtype: 'writ', tier: 1, level_required: 1,
    description: 'A sheet of thin hide, scorched brown along one edge, folded small and pressed into a seam of the rock. The writing is close and steady. It is about calling people to a place, and keeping them there a while.',
};

const SPELL = {
    key: 'kindle', name: 'Kindle', talar_level: 20, cost: 300,
    cooldown_kind: 'timer', cooldown_seconds: 24 * 3600, display_order: 1,
    vigil_minutes: 20, offering_item_name: 'Lit Garnet', writ_item_name: WRIT.name,
    description: 'Light the ground where you stand, so the work done here goes further for everyone who comes to do it, for a while. You are rewarded for each of them.',
};

const WRIT_DROPS: [string, number][] = [
    ['mining:rock:granite', 1500],
    ['mining:ore:ambren', 1500],
    ['mining:ore:burgh', 1500],
];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('world_events', 'per_player_cap'))) {
        await knex.schema.alterTable('world_events', t => { t.integer('per_player_cap').nullable(); });
    }
    if (!(await knex.schema.hasColumn('world_events', 'kindled_by'))) {
        await knex.schema.alterTable('world_events', t => {
            t.integer('kindled_by').nullable().references('id').inTable('players').onDelete('SET NULL');
        });
    }
    if (!(await knex.schema.hasTable('world_event_shares'))) {
        await knex.schema.createTable('world_event_shares', t => {
            t.integer('event_id').notNullable().references('id').inTable('world_events').onDelete('CASCADE');
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.integer('taken').notNullable().defaultTo(0);
            t.primary(['event_id', 'player_id']);
        });
    }

    if (!(await hasContent(knex))) return;
    if (!(await knex.schema.hasColumn('spells', 'writ_item_name'))) throw new Error('spell_kindle: run 20261028100000_spell_vigils first');
    if (!(await knex('items').where({ name: SPELL.offering_item_name }).first())) throw new Error(`spell_kindle: no item named ${SPELL.offering_item_name}`);

    let writ = await knex('items').where({ name: WRIT.name }).first();
    if (writ) await knex('items').where({ id: writ.id }).update(WRIT);
    else [writ] = await knex('items').insert(WRIT).returning('*');

    for (const [sourceKey, oneIn] of WRIT_DROPS) {
        if (sourceKey.startsWith('mining:ore:')) {
            const subtype = sourceKey.slice('mining:ore:'.length);
            if (!(await knex('items').where({ type: 'ore', subtype }).first())) throw new Error(`spell_kindle: ore ${subtype} not found`);
        }
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
    await knex.schema.dropTableIfExists('world_event_shares');
    for (const column of ['kindled_by', 'per_player_cap']) {
        if (await knex.schema.hasColumn('world_events', column)) await knex.schema.alterTable('world_events', t => { t.dropColumn(column); });
    }
}
