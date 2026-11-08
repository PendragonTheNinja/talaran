import type { Knex } from 'knex';

// The Chronicle, step 5 (docs/chronicle-spec.md §7, §15): rumours, and Wenna's
// line on a news post (news_posts.chronicle_line already exists, step 1).
//
//   chronicle_lines.subject          what a line was about, kept for rumours so
//                                    the same subject is not rumoured twice in
//                                    rumour_cooldown_days
//   world_event_settings
//     merchant_next_location_id      where the travelling merchant goes next,
//                                    chosen when his next visit is set, so a
//                                    rumour of his sail can be true
//   chronicle_settings
//     rumour_chance                  percent of pages that carry one, when one
//                                    is true at all (never forced)
//     rumour_cooldown_days           14 (§15)
//   verses                           more rumours than batch one's one a kind

const VERSES: Record<string, string[]> = {
    rumour_unkilled: [
        'Fishermen say {a creature} has been seen near {place}. Nobody has ever beaten one, and nobody seems keen to try.',
        'There is {a creature} out by {place} that has never once lost a fight. Somebody ought to change that.',
    ],
    rumour_unfilled_case: [
        'The keepers of the {museum} dust an empty case in {exhibit} every morning, waiting.',
        "One case in {exhibit} at the {museum} has never held a thing. The keepers won't say what it is for.",
    ],
    rumour_unfound_item: [
        "Something turns up at {place} now and then that nobody alive has held. That's what they say, anyway.",
        'An old woman at the bar swears {place} hides a thing no one has ever brought home. She buys her own drinks, so perhaps it is true.',
    ],
    rumour_unwalked_road: [
        'The road out of {place} toward {place2} has never felt a traveller\'s boot. Not one.',
        'Nobody has ever gone from {place} to {place2}. The map says the road is there. Somebody should find out.',
    ],
    rumour_merchant: [
        'A trader at the docks says the travelling merchant is bound for {place}. Keep your purse handy.',
        "Gulls are following a heavy cart toward {place}. Wenna knows that cart.",
    ],
};

const SETTINGS: Record<string, unknown> = { rumour_chance: 50, rumour_cooldown_days: 14 };

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('chronicle_lines', 'subject'))) {
        await knex.schema.alterTable('chronicle_lines', (t) => { t.string('subject', 200).nullable(); });
    }
    if (!(await knex.schema.hasColumn('world_event_settings', 'merchant_next_location_id'))) {
        await knex.schema.alterTable('world_event_settings', (t) => {
            t.integer('merchant_next_location_id').nullable().references('id').inTable('locations').onDelete('SET NULL');
        });
    }
    for (const [key, value] of Object.entries(SETTINGS)) {
        await knex('chronicle_settings').insert({ key, value: JSON.stringify(value) }).onConflict('key').ignore();
    }
    for (const [kind, texts] of Object.entries(VERSES)) {
        const have = new Set((await knex('chronicle_verses').where({ kind }).select('text')).map((r: any) => r.text));
        const rows = texts.filter((t) => !have.has(t)).map((text) => ({
            kind, text, needs: [...new Set([...text.matchAll(/\{([a-z0-9 ]+)\}/g)].map((m) => m[1].replace(/^a /, '')))],
        }));
        if (rows.length) await knex('chronicle_verses').insert(rows);
    }
}

export async function down(knex: Knex): Promise<void> {
    for (const [kind, texts] of Object.entries(VERSES)) await knex('chronicle_verses').where({ kind }).whereIn('text', texts).delete();
    await knex('chronicle_settings').whereIn('key', Object.keys(SETTINGS)).delete();
    if (await knex.schema.hasColumn('world_event_settings', 'merchant_next_location_id')) {
        await knex.schema.alterTable('world_event_settings', (t) => { t.dropColumn('merchant_next_location_id'); });
    }
    if (await knex.schema.hasColumn('chronicle_lines', 'subject')) {
        await knex.schema.alterTable('chronicle_lines', (t) => { t.dropColumn('subject'); });
    }
}
