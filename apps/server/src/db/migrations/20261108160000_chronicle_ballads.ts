import type { Knex } from 'knex';

// The Chronicle, step 6 (docs/chronicle-spec.md §9): guild ballads. The tables
// and the price exist since step 1 (chronicle_ballads, chronicle_settings
// ballad_price and ballad_cooldown_days); this adds the words. Batch one's two
// both need a hall, so a guild without one (who pays from a purse) had none:
// these fit any guild, and two more sing of a hall.

const BALLADS = [
    'Sing of {guild}, {members} strong, who wear {tag} beside their names and are not ashamed of it. Their {skill} is the talk of the docks.',
    "Here's to {guild}. {members} of them, and not one who'd let the others down. Ask any of them about {skill} and you'll be there all night.",
    '{guild} paid good coin for this song, so listen. {members} names under one banner, and hands that know {skill} better than most.',
    "They say {guild} began as a few friends round a fire. It's {members} now, and the fire is bigger.",
    'Raise a cup to {guild}, whose hall at {place} was built of honest work. {members} on the roll, and every one of them hauled a beam.',
    "There's a hall at {place} with {tag} cut over the door. Knock, if you like. Somebody inside will be talking about {skill}.",
];

function needs(text: string): string[] {
    return [...new Set([...text.matchAll(/\{([a-z0-9 ]+)\}/g)].map((m) => m[1].replace(/^a /, '')))];
}

export async function up(knex: Knex): Promise<void> {
    const have = new Set((await knex('chronicle_verses').where({ kind: 'ballad' }).select('text')).map((r: any) => r.text));
    const rows = BALLADS.filter((t) => !have.has(t)).map((text) => ({ kind: 'ballad', text, needs: needs(text) }));
    if (rows.length) await knex('chronicle_verses').insert(rows);
}

export async function down(knex: Knex): Promise<void> {
    await knex('chronicle_verses').where({ kind: 'ballad' }).whereIn('text', BALLADS).delete();
}
