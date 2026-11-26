import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// A hearth of your own at Farefield (Nathan, 2026-11-26): Antura's cooks work
// beside its fields, as Taiar's do at Phoenwick. Your own only; Geomima's is
// the one public hearth. Adds 'cooking' to Farefield's benches
// (locations.bench_types, 20261126160000_bench_towns).

const PLACE = 'Farefield';
const TYPE = 'cooking';

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    const row = await knex('locations').where({ name: PLACE }).first('id', 'bench_types');
    if (!row) throw new Error(`farefield_cookhouse: no place named ${PLACE}`);
    const types: string[] = Array.isArray(row.bench_types) ? row.bench_types : [];
    if (!types.includes(TYPE)) await knex('locations').where({ id: row.id }).update({ bench_types: [...types, TYPE] });
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    const row = await knex('locations').where({ name: PLACE }).first('id', 'bench_types');
    if (!row) return;
    const types: string[] = Array.isArray(row.bench_types) ? row.bench_types : [];
    await knex('locations').where({ id: row.id }).update({ bench_types: types.filter(t => t !== TYPE) });
}
