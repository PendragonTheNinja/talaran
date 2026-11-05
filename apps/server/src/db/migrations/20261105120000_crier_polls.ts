import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The Town Crier's polls (Nathan, 2026-11-05; services/crierPolls.ts).
// A poll is written in the admin panel and comes to each player who may answer
// it: a notice on the scene when it opens or when they next log in, and the
// Crier standing wherever they are until they answer or the poll closes. An
// answer pays Crier's Chits, once per poll, in the transaction that records it.
//
//   crier_polls            one poll: its window, its reward, who may answer
//   crier_poll_questions   its questions, in order; `kind` and `settings` say how
//   crier_poll_options     the choices of a choice, ranking or points question
//   crier_poll_responses   one per player per poll (the unique key is the gate)
//   crier_poll_answers     what a response said, a row per choice or value
//   crier_poll_dismissals  "Not now": the notice stays away, the Crier stays
//   crier_chit_ledger      every change to players.crier_chits, with its reason
//
// Answers keep the player's level and time played as they were when they
// answered, so the results can be read by veterans and newcomers.

const CRIER = {
    name: 'Hollin Bray',
    title: 'Town Crier',
    avatar: '📯',
    roams_with: 'crier_poll',
};

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('crier_polls'))) {
        await knex.schema.createTable('crier_polls', (t) => {
            t.increments('id').primary();
            t.string('title', 120).notNullable();
            t.string('intro', 500).nullable();
            t.integer('chits').notNullable().defaultTo(2);
            // NULL opens_at is a draft. A poll is open from opens_at until
            // closes_at, or until closed_at when it is closed early.
            t.timestamp('opens_at', { useTz: true }).nullable();
            t.timestamp('closes_at', { useTz: true }).nullable();
            t.timestamp('closed_at', { useTz: true }).nullable();
            t.integer('min_account_days').notNullable().defaultTo(3);
            t.integer('min_hours_played').notNullable().defaultTo(3);
            // Set by the sweep once everyone online has been told (services/crierPolls.ts).
            t.timestamp('announced_open_at', { useTz: true }).nullable();
            t.timestamp('announced_close_at', { useTz: true }).nullable();
            t.integer('created_by').nullable().references('id').inTable('players').onDelete('SET NULL');
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        });
        await knex.raw('ALTER TABLE crier_polls ADD CONSTRAINT crier_polls_chits_nonnegative CHECK (chits >= 0)');
    }

    if (!(await knex.schema.hasTable('crier_poll_questions'))) {
        await knex.schema.createTable('crier_poll_questions', (t) => {
            t.increments('id').primary();
            t.integer('poll_id').notNullable().references('id').inTable('crier_polls').onDelete('CASCADE');
            t.integer('position').notNullable();
            t.string('kind', 20).notNullable();
            t.string('prompt', 300).notNullable();
            t.string('help', 300).nullable();
            t.boolean('required').notNullable().defaultTo(true);
            t.jsonb('settings').notNullable().defaultTo('{}');
            t.boolean('allow_write_in').notNullable().defaultTo(false);
            t.string('write_in_label', 60).nullable();
            t.boolean('allow_comment').notNullable().defaultTo(false);
            t.index(['poll_id', 'position']);
        });
    }

    if (!(await knex.schema.hasTable('crier_poll_options'))) {
        await knex.schema.createTable('crier_poll_options', (t) => {
            t.increments('id').primary();
            t.integer('question_id').notNullable().references('id').inTable('crier_poll_questions').onDelete('CASCADE');
            t.integer('position').notNullable();
            t.string('label', 200).notNullable();
            t.string('item_name', 100).nullable();
            t.index(['question_id', 'position']);
        });
    }

    if (!(await knex.schema.hasTable('crier_poll_responses'))) {
        await knex.schema.createTable('crier_poll_responses', (t) => {
            t.increments('id').primary();
            t.integer('poll_id').notNullable().references('id').inTable('crier_polls').onDelete('CASCADE');
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.integer('chits_awarded').notNullable().defaultTo(0);
            t.integer('total_level').notNullable().defaultTo(0);
            t.integer('combat_level').notNullable().defaultTo(0);
            t.integer('seconds_played').notNullable().defaultTo(0);
            t.integer('account_days').notNullable().defaultTo(0);
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            // When the player was shown the results of the closed poll.
            t.timestamp('results_seen_at', { useTz: true }).nullable();
            t.unique(['poll_id', 'player_id']);
            t.index(['player_id']);
        });
    }

    if (!(await knex.schema.hasTable('crier_poll_answers'))) {
        await knex.schema.createTable('crier_poll_answers', (t) => {
            t.increments('id').primary();
            t.integer('response_id').notNullable().references('id').inTable('crier_poll_responses').onDelete('CASCADE');
            t.integer('question_id').notNullable().references('id').inTable('crier_poll_questions').onDelete('CASCADE');
            t.integer('option_id').nullable().references('id').inTable('crier_poll_options').onDelete('CASCADE');
            // A rating, a number, a rank (1 is first) or points given to an option.
            t.double('value').nullable();
            t.string('text', 1000).nullable();
            t.boolean('is_write_in').notNullable().defaultTo(false);
            t.boolean('is_comment').notNullable().defaultTo(false);
            t.index(['question_id']);
            t.index(['response_id']);
        });
    }

    if (!(await knex.schema.hasTable('crier_poll_dismissals'))) {
        await knex.schema.createTable('crier_poll_dismissals', (t) => {
            t.integer('poll_id').notNullable().references('id').inTable('crier_polls').onDelete('CASCADE');
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.primary(['poll_id', 'player_id']);
        });
    }

    if (!(await knex.schema.hasColumn('players', 'crier_chits'))) {
        await knex.schema.alterTable('players', (t) => {
            t.integer('crier_chits').notNullable().defaultTo(0);
        });
        await knex.raw('ALTER TABLE players ADD CONSTRAINT players_crier_chits_nonnegative CHECK (crier_chits >= 0)');
    }

    if (!(await knex.schema.hasTable('crier_chit_ledger'))) {
        await knex.schema.createTable('crier_chit_ledger', (t) => {
            t.increments('id').primary();
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.integer('delta').notNullable();
            t.string('reason', 40).notNullable();
            t.integer('poll_id').nullable().references('id').inTable('crier_polls').onDelete('SET NULL');
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.index(['player_id', 'created_at']);
        });
    }

    // An NPC with roams_with set stands nowhere of his own: routes/npcs.ts adds
    // him wherever the player is while the thing he roams with applies to them.
    if (!(await knex.schema.hasColumn('npcs', 'roams_with'))) {
        await knex.schema.alterTable('npcs', (t) => {
            t.string('roams_with', 30).nullable();
        });
    }

    if (!(await hasContent(knex))) return;

    // npcs.location_id is required, so the Crier keeps Talador as his home on
    // paper. He is never listed there for that reason (roams_with).
    const talador = await knex('locations').where({ name: 'Talador' }).first('id');
    if (!talador) throw new Error('crier_polls: no location named Talador for the Town Crier.');
    const existing = await knex('npcs').where({ name: CRIER.name }).first('id');
    if (existing) {
        await knex('npcs').where({ id: existing.id }).update({ ...CRIER, location_id: talador.id, is_active: true });
    } else {
        await knex('npcs').insert({ ...CRIER, location_id: talador.id, is_active: true });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('npcs', 'roams_with')) {
        await knex('npcs').where({ name: CRIER.name }).delete();
        await knex.schema.alterTable('npcs', (t) => { t.dropColumn('roams_with'); });
    }
    await knex.schema.dropTableIfExists('crier_chit_ledger');
    if (await knex.schema.hasColumn('players', 'crier_chits')) {
        await knex.raw('ALTER TABLE players DROP CONSTRAINT IF EXISTS players_crier_chits_nonnegative');
        await knex.schema.alterTable('players', (t) => { t.dropColumn('crier_chits'); });
    }
    await knex.schema.dropTableIfExists('crier_poll_dismissals');
    await knex.schema.dropTableIfExists('crier_poll_answers');
    await knex.schema.dropTableIfExists('crier_poll_responses');
    await knex.schema.dropTableIfExists('crier_poll_options');
    await knex.schema.dropTableIfExists('crier_poll_questions');
    await knex.schema.dropTableIfExists('crier_polls');
}
