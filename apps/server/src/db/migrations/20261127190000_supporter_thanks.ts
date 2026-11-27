import type { Knex } from 'knex';

// A thank-you in chat for every Taler purchase (Nathan, 2026-11-27), naming the
// buyer, or nobody when they support anonymously (player_settings.hide_from_patrons,
// which also keeps them off the Patrons plaque).
//
//   announcement_lines   lines the server says, by key, one picked at random
//                        each time: content, so a wording change is a row
//                        (registered in lib/contentTables.ts). {player} is
//                        filled in where the key names one.

const LINES: { key: string; text: string }[] = [
    { key: 'supporter_thanks', text: '{player} has put coin toward keeping Talaran\'s lamps lit. Thank you.' },
    { key: 'supporter_thanks', text: '{player} has stood a round for the whole of Talaran. Thank you.' },
    { key: 'supporter_thanks', text: 'The Maker tips a hat to {player}, who has helped keep the roads open. Thank you.' },
    { key: 'supporter_thanks', text: '{player} has dropped a purse in the town box. Talaran is grateful.' },
    { key: 'supporter_thanks_anonymous', text: 'Someone has put coin toward keeping Talaran\'s lamps lit, and would rather not say who. Thank you.' },
    { key: 'supporter_thanks_anonymous', text: 'A purse was left in the town box with no name on it. Talaran is grateful all the same.' },
    { key: 'supporter_thanks_anonymous', text: 'An anonymous friend of Talaran has helped keep the roads open. Thank you, whoever you are.' },
];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('announcement_lines'))) {
        await knex.schema.createTable('announcement_lines', (t) => {
            t.increments('id').primary();
            t.string('key', 50).notNullable();
            t.text('text').notNullable();
            t.boolean('enabled').notNullable().defaultTo(true);
            t.index(['key']);
        });
    }
    // Lines are content, but these few are the feature itself, so they go in
    // with it on any database (a fresh one gets them here, and the snapshot
    // carries any staff edits after).
    for (const l of LINES) {
        const had = await knex('announcement_lines').where({ key: l.key, text: l.text }).first('id');
        if (!had) await knex('announcement_lines').insert(l);
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('announcement_lines');
}
