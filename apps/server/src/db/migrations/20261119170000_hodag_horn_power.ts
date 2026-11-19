import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// A rare weapon is as strong as the next tier's smithed weapon of its form
// (docs/combat-spec.md §13). The Hodag Horn (two-hand pierce) was set at 80
// power by hand (20261030120000_twohand_power), where the formula gives 80.6;
// the smithed Serph Atgeir is 81 by the same formula rounded, so the Horn is
// raised to match (Nathan, 2026-11-19). Aim was already equal, 148.

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    const n = await knex('items').where({ name: 'Hodag Horn' }).update({ power: 81 });
    if (n !== 1) throw new Error('hodag_horn_power: no item named Hodag Horn');
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    await knex('items').where({ name: 'Hodag Horn' }).update({ power: 80 });
}
