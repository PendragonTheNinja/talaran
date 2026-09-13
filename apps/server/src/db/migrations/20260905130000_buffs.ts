import type { Knex } from 'knex';

/**
 * Buffs.
 *
 * Small, long, and one at a time. That combination is the whole design: a buff
 * worth ~1 second off a timer, running for hours, means you keep a few in the
 * pack and eat the next when the last runs out. It is not something to manage,
 * it is something to remember.
 *
 * ONE ACTIVE PER PLAYER, not one per skill. Eating a second replaces the first,
 * so the choice of which trade to favour today actually costs something. The
 * unique index on player_id enforces it rather than trusting the service.
 *
 * Effects deliberately exclude XP multipliers. Every band in
 * docs/xp-rebalance.md is derived from one formula, and an XP buff would mean
 * every future calculation has to account for it. Timers, drop rolls and yields
 * can all move without touching that.
 */

export async function up(knex: Knex): Promise<void> {
    // Guarded per statement, so a migration that failed halfway can be re-run.
    // An early return here would have skipped the items columns below.
    if (!(await knex.schema.hasTable('player_buffs'))) {
    await knex.schema.createTable('player_buffs', (t) => {
        t.increments('id').primary();
        // Unique, not just indexed: one buff at a time is a rule, and rules that
        // live only in service code get broken by the next caller.
        t.integer('player_id').unsigned().notNullable().unique()
            .references('id').inTable('players').onDelete('CASCADE');
        t.string('source_item', 100).notNullable();   // what was eaten, for the UI
        t.string('effect_type', 30).notNullable();    // see EFFECTS below
        t.string('skill', 50).nullable();             // null means every skill
        t.float('magnitude').notNullable();           // seconds, or percentage points
        t.timestamp('expires_at').notNullable();
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        t.index(['expires_at']);
    });
    }

    // What a food does when eaten, beyond healing. Null on everything that is
    // just food.
    if (!(await knex.schema.hasColumn('items', 'buff_effect'))) {
        await knex.schema.alterTable('items', (t) => {
            t.string('buff_effect', 30).nullable();
            t.string('buff_skill', 50).nullable();
            t.float('buff_magnitude').nullable();
            t.integer('buff_seconds').nullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('player_buffs');
    if (await knex.schema.hasColumn('items', 'buff_effect')) {
        await knex.schema.alterTable('items', (t) => {
            t.dropColumn('buff_effect');
            t.dropColumn('buff_skill');
            t.dropColumn('buff_magnitude');
            t.dropColumn('buff_seconds');
        });
    }
}
