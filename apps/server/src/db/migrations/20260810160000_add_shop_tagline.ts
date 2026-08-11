import type { Knex } from 'knex';

// A short line shown ONLY in the list of shopfronts.
//
// The description is the sign above the counter: it can run to a few lines and
// is read once you are inside. Putting it in the list meant every shop cost
// four rows of vertical space, and a market town with a hundred shops became a
// scroll marathon. The tagline is the one line you get on the row.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('player_shops', 'tagline'))) {
        await knex.schema.alterTable('player_shops', (t) => {
            t.string('tagline', 80).nullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('player_shops', 'tagline')) {
        await knex.schema.alterTable('player_shops', (t) => t.dropColumn('tagline'));
    }
}
