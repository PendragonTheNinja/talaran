import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Talar, second tier (docs/talar-spec.md §6): Sending, and its writ.
//
//   Writ of Sending   a curio found on the road by those who walk it
//                     (services/travelEvents.ts, 'writ_of_sending'). Given up
//                     at the vigil with the offering (20261028100000).
//   Sending           one stack between the pack and the player's own store,
//                     anywhere on the island (services/spells.ts).

const WRIT = {
    name: 'Writ of Sending', type: 'curio', subtype: 'writ', tier: 1, level_required: 1,
    description: 'A folded letter in a careful hand, sealed with grey wax pressed flat by a thumb. It tells how a thing set down in one place may be asked to be in another. Most of it is about asking politely.',
};

const SPELL = {
    key: 'sending', name: 'Sending', talar_level: 15, cost: 20,
    cooldown_kind: 'timer', cooldown_seconds: 600, display_order: 1,
    vigil_minutes: 20, offering_item_name: 'Lit Garnet', writ_item_name: WRIT.name,
    description: 'Send one stack from your pack to a store of your own, or fetch one back, from anywhere on the island.',
};

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    if (!(await knex.schema.hasColumn('spells', 'writ_item_name'))) throw new Error('spell_sending: run 20261028100000_spell_vigils first');
    if (!(await knex('items').where({ name: SPELL.offering_item_name }).first())) throw new Error(`spell_sending: no item named ${SPELL.offering_item_name}`);

    const item = await knex('items').where({ name: WRIT.name }).first();
    if (item) await knex('items').where({ id: item.id }).update(WRIT);
    else await knex('items').insert(WRIT);

    const existing = await knex('spells').where({ key: SPELL.key }).first();
    if (existing) await knex('spells').where({ id: existing.id }).update({ ...SPELL, updated_at: knex.fn.now() });
    else await knex('spells').insert(SPELL);
}

// The writ stays on down(), as items do in every content migration: players may hold it.
export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable('spells')) await knex('spells').where({ key: SPELL.key }).delete();
}
