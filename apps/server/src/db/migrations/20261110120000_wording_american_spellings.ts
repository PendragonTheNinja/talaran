import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Wording pass, part three (Nathan, 2026-11-10): American spellings in the
// text that needed nothing else. Wenna's verses and the feats read well as
// they are, so only the spellings change: thirteen verses, the feat category
// "Labour", and one hyphen ("twenty-five thousand").
//
// A verse has no name, so it is found by its kind and its exact text, never by
// id. A row that is missing where content exists is a loud error. down() puts
// the earlier spelling back.

interface Verse { kind: string; before: string; after: string }

const VERSES: Verse[] = [
    { kind: "death", before: "{player} went to {place} with more courage than armour, and {a creature} was waiting.", after: "{player} went to {place} with more courage than armor, and {a creature} was waiting." },
    { kind: "event_winner_guild", before: "{guild} came to {place} in force and left with the honours.", after: "{guild} came to {place} in force and left with the honors." },
    { kind: "merchant_arrived", before: "The travelling merchant is at {place}. Bring coin, and do not believe everything he says.", after: "The traveling merchant is at {place}. Bring coin, and do not believe everything he says." },
    { kind: "today:guild_hall_tier", before: "The hammering at {place} stopped this afternoon. Somebody's hall stands a storey higher.", after: "The hammering at {place} stopped this afternoon. Somebody's hall stands a story higher." },
    { kind: "rumour_unwalked_road", before: "The road out of {place} toward {place2} has never felt a traveller's boot. Not one.", after: "The road out of {place} toward {place2} has never felt a traveler's boot. Not one." },
    { kind: "rumour_merchant", before: "A trader at the docks says the travelling merchant is bound for {place}. Keep your purse handy.", after: "A trader at the docks says the traveling merchant is bound for {place}. Keep your purse handy." },
    { kind: "event_winner_guild", before: "Honours at {place} go to {guild}.", after: "Honors at {place} go to {guild}." },
    { kind: "event_winner_guild", before: "{guild} came, worked, and went home with the honours from {place}.", after: "{guild} came, worked, and went home with the honors from {place}." },
    { kind: "merchant_arrived", before: "The travelling merchant pulled his cart into {place} today. Go and see what he has.", after: "The traveling merchant pulled his cart into {place} today. Go and see what he has." },
    { kind: "merchant_arrived", before: "Word from {place}: the travelling merchant is in, and he is buying as well as selling.", after: "Word from {place}: the traveling merchant is in, and he is buying as well as selling." },
    { kind: "merchant_arrived", before: "The travelling merchant has set up at {place}. He looked tired, but his prices did not.", after: "The traveling merchant has set up at {place}. He looked tired, but his prices did not." },
    { kind: "road_first", before: "The road from {place} to {place2} has had a traveller at last. {player}.", after: "The road from {place} to {place2} has had a traveler at last. {player}." },
    { kind: "field_twenty", before: "{player} has twenty fields at Novita. That is a lot of ploughing.", after: "{player} has twenty fields at Novita. That is a lot of plowing." },
];

const FEAT = {
    name: "A Year of Mornings",
    before: "Finish twenty five thousand actions.",
    after: "Finish twenty-five thousand actions.",
};
const CATEGORY = { before: 'Labour', after: 'Labor' };

async function write(knex: Knex, from: 'before' | 'after', to: 'before' | 'after'): Promise<void> {
    if (!(await hasContent(knex))) return;

    for (const v of VERSES) {
        const changed = await knex('chronicle_verses').where({ kind: v.kind, text: v[from] }).update({ text: v[to] });
        if (changed > 0) continue;
        // Already in the wanted spelling (a second run) is fine; gone altogether is not.
        const there = await knex('chronicle_verses').where({ kind: v.kind, text: v[to] }).first('id');
        if (!there) throw new Error(`Rewording: no "${v.kind}" verse reading "${v[from]}".`);
    }

    const feat = await knex('feats').where({ name: FEAT.name }).update({ description: FEAT[to] });
    if (feat === 0) throw new Error(`Rewording: no feat named "${FEAT.name}".`);

    await knex('feats').where({ category: CATEGORY[from] }).update({ category: CATEGORY[to] });
    const inCategory = await knex('feats').where({ category: CATEGORY[to] }).first('id');
    if (!inCategory) throw new Error(`Rewording: no feats in the "${CATEGORY[to]}" category.`);
}

export async function up(knex: Knex): Promise<void> {
    await write(knex, 'before', 'after');
}

export async function down(knex: Knex): Promise<void> {
    await write(knex, 'after', 'before');
}
