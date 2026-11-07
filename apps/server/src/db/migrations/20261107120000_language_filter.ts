import type { Knex } from 'knex';

// The language filter (Nathan, 2026-11-07; lib/wordFilter.ts, services/wordFilter.ts).
// Public text (world, region, trade and help chat, the forum, guild and shop
// descriptions) has swears swapped for silly words, with a private nudge to
// the sender; a slur stops the text being posted at all and flags it to staff.
// Usernames, guild names and tags, and shop names with either are refused.
// Guild chat, whispers, private messages and the guild forum are left alone.
//
//   filter_words        the list: a word, swear or slur, and `embedded` when it
//                       is also caught inside a longer word (names, compounds)
//   filter_substitutes  the silly words a swear becomes
//   filter_allow        innocent words holding an embedded one ("snigger")
//   filter_flags        slurs that were stopped, for staff to review
//
// The list is a starting point (Nathan will add to it), edited from the admin
// content browser. A word matches whole, with repeated letters, look-alike
// letters and common endings, so "classic" and "Scunthorpe" are never touched.
// `embedded` is only for words that hide inside nothing innocent; the test
// against 274,000 English words (2026-11-07) decided which.

export const WORDS: { word: string; kind: 'swear' | 'slur'; embedded: boolean }[] = [
    // Swears
    { word: 'fuck', kind: 'swear', embedded: true },
    { word: 'fuk', kind: 'swear', embedded: false },
    { word: 'fck', kind: 'swear', embedded: false },
    { word: 'fcuk', kind: 'swear', embedded: false },
    { word: 'phuck', kind: 'swear', embedded: false },
    { word: 'fuq', kind: 'swear', embedded: false },
    { word: 'shit', kind: 'swear', embedded: true },
    { word: 'shite', kind: 'swear', embedded: false },
    { word: 'shitty', kind: 'swear', embedded: false },
    { word: 'bullshit', kind: 'swear', embedded: true },
    { word: 'shithead', kind: 'swear', embedded: true },
    { word: 'bitch', kind: 'swear', embedded: true },
    { word: 'bitchy', kind: 'swear', embedded: false },
    { word: 'bastard', kind: 'swear', embedded: false },
    { word: 'ass', kind: 'swear', embedded: false },
    { word: 'asshole', kind: 'swear', embedded: true },
    { word: 'asshat', kind: 'swear', embedded: true },
    { word: 'jackass', kind: 'swear', embedded: false },
    { word: 'dumbass', kind: 'swear', embedded: true },
    { word: 'smartass', kind: 'swear', embedded: true },
    { word: 'arse', kind: 'swear', embedded: false },
    { word: 'arsehole', kind: 'swear', embedded: true },
    { word: 'damn', kind: 'swear', embedded: false },
    { word: 'goddamn', kind: 'swear', embedded: true },
    { word: 'dammit', kind: 'swear', embedded: false },
    { word: 'crap', kind: 'swear', embedded: false },
    { word: 'crappy', kind: 'swear', embedded: false },
    { word: 'piss', kind: 'swear', embedded: false },
    { word: 'dick', kind: 'swear', embedded: false },
    { word: 'dickhead', kind: 'swear', embedded: true },
    { word: 'cock', kind: 'swear', embedded: false },
    { word: 'cocksucker', kind: 'swear', embedded: true },
    { word: 'cunt', kind: 'swear', embedded: false },
    { word: 'twat', kind: 'swear', embedded: false },
    { word: 'wank', kind: 'swear', embedded: false },
    { word: 'wanker', kind: 'swear', embedded: true },
    { word: 'bollocks', kind: 'swear', embedded: false },
    { word: 'bugger', kind: 'swear', embedded: false },
    { word: 'slut', kind: 'swear', embedded: false },
    { word: 'slutty', kind: 'swear', embedded: false },
    { word: 'whore', kind: 'swear', embedded: true },
    { word: 'titties', kind: 'swear', embedded: false },
    { word: 'boob', kind: 'swear', embedded: false },
    { word: 'boobs', kind: 'swear', embedded: false },
    { word: 'porn', kind: 'swear', embedded: true },
    { word: 'dildo', kind: 'swear', embedded: true },
    { word: 'jizz', kind: 'swear', embedded: true },
    { word: 'cum', kind: 'swear', embedded: false },
    { word: 'douche', kind: 'swear', embedded: false },
    { word: 'douchebag', kind: 'swear', embedded: true },
    { word: 'skank', kind: 'swear', embedded: false },
    { word: 'homo', kind: 'swear', embedded: false },
    { word: 'wtf', kind: 'swear', embedded: false },
    { word: 'stfu', kind: 'swear', embedded: false },
    { word: 'ffs', kind: 'swear', embedded: false },
    // Slurs: never posted, flagged to staff.
    { word: 'nigger', kind: 'slur', embedded: true },
    { word: 'nigga', kind: 'slur', embedded: false },
    { word: 'niggah', kind: 'slur', embedded: true },
    { word: 'faggot', kind: 'slur', embedded: false },
    { word: 'fag', kind: 'slur', embedded: false },
    { word: 'tranny', kind: 'slur', embedded: false },
    { word: 'spic', kind: 'slur', embedded: false },
    { word: 'kike', kind: 'slur', embedded: false },
    { word: 'gook', kind: 'slur', embedded: false },
    { word: 'wetback', kind: 'slur', embedded: true },
    { word: 'beaner', kind: 'slur', embedded: false },
    { word: 'coon', kind: 'slur', embedded: false },
    { word: 'paki', kind: 'slur', embedded: false },
    { word: 'raghead', kind: 'slur', embedded: true },
    { word: 'towelhead', kind: 'slur', embedded: true },
    { word: 'retard', kind: 'slur', embedded: false },
    { word: 'retarded', kind: 'slur', embedded: false },
    { word: 'spastic', kind: 'slur', embedded: false },
    { word: 'spaz', kind: 'slur', embedded: false },
    { word: 'kys', kind: 'slur', embedded: false },
];

