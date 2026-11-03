import type { Knex } from 'knex';

// Larder Ward XP follows the hours the ward held (forum, 2026-11-03: casting
// and ending at once refunded the Talar but kept the cast's XP, so the spell
// could be cast and lifted over and over for free Talar XP).
//
//   larder_wards.xp_due         the XP a full ward pays, set at the cast.
//   larder_wards.xp_settled_at  when it was paid: on ending early, for the
//                               share of the hours it held; after it runs its
//                               course, in full. Paid once (a conditional
//                               update on this column), never at the cast.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('larder_wards', 'xp_due'))) {
        await knex.schema.alterTable('larder_wards', (t) => {
            t.integer('xp_due').notNullable().defaultTo(0);
            t.timestamp('xp_settled_at', { useTz: true }).nullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('larder_wards', 'xp_due')) {
        await knex.schema.alterTable('larder_wards', (t) => {
            t.dropColumn('xp_due');
            t.dropColumn('xp_settled_at');
        });
    }
}
