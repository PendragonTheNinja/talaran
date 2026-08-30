import type { Knex } from 'knex';

// Reference mode for the manual.
//
// The manual is written in the Cartographer's voice, which some players value
// and some want out of the way. Reference mode keeps every table, heading and
// list on a skill page and drops the prose between them, turning a guide into
// a data sheet without maintaining a second copy of anything.
//
// Stored per account rather than per device on purpose: a preference about how
// you like to read should follow you to whatever machine you next sit at, and
// it is the kind of thing a player sets once and never thinks about again.
//
// Default false. Anyone who has never touched it keeps the manual as written,
// which is the version that took the writing.

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('player_settings', (table) => {
        table.boolean('manual_reference_mode').notNullable().defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('player_settings', (table) => {
        table.dropColumn('manual_reference_mode');
    });
}
