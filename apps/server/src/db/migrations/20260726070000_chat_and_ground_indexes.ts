import type { Knex } from 'knex';

// Audit findings 7 and 8 (docs/AUDIT-2026-07-26.md).
//
// chat_messages and ground_items each had nothing but a primary key, while both
// are queried constantly on columns that were unindexed. chat_messages is the
// worse of the two: routes/chat.ts filters on channel and sent_at, sorts by
// sent_at, and runs on every chat poll from every client, against a table that
// nothing ever deletes from.
//
// Index column order matters here. Postgres can use (channel, sent_at) to satisfy
// both the equality filter on channel AND the range filter and ORDER BY on
// sent_at, which removes the sort as well as the scan. The reverse order would
// only help the range.

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('chat_messages', (t) => {
        // Serves: WHERE channel = ? AND sent_at >= ? ORDER BY sent_at
        t.index(['channel', 'sent_at'], 'chat_messages_channel_sent_at_idx');

        // Region chat adds WHERE region = ? on top of the above.
        t.index(['region', 'sent_at'], 'chat_messages_region_sent_at_idx');

        // Guild chat adds WHERE guild_id = ?.
        t.index(['guild_id', 'sent_at'], 'chat_messages_guild_sent_at_idx');
    });

    await knex.schema.alterTable('ground_items', (t) => {
        // Read on essentially every location render.
        t.index(['location_id'], 'ground_items_location_idx');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('chat_messages', (t) => {
        t.dropIndex(['channel', 'sent_at'], 'chat_messages_channel_sent_at_idx');
        t.dropIndex(['region', 'sent_at'], 'chat_messages_region_sent_at_idx');
        t.dropIndex(['guild_id', 'sent_at'], 'chat_messages_guild_sent_at_idx');
    });

    await knex.schema.alterTable('ground_items', (t) => {
        t.dropIndex(['location_id'], 'ground_items_location_idx');
    });
}
