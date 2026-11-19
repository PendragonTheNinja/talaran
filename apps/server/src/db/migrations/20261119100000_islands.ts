import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Islands as rows (docs/antura-plan.md §14): the one place an island's facts
// live, so code stops assuming there is only Taiar. `name` is the
// `locations.region` its places carry.
//
//   tier    the island's tier. Fields count highest-tier island first for the
//           XP share by place (lib/holdingShare.ts; CLAUDE.md §8, Nathan
//           2026-11-15), so Taiar's are always the lowest places.
//
// Antura's row comes with Antura's places.

const ISLANDS = [{ name: 'Taiar Island', tier: 1, display_order: 1 }];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('islands'))) {
        await knex.schema.createTable('islands', (t) => {
            t.string('name', 100).primary();
            t.integer('tier').notNullable().defaultTo(1);
            t.integer('display_order').notNullable().defaultTo(0);
        });
    }
    if (!(await hasContent(knex))) return;
    for (const i of ISLANDS) await knex('islands').insert(i).onConflict('name').merge();
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('islands');
}
