import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Which benches a player may set up in a town (Nathan, 2026-11-26): a row's
// own list, never a town name in the code. Taiar keeps its four bench towns;
// Antura gets a smithy (forge and kiln) at Mettlefell and a lapidary at
// Wendhaven, a player's own only, since public benches are Taiar's alone.
// Station types are workstations.type ('smithing' covers the forge and kiln).

const BENCHES: Record<string, string[]> = {
    Emberra: ['smithing'],
    Verdale: ['carpentry'],
    Caliwen: ['tanning', 'lapidary', 'textile'],
    Phoenwick: ['cooking'],
    Mettlefell: ['smithing'],
    Wendhaven: ['lapidary'],
};

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('locations', 'bench_types'))) {
        await knex.schema.alterTable('locations', (t) => {
            t.specificType('bench_types', 'text[]').notNullable().defaultTo('{}');
        });
    }
    if (!(await hasContent(knex))) return;
    for (const [name, types] of Object.entries(BENCHES)) {
        const n = await knex('locations').where({ name }).update({ bench_types: types });
        if (n !== 1) throw new Error(`bench_towns: no single place named ${name}`);
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('locations', 'bench_types')) {
        await knex.schema.alterTable('locations', (t) => { t.dropColumn('bench_types'); });
    }
}
