import type { Knex } from 'knex';

// Recipe byproducts, and threshing done properly.
//
// Threshing is beating the grain off the stalk. The stalk that is left over IS
// the straw. They are not two jobs and never were, which is why the flavour
// text has always read oddly: "you beat the grain free from the straw", and
// then no straw arrives.
//
// The reason was schema rather than intent. 20260722070000_farming_processing
// says so in a comment beside the workaround: "Threshing also yields straw —
// modelled as a second recipe output would need schema support, so straw comes
// from its own cheap by-product craft instead." This is that schema support.
//
// A byproduct is a general thing, not a farming one. Sawing gives sawdust,
// butchering gives bone, smelting gives slag. Any recipe can now declare one
// and it costs nothing to leave empty, so the next trade that needs one does
// not need another migration.
//
// ON THE ECONOMY: straw stops being something you choose to make and becomes
// something you cannot avoid, so supply rises and its price should fall. That
// is correct — a byproduct that costs nothing to obtain should not be priced
// like a product. Worth re-running values:derive after this, and worth watching
// whether bedding wants to cost more now that it is nearly free.

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('recipes', (table) => {
        table.string('byproduct_item_name', 60).nullable();
        table.integer('byproduct_qty').notNullable().defaultTo(0);
    });

    // Threshing two sheaves gives three grain and the straw off the same two.
    // The old straw craft turned one sheaf into two straw, so two sheaves are
    // worth four: the rate is unchanged, it simply arrives with the grain.
    await knex('recipes')
        .where({ name: 'Thresh Grain Sheaves' })
        .update({ byproduct_item_name: 'Straw', byproduct_qty: 4 });

    // Retired rather than deleted. Deleting it would break any action row
    // pointing at it mid-craft, and a deactivated recipe already stops being
    // offered everywhere that reads is_active.
    await knex('recipes').where({ name: 'Gather Straw' }).update({ is_active: false });

    // eslint-disable-next-line no-console
    console.log('[byproducts] threshing now yields straw; Gather Straw retired');
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').where({ name: 'Gather Straw' }).update({ is_active: true });
    await knex('recipes')
        .where({ name: 'Thresh Grain Sheaves' })
        .update({ byproduct_item_name: null, byproduct_qty: 0 });

    await knex.schema.alterTable('recipes', (table) => {
        table.dropColumn('byproduct_item_name');
        table.dropColumn('byproduct_qty');
    });
}
