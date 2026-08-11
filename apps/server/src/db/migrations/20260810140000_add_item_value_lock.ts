import type { Knex } from 'knex';

// Protect hand-set item values from the derivation engine.
//
// items.value is editable in the admin content browser, but
// `values:derive -- --write` did a blind update over every derived name, so a
// value you set by hand survived only until the next run. Since the whole point
// of re-running the derivation is to pick up new content, that meant every
// deliberate price decision was on a timer.
//
// value_locked marks a price as a human decision. The derivation reports what
// it WOULD have said for a locked item, and writes nothing.
//
// Editing items.value from the admin panel sets this automatically: a person
// typing a number into that field is, by definition, overriding the formula.
// Clear the flag to hand the item back to the engine.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('items', 'value_locked'))) {
        await knex.schema.alterTable('items', (t) => {
            t.boolean('value_locked').notNullable().defaultTo(false);
        });
    }
    await knex('items').whereNull('value_locked').update({ value_locked: false });
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('items', 'value_locked')) {
        await knex.schema.alterTable('items', (t) => t.dropColumn('value_locked'));
    }
}
