import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Talar, step 4 (docs/talar-spec.md §5, §6): spells.
//
//   spells          a spell is a row: its level, the base of its cost, how its
//                   cooldown runs. What it does is code (services/spells.ts).
//                   cooldown_kind: 'timer' (cooldown_seconds), 'daily' (until
//                   the next game midnight) or 'per_death' (once between deaths).
//   player_spells   which spells a player has learned, and when each is next
//                   ready. Learned at a church (Nathan, 2026-10-27).
//
// Wearsight, the first Tier 1 spell; Daily Step, Tether and Larder Ward come
// in their own migrations, each with the code that makes it work. Costs and
// cooldowns are the spec's first numbers (knobs). `cost` is Talar, or for a
// spell priced by what it covers, Talar per unit (services/spells.ts).

const SPELLS = [
    {
        key: 'wearsight', name: 'Wearsight', talar_level: 1, cost: 5,
        cooldown_kind: 'timer', cooldown_seconds: 3600, display_order: 1,
        description: 'Look over what you are wearing and see how much use is left in it.',
    },
];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('spells'))) {
        await knex.schema.createTable('spells', t => {
            t.increments('id').primary();
            t.string('key', 50).notNullable().unique();
            t.string('name', 100).notNullable();
            t.text('description').nullable();
            t.integer('talar_level').notNullable().defaultTo(1);
            t.float('cost').notNullable().defaultTo(0);
            t.string('cooldown_kind', 20).notNullable().defaultTo('timer');
            t.integer('cooldown_seconds').nullable();
            t.integer('display_order').notNullable().defaultTo(0);
            t.boolean('is_active').notNullable().defaultTo(true);
            t.timestamps(true, true);
        });
    }
    if (!(await knex.schema.hasTable('player_spells'))) {
        await knex.schema.createTable('player_spells', t => {
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.integer('spell_id').notNullable().references('id').inTable('spells').onDelete('CASCADE');
            t.timestamp('learned_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.timestamp('ready_at', { useTz: true }).nullable();
            t.timestamp('last_cast_at', { useTz: true }).nullable();
            t.primary(['player_id', 'spell_id']);
        });
    }

    if (!(await hasContent(knex))) return;

    for (const s of SPELLS) {
        const existing = await knex('spells').where({ key: s.key }).first();
        if (existing) await knex('spells').where({ id: existing.id }).update({ ...s, updated_at: knex.fn.now() });
        else await knex('spells').insert(s);
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('player_spells');
    await knex.schema.dropTableIfExists('spells');
}
