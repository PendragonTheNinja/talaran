import type { Knex } from 'knex';

// Live manual editing (docs/manual-spec.md §2).
//
// Manual prose ships as markdown in apps/client/public/manual/, versioned in git
// alongside the code it documents. That stays the baseline. This table holds
// OVERRIDES: a row here shadows the file of the same section+slug, and deleting
// the row restores the committed version.
//
// Chosen over migrating content wholesale into the database because it keeps git
// history, needs no seeding for a fresh database, and requires no filesystem
// access from the server to the client's public directory (which would break
// wherever nginx serves the client separately).
//
// A row whose section+slug matches no file is simply a new page that exists only
// in the database. That is supported and expected.

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('manual_pages', (table) => {
        table.increments('id').primary();

        table.string('section', 64).notNullable();
        table.string('slug', 128).notNullable();

        // Null title/blurb means "keep whatever the manifest already says".
        table.string('title', 200).nullable();
        table.string('blurb', 500).nullable();

        table.text('content').notNullable().defaultTo('');

        // Null sorts after file pages, in the order they were added.
        table.integer('sort_order').nullable();
        table.boolean('is_published').notNullable().defaultTo(true);

        table.integer('updated_by').nullable().references('id').inTable('players').onDelete('SET NULL');
        table.timestamps(true, true);

        table.unique(['section', 'slug']);
        table.index(['section']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('manual_pages');
}
