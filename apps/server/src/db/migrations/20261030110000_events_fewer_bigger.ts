import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// World events: fewer, longer, bigger (Nathan, 2026-10-30, from the forum: "110
// items is way too small for a Joiner's Fair"). About two a day instead of one
// every three hours, each worth travelling for: a pool short carpentry or
// sawing work cannot empty in minutes, and time enough to get there.
//
//   common    4 to 6 h,  1,000 to 1,500 actions   (was 1 to 2 h, 300 to 500)
//   uncommon  5 to 7 h,    700 to 1,000           (was 1.5 to 2.5 h, 200 to 300)
//   rare      6 to 8 h,    500 to 800             (was 2 to 3 h, 100 to 200)
//   scheduler one every 720 minutes on average     (was 180)
//
// Every skill event type takes its rarity's band, the Rift Surge included.
// All of it stays adjustable from the admin Events tab.

const BANDS: Record<string, { min_minutes: number; max_minutes: number; min_pool: number; max_pool: number }> = {
    common:   { min_minutes: 240, max_minutes: 360, min_pool: 1000, max_pool: 1500 },
    uncommon: { min_minutes: 300, max_minutes: 420, min_pool: 700,  max_pool: 1000 },
    rare:     { min_minutes: 360, max_minutes: 480, min_pool: 500,  max_pool: 800 },
};
const OLD: typeof BANDS = {
    common:   { min_minutes: 60,  max_minutes: 120, min_pool: 300, max_pool: 500 },
    uncommon: { min_minutes: 90,  max_minutes: 150, min_pool: 200, max_pool: 300 },
    rare:     { min_minutes: 120, max_minutes: 180, min_pool: 100, max_pool: 200 },
};
const GAP = 720;
const OLD_GAP = 180;

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    for (const [rarity, band] of Object.entries(BANDS)) {
        await knex('world_event_types').where({ kind: 'skill', rarity }).update({ ...band, updated_at: knex.fn.now() });
    }
    const n = await knex('world_event_settings').where({ id: 1 }).update({ average_gap_minutes: GAP });
    if (!n) throw new Error('events_fewer_bigger: no world_event_settings row');
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('world_event_types'))) return;
    for (const [rarity, band] of Object.entries(OLD)) {
        await knex('world_event_types').where({ kind: 'skill', rarity }).update(band);
    }
    await knex('world_event_settings').where({ id: 1 }).update({ average_gap_minutes: OLD_GAP });
}
