import type { Knex } from 'knex';

// Stonehold becomes the game's default look (Nathan, 2026-11-04): the mockup
// art, cut into frames and tiles (apps/client/scripts/slice-stonehold.py).
//
// player_settings.theme was NOT NULL DEFAULT 'tavern' from the start
// (20260718152115), so almost every player's row says 'tavern' whether they
// chose it or never opened Settings, and the two cannot be told apart. Every
// 'tavern' row moves to Stonehold; one click in Settings > Themes takes a
// player back. Scriptorium, the bought themes and custom palettes were
// choices, and are left alone. New rows default to Stonehold.
//
// The server's fallback is DEFAULT_THEME in services/store.ts; the client's
// is DEFAULT_THEME in apps/client/src/lib/theme.ts.

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`ALTER TABLE player_settings ALTER COLUMN theme SET DEFAULT 'stonehold'`);
    await knex('player_settings').where({ theme: 'tavern' }).update({ theme: 'stonehold' });
}

export async function down(knex: Knex): Promise<void> {
    // Who chose Stonehold after the switch cannot be told from who was moved,
    // so down puts every Stonehold row back on Tavern, as before.
    await knex.raw(`ALTER TABLE player_settings ALTER COLUMN theme SET DEFAULT 'tavern'`);
    await knex('player_settings').where({ theme: 'stonehold' }).update({ theme: 'tavern' });
}
