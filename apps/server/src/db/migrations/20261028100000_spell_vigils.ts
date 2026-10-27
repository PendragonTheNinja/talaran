import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Talar (docs/talar-spec.md §5; Nathan, 2026-10-27): a spell is learned by
// keeping a vigil at a church, not by a click.
//
//   spells.vigil_minutes        how long the vigil takes (a timed action,
//                               'spell_vigil', resolved by the tick).
//   spells.offering_item_name   a charged gem given up at the end of it.
//   spells.writ_item_name       a writing found in the world, read during the
//                               vigil and given up with the gem. Null for the
//                               first tier: those are taught from the chapel's
//                               own books. Each later spell's migration names
//                               its writ and where it is found.
//   action_presentation         the scene line for the vigil.

const TIER_ONE: Record<string, { vigil_minutes: number; offering_item_name: string }> = {
    wearsight: { vigil_minutes: 10, offering_item_name: 'Lit Quartz' },
    daily_step: { vigil_minutes: 10, offering_item_name: 'Lit Quartz' },
    larder_ward: { vigil_minutes: 10, offering_item_name: 'Lit Quartz' },
    tether: { vigil_minutes: 10, offering_item_name: 'Lit Quartz' },
};

const PRESENTATION = {
    action_type: 'spell_vigil',
    kind: null as string | null,
    scene_text: 'You kneel in the chapel with the stone in your hands, and go over the words until they stay.',
    cancel_label: 'End the Vigil',
};

export async function up(knex: Knex): Promise<void> {
    for (const [column, add] of [
        ['vigil_minutes', (t: Knex.AlterTableBuilder) => t.integer('vigil_minutes').notNullable().defaultTo(10)],
        ['offering_item_name', (t: Knex.AlterTableBuilder) => t.string('offering_item_name', 100).nullable()],
        ['writ_item_name', (t: Knex.AlterTableBuilder) => t.string('writ_item_name', 100).nullable()],
    ] as const) {
        if (!(await knex.schema.hasColumn('spells', column))) await knex.schema.alterTable('spells', t => { add(t); });
    }

    if (!(await hasContent(knex))) return;

    for (const [key, row] of Object.entries(TIER_ONE)) {
        if (!(await knex('items').where({ name: row.offering_item_name }).first())) {
            throw new Error(`spell_vigils: no item named ${row.offering_item_name}`);
        }
        const n = await knex('spells').where({ key }).update({ ...row, updated_at: knex.fn.now() });
        if (!n) throw new Error(`spell_vigils: no spell with key ${key}`);
    }

    const existing = await knex('action_presentation').where({ action_type: PRESENTATION.action_type }).whereNull('kind').first();
    if (existing) await knex('action_presentation').where({ id: existing.id }).update({ ...PRESENTATION, updated_at: knex.fn.now() });
    else await knex('action_presentation').insert(PRESENTATION);
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable('action_presentation')) {
        await knex('action_presentation').where({ action_type: PRESENTATION.action_type }).delete();
    }
    for (const column of ['writ_item_name', 'offering_item_name', 'vigil_minutes']) {
        if (await knex.schema.hasColumn('spells', column)) await knex.schema.alterTable('spells', t => { t.dropColumn(column); });
    }
}
