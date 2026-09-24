import type { Knex } from 'knex';

/**
 * A version number on every trade's offer, bumped by every change to it.
 *
 * Accepting a trade used to mean "whatever is in it when my request lands".
 * The offer routes changed items and gold, then reset both acceptances, as
 * separate statements with no lock on the trade, so a partner who swapped their
 * offer at the moment you clicked Accept could have the trade complete on terms
 * you never saw: the classic bait-and-switch (audit H5).
 *
 * The client now sends back the version it was displaying when you clicked
 * Accept, and the server refuses if the offer has moved on since. Together with
 * the trade row lock every offer change now takes, "accept" means "accept what
 * I saw".
 *
 * Existing trades start at 0, the same as a trade opened after this ships.
 */
export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('trades', 'offer_version'))) {
        await knex.schema.alterTable('trades', (t) => {
            t.integer('offer_version').unsigned().notNullable().defaultTo(0);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('trades', 'offer_version')) {
        await knex.schema.alterTable('trades', (t) => t.dropColumn('offer_version'));
    }
}
