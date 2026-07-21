import type { Knex } from 'knex';

// Per-catch flavor text for trapping. Shown on the catch reveal. Nullable, so
// targets without it simply show no flavor line; editable in the admin Content
// tab like any other trap_targets column. Seeds the Squonk's, per its folklore:
// the squonk weeps constantly and, when cornered, dissolves into its own tears.
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('trap_targets', (t) => {
        t.text('flavor_text').nullable();
    });
    await knex('trap_targets')
        .where({ name: 'Squonk' })
        .update({
            flavor_text:
                'Your snare closes on nothing but a spreading puddle. Cornered at last, the squonk has wept itself away... dissolved into bubbles and brine, as its kind always do when there is nowhere left to hide. Only its tears remain.',
        });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('trap_targets', (t) => {
        t.dropColumn('flavor_text');
    });
}
