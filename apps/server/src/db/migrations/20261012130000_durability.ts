import type { Knex } from 'knex';

// Combat, step 7: durability (docs/combat-spec.md §13).
//
// Every piece of combat gear has a GUARANTEED number of uses, counted per
// player per item (items stack, so the count cannot live on a copy), and only
// after that does each use roll to break. A break resets the count, so the
// next copy is safe again.
//
//   durability_tiers         per tier: guaranteed uses, then the break chance
//                            per use. Tunable from the admin content browser.
//   items.durability_uses /  per-item overrides (rare drops, Crabshell), null
//   items.durability_break_pct  for the tier's numbers
//   player_item_wear         uses since the last break, per player per item
//   player_stats.total_gear_broken
//
// Starting numbers (decided 2026-10-10): tier 1 guarantees 200 uses then 1% a
// use; each tier up x1.25 the uses and x0.85 the chance.

const TIERS = Array.from({ length: 9 }, (_, i) => ({
    tier: i + 1,
    guaranteed_uses: Math.round(200 * Math.pow(1.25, i)),
    break_chance_pct: Math.round(1.0 * Math.pow(0.85, i) * 1000) / 1000,
}));

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('durability_tiers'))) {
        await knex.schema.createTable('durability_tiers', t => {
            t.integer('tier').primary();
            t.integer('guaranteed_uses').notNullable();
            t.double('break_chance_pct').notNullable();
        });
        await knex.raw(`ALTER TABLE durability_tiers ADD CONSTRAINT durability_tiers_sane
            CHECK (guaranteed_uses >= 0 AND break_chance_pct >= 0 AND break_chance_pct <= 100)`);
    }
    for (const row of TIERS) {
        await knex('durability_tiers').insert(row).onConflict('tier').merge();
    }

    for (const [name, add] of [
        ['durability_uses', (t: Knex.AlterTableBuilder) => { t.integer('durability_uses').nullable(); }],
        ['durability_break_pct', (t: Knex.AlterTableBuilder) => { t.double('durability_break_pct').nullable(); }],
    ] as const) {
        if (!(await knex.schema.hasColumn('items', name))) await knex.schema.alterTable('items', add);
    }

    if (!(await knex.schema.hasTable('player_item_wear'))) {
        await knex.schema.createTable('player_item_wear', t => {
            t.integer('player_id').unsigned().notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.integer('item_id').unsigned().notNullable().references('id').inTable('items').onDelete('CASCADE');
            t.integer('uses').notNullable().defaultTo(0);
            t.primary(['player_id', 'item_id']);
        });
        await knex.raw('ALTER TABLE player_item_wear ADD CONSTRAINT player_item_wear_uses_nonnegative CHECK (uses >= 0)');
    }

    if (!(await knex.schema.hasColumn('player_stats', 'total_gear_broken'))) {
        await knex.schema.alterTable('player_stats', t => { t.integer('total_gear_broken').notNullable().defaultTo(0); });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('player_stats', 'total_gear_broken')) {
        await knex.schema.alterTable('player_stats', t => { t.dropColumn('total_gear_broken'); });
    }
    await knex.schema.dropTableIfExists('player_item_wear');
    for (const name of ['durability_break_pct', 'durability_uses']) {
        if (await knex.schema.hasColumn('items', name)) await knex.schema.alterTable('items', t => { t.dropColumn(name); });
    }
    await knex.schema.dropTableIfExists('durability_tiers');
}
