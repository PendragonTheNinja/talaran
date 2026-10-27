import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Talar, step 3b (docs/talar-spec.md §3): filling gems at a rift.
//
//   locations.is_rift        where gems can be filled. The Talar Rift today;
//                            any later rift is a row, not code.
//   player_talar_open_gem    the gem being filled: it has LEFT the pack, as an
//                            open bucket has (services/liquids.ts), so a half-
//                            full stone is never held twice, traded or dropped.
//                            One per player; stopping keeps it, starting again
//                            resumes it. Hundredths, like the reservoir.
//   items.talar_per_hour     how fast a gem of this kind fills, on its cut
//                            grades: Quartz 200, Garnet 300, twice the spec's
//                            first numbers (Nathan, 2026-10-27: gems are the
//                            only way to win Talar back, and an hour a quartz
//                            was too long). Each grade pours a little faster
//                            (GRADE_FILL_SPEED). XP is paid by the minute, so
//                            a gem pays half what it did: ~1,110 a Cut Quartz.
//   action_presentation      the scene line and Stop button for 'talar_fill'.
//   Talar is implemented     filling is the way to train it.

const RATES: Record<string, number> = { quartz: 200, garnet: 300 };
const RIFT = 'Talar Rift';
const PRESENTATION = {
    action_type: 'talar_fill',
    kind: null as string | null,
    scene_text: 'You hold the stone out over the Rift and let the light rising from it settle in.',
    cancel_label: 'Stop Filling',
};

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('locations', 'is_rift'))) {
        await knex.schema.alterTable('locations', t => { t.boolean('is_rift').notNullable().defaultTo(false); });
    }
    if (!(await knex.schema.hasColumn('items', 'talar_per_hour'))) {
        await knex.schema.alterTable('items', t => { t.float('talar_per_hour').nullable(); });
    }
    if (!(await knex.schema.hasTable('player_talar_open_gem'))) {
        await knex.schema.createTable('player_talar_open_gem', t => {
            t.integer('player_id').primary().references('id').inTable('players').onDelete('CASCADE');
            t.integer('item_id').notNullable().references('id').inTable('items');
            t.integer('filled_hundredths').notNullable().defaultTo(0);
            t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        });
        await knex.raw('ALTER TABLE player_talar_open_gem ADD CONSTRAINT player_talar_open_gem_nonnegative CHECK (filled_hundredths >= 0)');
    }

    if (!(await hasContent(knex))) return;

    const rift = await knex('locations').where({ name: RIFT }).update({ is_rift: true });
    if (!rift) throw new Error(`talar_filling: no location named ${RIFT}`);

    for (const [subtype, rate] of Object.entries(RATES)) {
        const n = await knex('items').where({ type: 'gem', subtype }).whereIn('quality', ['cut', 'polished', 'flawless'])
            .update({ talar_per_hour: rate });
        if (n !== 3) throw new Error(`talar_filling: expected 3 cut grades of ${subtype}, found ${n}`);
    }

    const existing = await knex('action_presentation').where({ action_type: PRESENTATION.action_type }).whereNull('kind').first();
    if (existing) await knex('action_presentation').where({ id: existing.id }).update({ ...PRESENTATION, updated_at: knex.fn.now() });
    else await knex('action_presentation').insert(PRESENTATION);

    const talar = await knex('skills').where({ name: 'Talar' }).update({ is_implemented: true });
    if (!talar) throw new Error('talar_filling: no skill named Talar');
}

export async function down(knex: Knex): Promise<void> {
    await knex('skills').where({ name: 'Talar' }).update({ is_implemented: false });
    await knex('action_presentation').where({ action_type: PRESENTATION.action_type }).delete();
    await knex.schema.dropTableIfExists('player_talar_open_gem');
    if (await knex.schema.hasColumn('items', 'talar_per_hour')) {
        await knex.schema.alterTable('items', t => { t.dropColumn('talar_per_hour'); });
    }
    if (await knex.schema.hasColumn('locations', 'is_rift')) {
        await knex.schema.alterTable('locations', t => { t.dropColumn('is_rift'); });
    }
}
