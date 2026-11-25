import type { Knex } from 'knex';

// The same find, told once (forum "Daily Chronicle Suggestion: Combining Like
// Notes", 2026-11-20; Nathan, 2026-11-25). When several people find the same
// rare thing, trophy, or cryptid in a day, the composer folds them into one
// find_many line naming them all (services/chronicleComposer.ts, GROUPED_FINDS),
// instead of a line each that reads like the same news twice.
//
// Slots: {players} (a list, "A, B, and C"), {item} / {a item}, {place} when
// they were all at one place, {places} when they were at several, {n} (how
// many, in words). A verse naming a slot the line cannot fill is never used,
// so the place-free verses carry any mix of places. The today: verses name
// nobody (the Wenna tab's tidings so far).

const KIND = { key: 'find_many', section: 'island', base_weight: 25, max_per_page: null, enabled: true, label: 'The same find, by several' };

const V: Record<string, string[]> = {
    find_many: [
        'Many have worked until their backs ached and never seen {a item}. Today {players} joined the few who have.',
        'They say {a item} shows itself only to the pure of heart. {players} were found worthy today, at {places}.',
        'At {place}, {players} each came away with {a item}. Whatever is in the ground there, Wenna would like some.',
        '{players}: every one of them went home with {a item} today. The rest of us went home with sore backs.',
        'If you did not find {a item} today, take heart. {players} did, so they are out there.',
        '{players} found {a item} apiece, at {places}. Wenna has stopped saying they are rare.',
        'A good day to be hunting {a item}, if you happen to be {players}.',
        '{n} of them at {place} today, and each with {a item}: {players}. Nobody is saying who found theirs first.',
        'Wenna had {a item} on the bar tonight, then another, then another. {players} were buying, for once.',
        '{a item} for {players}, all in one day. Folk at {place} are starting to talk.',
        'It nearly rained {item} today. {players} each caught one.',
        'There was {a item} for {players} today, at {places}, and a long night at the Salty Sloth after.',
    ],
    'today:find_many': [
        '{a item} has turned up more than once today. Wenna will name the lucky ones tomorrow.',
        '{n} people have found {a item} today. Who, you will hear tomorrow.',
        'Something about today and {a item}: it keeps being found.',
    ],
};

function needs(text: string): string[] {
    return [...new Set([...text.matchAll(/\{([a-z0-9 ]+)\}/g)].map((m) => m[1].replace(/^a /, '')))];
}

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('chronicle_deed_kinds'))) return;
    await knex('chronicle_deed_kinds').insert(KIND).onConflict('key').ignore();
    for (const [kind, texts] of Object.entries(V)) {
        const have = new Set((await knex('chronicle_verses').where({ kind }).select('text')).map((r: any) => r.text));
        const rows = texts.filter((t) => !have.has(t)).map((text) => ({ kind, text, needs: needs(text) }));
        if (rows.length) await knex('chronicle_verses').insert(rows);
    }
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('chronicle_deed_kinds'))) return;
    for (const [kind, texts] of Object.entries(V)) {
        await knex('chronicle_verses').where({ kind }).whereIn('text', texts).delete();
    }
    await knex('chronicle_deed_kinds').where({ key: KIND.key }).delete();
}
