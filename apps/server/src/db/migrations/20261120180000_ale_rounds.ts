import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Ale is for company (Nathan, 2026-11-20): it gives its buff only when stood as
// a round at a tavern with at least three players there, one Ale each, and that
// buff is kept apart from provisions, so a round never displaces anyone's
// Smith's Supper and the two run together (services/rounds.ts). Drunk alone,
// ale does nothing, so the item loses its own buff.
//
//   player_round_buffs   one live round per player: every skill a little
//                        faster until expires_at (buffTimerBonus adds it)

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('player_round_buffs'))) {
        await knex.schema.createTable('player_round_buffs', (t) => {
            t.integer('player_id').primary().references('id').inTable('players').onDelete('CASCADE');
            t.integer('stood_by').nullable().references('id').inTable('players').onDelete('SET NULL');
            t.decimal('magnitude', 6, 2).notNullable();
            t.timestamp('expires_at', { useTz: true }).notNullable();
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        });
    }
    if (!(await hasContent(knex))) return;
    const ale = await knex('items').where({ name: 'Ale' }).first('id');
    if (!ale) throw new Error('ale_rounds: item "Ale" not found (run 20261120160000 first)');
    await knex('items').where({ id: ale.id }).update({
        buff_effect: null, buff_skill: null, buff_magnitude: null, buff_seconds: null, heal_amount: null, subtype: 'drink',
        description: 'A brown ale, cloudy and sweet with meadowsweet. Nobody drinks it alone. Stood as a round for three or more, it puts a spring in everyone\'s step.',
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('player_round_buffs');
    if (await hasContent(knex)) {
        await knex('items').where({ name: 'Ale' }).update({
            buff_effect: 'timer', buff_skill: null, buff_magnitude: 1, buff_seconds: 6 * 3600, heal_amount: 10, subtype: 'provision',
            description: 'A brown ale, cloudy and sweet with meadowsweet, poured from the cask with a head on it.',
        });
    }
}
