import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The Crafting Bench, where Crafting's benchless work is done (sewing armor
// and cloaks, cordage, nets, snares, and the rest), is a bench type of its own
// in locations.bench_types: Caliwen's, and Wendhaven's beside the lapidary
// (Nathan, 2026-11-27), so the Snallyscale set and the Bearverine Mantle can
// be made on Antura. It needs no tools and lends nothing, so it is the same
// bench wherever it stands.

const TYPE = 'crafting';
const PLACES = ['Caliwen', 'Wendhaven'];

async function setFor(knex: Knex, name: string, add: boolean): Promise<void> {
    const row = await knex('locations').where({ name }).first('id', 'bench_types');
    if (!row) throw new Error(`crafting_bench_towns: no place named ${name}`);
    const types: string[] = Array.isArray(row.bench_types) ? row.bench_types : [];
    const next = add ? (types.includes(TYPE) ? types : [...types, TYPE]) : types.filter(t => t !== TYPE);
    await knex('locations').where({ id: row.id }).update({ bench_types: next });
}

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    for (const p of PLACES) await setFor(knex, p, true);
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    for (const p of PLACES) await setFor(knex, p, false);
}
