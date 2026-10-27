import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// A tanning soak takes 4 hours, not 6 (Nathan, 2026-10-27). XP per hide is
// unchanged: XP prices the attention of loading and collecting a vat, never the
// clock it soaks on (CLAUDE.md §8). Hides already soaking keep the finish time
// they were loaded with (tanning_jobs.ready_at).

const BEFORE = 6 * 60 * 60;
const AFTER = 4 * 60 * 60;

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    const soaks = knex('recipes').where({ station: 'tanning', mode: 'passive' });
    if (!(await soaks.clone().first())) throw new Error('tanning_four_hours: no tanning recipes found');
    await soaks.clone().where({ timer_seconds: BEFORE }).update({ timer_seconds: AFTER });
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').where({ station: 'tanning', mode: 'passive', timer_seconds: AFTER }).update({ timer_seconds: BEFORE });
}
