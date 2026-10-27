import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Talar, step 3a (docs/talar-spec.md §2, §4): the reservoir, and the charged
// gems that fill it.
//
//   player_talar   one row per player: the Talar inside them, in HUNDREDTHS so
//                  jewelry's fractional draw (§8) is exact. Missing row = empty.
//                  CHECK >= 0, the database's backstop under services/talar.ts.
//   items.talar    what a gem holds, in whole Talar: on a cut gem, what it will
//                  take when filled; on a charged gem, what it gives when
//                  absorbed. Grades hold 1 : 1.5 : 3 (lib/gemGrades.ts).
//   Charged gems   Lit (a filled Cut gem), Bright (Polished), Radiant (Flawless)
//                  (Nathan, 2026-10-25). Lit and Bright and Radiant Garnet are
//                  tier 2: they are first filled at Talar 13.

const GEMS = [
    { gem: 'Quartz', subtype: 'quartz', tier: 1, holds: [100, 150, 300] },
    { gem: 'Garnet', subtype: 'garnet', tier: 2, holds: [200, 300, 600] },
];
const CUT = ['Cut', 'Polished', 'Flawless'];
const CHARGED = ['Lit', 'Bright', 'Radiant'];
const CHARGED_QUALITY = ['lit', 'bright', 'radiant'];

const DESCRIPTIONS: Record<string, string[]> = {
    Quartz: [
        'A cut quartz with a little light caught inside it. It is warm in the hand, as if it had been lying in the sun.',
        'A polished quartz full of a steady light. In a dark room it throws a pale glow on your palm.',
        'A flawless quartz brimming with light. It hums, very faintly, if you hold it to your ear.',
    ],
    Garnet: [
        'A cut garnet lit from within, the colour of an ember in the morning ash.',
        'A polished garnet glowing like a coal. The light inside it moves when you do.',
        'A flawless garnet so full of light it seems to breathe. Nobody holds one for long without smiling.',
    ],
};

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('player_talar'))) {
        await knex.schema.createTable('player_talar', t => {
            t.integer('player_id').primary().references('id').inTable('players').onDelete('CASCADE');
            t.integer('hundredths').notNullable().defaultTo(0);
            t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        });
        await knex.raw('ALTER TABLE player_talar ADD CONSTRAINT player_talar_nonnegative CHECK (hundredths >= 0)');
    }
    if (!(await knex.schema.hasColumn('items', 'talar'))) {
        await knex.schema.alterTable('items', t => { t.integer('talar').nullable(); });
    }

    if (!(await hasContent(knex))) return;

    for (const g of GEMS) {
        for (let i = 0; i < 3; i++) {
            const cutName = `${CUT[i]} ${g.gem}`;
            const updated = await knex('items').where({ name: cutName }).update({ talar: g.holds[i] });
            if (!updated) throw new Error(`talar_reservoir: item ${cutName} not found`);

            const name = `${CHARGED[i]} ${g.gem}`;
            const row = {
                name, type: 'gem', subtype: g.subtype, quality: CHARGED_QUALITY[i], tier: g.tier,
                level_required: 1, talar: g.holds[i], description: DESCRIPTIONS[g.gem][i], is_active: true,
            };
            const existing = await knex('items').where({ name }).first();
            if (existing) await knex('items').where({ id: existing.id }).update(row);
            else await knex('items').insert(row);
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    // Charged gems stay, as items always do (players may hold them).
    if (await knex.schema.hasColumn('items', 'talar')) {
        await knex.schema.alterTable('items', t => { t.dropColumn('talar'); });
    }
    await knex.schema.dropTableIfExists('player_talar');
}