export const SUBSTITUTES = [
    'fiddlesticks', 'turnips', 'codswallop', 'balderdash', 'hogwash', 'piffle',
    'flapdoodle', 'crumpets', 'sugarplums', 'horsefeathers', 'jellybeans',
    'moonbeams', 'bumblebees', 'tiddlywinks', 'mudpuddles', 'dumplings',
    'gooseberries', 'buttercups', 'pumpernickel', 'thimbles', 'parsnips',
    'pickled herring', 'wobbly custard', 'soggy biscuits',
];

// Innocent words that hold an embedded listed word, found by the dictionary test.
export const ALLOW_INSIDE = ['snigger', 'swank', 'shiitake', 'shitake', 'mishit', 'shittah', 'shittim', 'shitzu'];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('filter_words'))) {
        await knex.schema.createTable('filter_words', (t) => {
            t.increments('id').primary();
            t.string('word', 60).notNullable().unique();
            t.string('kind', 10).notNullable().defaultTo('swear');
            t.boolean('embedded').notNullable().defaultTo(false);
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        });
        await knex.raw("ALTER TABLE filter_words ADD CONSTRAINT filter_words_kind_check CHECK (kind IN ('swear', 'slur'))");
    }
    if (!(await knex.schema.hasTable('filter_substitutes'))) {
        await knex.schema.createTable('filter_substitutes', (t) => {
            t.increments('id').primary();
            t.string('word', 40).notNullable().unique();
        });
    }
    if (!(await knex.schema.hasTable('filter_allow'))) {
        await knex.schema.createTable('filter_allow', (t) => {
            t.increments('id').primary();
            t.string('word', 60).notNullable().unique();
        });
    }
    if (!(await knex.schema.hasTable('filter_flags'))) {
        await knex.schema.createTable('filter_flags', (t) => {
            t.increments('id').primary();
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            // Where it was typed: 'chat:world', 'forum:post', 'name:username', ...
            t.string('place', 40).notNullable();
            t.text('text').notNullable();
            t.string('matched', 200).notNullable();
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.integer('reviewed_by').nullable().references('id').inTable('players').onDelete('SET NULL');
            t.timestamp('reviewed_at', { useTz: true }).nullable();
            t.index(['reviewed_at', 'created_at']);
        });
    }
    // The list is content: inserted when missing, never overwriting an edit.
    await knex('filter_words').insert(WORDS).onConflict('word').ignore();
    await knex('filter_substitutes').insert(SUBSTITUTES.map(word => ({ word }))).onConflict('word').ignore();
    await knex('filter_allow').insert(ALLOW_INSIDE.map(word => ({ word }))).onConflict('word').ignore();
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('filter_flags');
    await knex.schema.dropTableIfExists('filter_allow');
    await knex.schema.dropTableIfExists('filter_substitutes');
    await knex.schema.dropTableIfExists('filter_words');
}
