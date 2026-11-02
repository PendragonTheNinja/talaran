import type { Knex } from 'knex';

// Push notifications (services/pushNotify.ts): the game can reach a player's
// phone or desktop when it needs them, with the game closed or out of sight.
//
//   push_subscriptions        one row per device that said yes. The endpoint
//                             is the browser's own address for that device
//                             (unique: a device belongs to whoever signed it up
//                             last); p256dh and auth are its encryption keys.
//                             Removed when the device unsubscribes, or the
//                             first time a send to it is refused as gone.
//   player_settings.push_types  which kinds of notification the player wants,
//                             as a JSON list of type keys. Null means the
//                             defaults (bot check, action stopped). The same
//                             choice applies to every device they sign up.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('push_subscriptions'))) {
        await knex.schema.createTable('push_subscriptions', t => {
            t.increments('id').primary();
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.text('endpoint').notNullable().unique();
            t.string('p256dh', 200).notNullable();
            t.string('auth', 100).notNullable();
            t.string('user_agent', 300).nullable();
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.timestamp('last_sent_at', { useTz: true }).nullable();
            t.index(['player_id']);
        });
    }
    if (!(await knex.schema.hasColumn('player_settings', 'push_types'))) {
        await knex.schema.alterTable('player_settings', t => { t.jsonb('push_types').nullable(); });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('player_settings', 'push_types')) {
        await knex.schema.alterTable('player_settings', t => { t.dropColumn('push_types'); });
    }
    await knex.schema.dropTableIfExists('push_subscriptions');
}
