import type { Knex } from 'knex';

// Tools wear out (Nathan, 2026-11-07; services/toolWear.ts, lib/toolWear.ts).
// Combat gear already does (20261012130000_durability); this brings in every
// gathering tool, build tool and bench tool, with numbers of their own.
//
//   tool_durability_tiers    per tier: the uses every tool of that tier is
//                            guaranteed, whatever the skill, and the hours of
//                            work a tool lasts on average. Past the guarantee
//                            each use rolls to break, at a chance worked out
//                            from that action's own timer so a 20 s swing and a
//                            90 s chop wear a tool out in the same hours.
//   tool_break_overrides     a fixed break chance for one skill at one tier,
//                            for tuning by hand. Empty to start.
//   workstation_slot_types.wears   which bench slots hold tools that wear. The
//                            anvil, sawhorse, lap wheel, loom, spinning wheel,
//                            tanning rack and barrel are fixtures and never do.
//   workstation_slots.broken_at    a bench tool that broke stays in its slot,
//                            marked broken: the bench makes do at half speed,
//                            and says so, until a new tool goes in.
//
// Starting numbers: tier 1 guarantees 300 uses and lasts 12 hours of work on
// average (a break every day or two at ~8 hours a day); each tier up x1.25 both.

const TIERS = Array.from({ length: 9 }, (_, i) => ({
    tier: i + 1,
    guaranteed_uses: Math.round(300 * Math.pow(1.25, i)),
    life_hours: Math.round(12 * Math.pow(1.25, i) * 100) / 100,
}));

// Bench slots holding tools that wear in use.
const WEARING_SLOTS: [string, string][] = [
    ['smithing', 'hammer'], ['smithing', 'tongs'],
    ['carpentry', 'saw'], ['carpentry', 'plane'],
    ['cooking', 'cauldron'], ['cooking', 'skillet'], ['cooking', 'cooking_knife'],
    ['cooking', 'meat_cleaver'], ['cooking', 'ladle'], ['cooking', 'flesh_hook'],
    ['cooking', 'mortar_pestle'],
    ['lapidary', 'gem_chisel'], ['lapidary', 'jewelers_pliers'],
];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('tool_durability_tiers'))) {
        await knex.schema.createTable('tool_durability_tiers', (t) => {
            t.integer('tier').primary();
            t.integer('guaranteed_uses').notNullable();
            t.double('life_hours').notNullable();
        });
        await knex.raw(`ALTER TABLE tool_durability_tiers ADD CONSTRAINT tool_durability_tiers_sane
            CHECK (guaranteed_uses >= 0 AND life_hours > 0)`);
    }
    // Inserted when missing, never overwriting a tuned row.
    await knex('tool_durability_tiers').insert(TIERS).onConflict('tier').ignore();

    if (!(await knex.schema.hasTable('tool_break_overrides'))) {
        await knex.schema.createTable('tool_break_overrides', (t) => {
            t.increments('id').primary();
            t.string('skill', 50).notNullable();
            t.integer('tier').notNullable();
            t.double('break_chance_pct').notNullable();
            t.unique(['skill', 'tier']);
        });
        await knex.raw(`ALTER TABLE tool_break_overrides ADD CONSTRAINT tool_break_overrides_sane
            CHECK (break_chance_pct >= 0 AND break_chance_pct <= 100)`);
    }

    if (!(await knex.schema.hasColumn('workstation_slot_types', 'wears'))) {
        await knex.schema.alterTable('workstation_slot_types', (t) => {
            t.boolean('wears').notNullable().defaultTo(false);
        });
    }
    for (const [station_type, slot] of WEARING_SLOTS) {
        await knex('workstation_slot_types').where({ station_type, slot }).update({ wears: true });
    }

    if (!(await knex.schema.hasColumn('workstation_slots', 'broken_at'))) {
        await knex.schema.alterTable('workstation_slots', (t) => {
            t.timestamp('broken_at', { useTz: true }).nullable();
        });
    }

    if (!(await knex.schema.hasColumn('player_stats', 'total_tools_broken'))) {
        await knex.schema.alterTable('player_stats', (t) => {
            t.integer('total_tools_broken').notNullable().defaultTo(0);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('player_stats', 'total_tools_broken')) {
        await knex.schema.alterTable('player_stats', (t) => { t.dropColumn('total_tools_broken'); });
    }
    if (await knex.schema.hasColumn('workstation_slots', 'broken_at')) {
        // A broken tool has no item behind it; it cannot outlive the column.
        await knex('workstation_slots').whereNotNull('broken_at').delete();
        await knex.schema.alterTable('workstation_slots', (t) => { t.dropColumn('broken_at'); });
    }
    if (await knex.schema.hasColumn('workstation_slot_types', 'wears')) {
        await knex.schema.alterTable('workstation_slot_types', (t) => { t.dropColumn('wears'); });
    }
    await knex.schema.dropTableIfExists('tool_break_overrides');
    await knex.schema.dropTableIfExists('tool_durability_tiers');
}
