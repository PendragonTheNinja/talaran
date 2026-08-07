import type { Knex } from 'knex';

// Drops items.stackable.
//
// The name promised inventory semantics the column never had. Inventory has
// always been one row per (player_id, item_id) with a quantity, so everything
// stacks regardless; a stackable=false item with quantity 5 was still one row
// reading "5". The flag prevented nothing.
//
// Its only actual effect was cosmetic: whether the drop-confirm button showed a
// count in its label. That reads better off `quantity > 1` anyway, which is what
// the button now uses.
//
// Because it did nothing, it was quietly wrong on a good number of rows — the
// Feed Pail and the mounts were false despite being ownable several at a time —
// and a field that can be wrong without consequence is a field that misleads
// whoever reads it next.
//
// Earlier migrations still insert `stackable` and are left alone: they run
// before this one, so a fresh database creates the column, fills it, and drops
// it at the end. seeds/02_items.ts DID need editing, since seeds run after
// migrations and would otherwise insert into a column that no longer exists.

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('items', 'stackable')) {
        await knex.schema.alterTable('items', (t) => t.dropColumn('stackable'));
    }
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('items', 'stackable'))) {
        await knex.schema.alterTable('items', (t) => {
            // Everything stacked in practice, so true is the honest restore.
            t.boolean('stackable').notNullable().defaultTo(true);
        });
    }
}
