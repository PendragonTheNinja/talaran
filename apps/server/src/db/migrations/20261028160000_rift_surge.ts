import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Talar, step 6 (docs/talar-spec.md §3): the Rift Surge, a world event for
// Talar at the Talar Rift. A roster row on the world-events machinery
// (services/worldEvents.ts): filling pays its XP through awardXp, so the bonus
// lands with no new code, one unit of the pool per 60-second pour.
//
// Uncommon, as the gathering events a step rarer than the commonest are
// (20260930010000): weight 3, 90 to 150 minutes, a pool of 200 to 300 pours,
// which is seven to ten quartz filled across everyone at the Rift. Pinned to
// the Rift by location_ids, since nothing else is a place to fill. The line
// describes the Rift itself; no god is named (spec §1).

const RIFT = 'Talar Rift';
const TYPE = {
    key: 'rift_surge', name: 'Rift Surge', kind: 'skill', skill: 'Talar', rarity: 'uncommon',
    weight: 3, min_minutes: 90, max_minutes: 150, min_pool: 200, max_pool: 300,
    xp_multiplier: 1.25, cooldown_minutes: 360, is_active: true,
    start_text: 'The ground at {location} is breathing harder. Light comes up out of the seam thick enough to see, and a stone filled there earns a quarter more experience while it lasts.',
};

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    const rift = await knex('locations').where({ name: RIFT }).first();
    if (!rift) throw new Error(`rift_surge: no location named ${RIFT}`);
    if (!(await knex('skills').where({ name: TYPE.skill }).first())) throw new Error(`rift_surge: no skill named ${TYPE.skill}`);

    const existing = await knex('world_event_types').where({ key: TYPE.key }).first();
    const row = { ...TYPE, location_ids: [rift.id] };
    if (existing) {
        await knex('world_event_types').where({ id: existing.id }).update({ ...row, updated_at: knex.fn.now() });
    } else {
        const last = await knex('world_event_types').max('display_order as max').first();
        await knex('world_event_types').insert({ ...row, display_order: Number(last?.max ?? 0) + 1 });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex('world_event_types').where({ key: TYPE.key }).delete();
}
