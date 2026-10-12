import type { Knex } from 'knex';

// Combat: the player's own wait between bot checks while fighting (Nathan,
// 2026-10-12). One of 5, 10, 15, 20, 25 or 30 minutes (COMBAT_BOT_CHECK_MINUTES
// in services/botCheck.ts); 30 is the normal interval and the default. A check
// freezes a fight between kills, so a shorter wait stops an unattended fight
// sooner, which lets a player take on a creature that would otherwise wear
// them down.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('player_settings', 'combat_bot_check_minutes'))) {
        await knex.schema.alterTable('player_settings', t => {
            t.integer('combat_bot_check_minutes').notNullable().defaultTo(30);
        });
        await knex.raw(`ALTER TABLE player_settings ADD CONSTRAINT player_settings_combat_bot_check_minutes_check
            CHECK (combat_bot_check_minutes IN (5, 10, 15, 20, 25, 30))`);
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('player_settings', 'combat_bot_check_minutes')) {
        await knex.raw('ALTER TABLE player_settings DROP CONSTRAINT IF EXISTS player_settings_combat_bot_check_minutes_check');
        await knex.schema.alterTable('player_settings', t => { t.dropColumn('combat_bot_check_minutes'); });
    }
}
