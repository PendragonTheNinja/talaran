import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Underway's granite is just "Granite" (Nathan, 2026-11-26): the button read
// "Mine Underway Granite", naming the place you are already standing in. Its
// own gem odds stay on its drop key (mining:rock:granite@antura), not its name.

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    const n = await knex('resource_nodes').where({ name: 'Underway Granite' }).update({ name: 'Granite' });
    if (n !== 1 && !(await knex('resource_nodes').where({ name: 'Granite', drop_source_key: 'mining:rock:granite@antura' }).first('id'))) {
        throw new Error('underway_granite_name: no node named Underway Granite');
    }
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    await knex('resource_nodes').where({ name: 'Granite', drop_source_key: 'mining:rock:granite@antura' }).update({ name: 'Underway Granite' });
}
