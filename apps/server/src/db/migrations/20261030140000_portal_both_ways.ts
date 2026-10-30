import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Portals work both ways (Nathan, 2026-10-30): anyone at either end of an open
// doorway may step through to the other (services/spells.ts). The spell's
// description said only "anyone standing here", so it is reworded.

const BEFORE = 'Open a doorway from where you stand to any place on this island you have walked to. It stays open a few minutes, and anyone standing here may go through. The longer the road it skips, the more it takes.';
const AFTER = 'Open a doorway between where you stand and any place on this island you have walked to. It stays open a few minutes, and anyone at either end may go through, there or back. The longer the road it skips, the more it takes.';

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    const spell = await knex('spells').where({ key: 'portal' }).first();
    if (!spell) throw new Error('portal_both_ways: no spell with key portal');
    await knex('spells').where({ id: spell.id }).update({ description: AFTER });
}

export async function down(knex: Knex): Promise<void> {
    await knex('spells').where({ key: 'portal' }).update({ description: BEFORE });
}
