import type { Knex } from 'knex';

// More of Wenna's lines for finds, trophies, firsts, records, cut stones and
// museum gifts (Nathan, 2026-11-12: "it's a lot of fun"). Same slots as the
// verses already there: player, item ({a item} adds a or an), place, weight,
// museum. A verse naming a slot the deed cannot fill is never used.

const V: Record<string, string[]> = {
    drop_rare: [
        '{player} found {a item} at {place} and spent the rest of the day checking their pockets for it.',
        'At {place}, {player} bent to look at something odd and stood up with {a item}.',
        '{a item} for {player}. {place} does not give those to just anyone.',
        '{player} has {a item} wrapped in a rag at the bottom of their pack. {place}, they say. Do not ask where exactly.',
        'The dogs at {place} barked all afternoon. {player} came back with {a item}. Make of that what you will.',
        '{player} found {a item} at {place}, put it down, picked it up again, and walked home grinning.',
        'Word from {place}: {player} has {a item}. Wenna has asked to hold it. Wenna has been told no.',
        '{player} was not even looking for {a item} at {place}. That is usually how it goes.',
        'Somebody at {place} had a better day than the rest of us. That somebody is {player}, and it was {a item}.',
        '{a item}, turned up at {place}. {player} has it now, and the rest of {place} is working twice as hard.',
        '{player} came into the Salty Sloth with {a item} from {place} and did not buy a single round. Remember that.',
        'Nine winters at the bar and Wenna has seen {a item} twice. {player} brought one in from {place} today.',
    ],
    trophy: [
        '{player} has {a item} now, taken at {place}. The wall over their bed was looking bare.',
        'Hard won at {place}: {a item}, for {player}, and a story that gets longer every time it is told.',
        '{player} came back from {place} limping a little and carrying {a item}. Worth it, they say.',
        'There is {a item} hanging by {player}\'s door now. Ask about {place} if you have an hour.',
        '{a item}. {player} took it at {place} and has not put it down since.',
        '{player} set {a item} on the bar at the Salty Sloth. It came from {place}, and it stayed there all evening.',
        'At {place}, {player} earned {a item}. The thing it came off did not go quietly.',
        'A trophy from {place}: {a item}. {player} has cleared a shelf for it.',
    ],
    cryptid: [
        '{player} came out of {place} pale and quiet, with {a item} in one hand. They have not said much since.',
        'Wenna does not believe in such things. Wenna has now held {a item}, and {player} found it at {place}.',
        'The old fishermen say there is something in {place} that does not want to be seen. {player} has {a item}, so it was seen.',
        '{a item}. From {place}. {player} found it, and the whole bar went outside to look at the sky afterwards.',
        '{player} found {a item} at {place}. Folk have been searching for one since before the docks were built.',
        'Mind your step at {place}. {player} did, and still came back with {a item} and a strange look about them.',
        'It was real after all. {player} has {a item} from {place} to prove it.',
        '{player} would rather not talk about what they saw at {place}. They will show you {a item}, though.',
    ],
    world_first_item: [
        'Today the island learned there is such a thing as {a item}. {player} found it at {place}.',
        'The first {item} anyone in Talaran has ever held. {player}, at {place}. Remember the name.',
        '{player} did something nobody else ever has: they found {a item}, at {place}.',
        'Nobody had a name for it until this morning. Now it is {a item}, and {player} had it first.',
        'There will be others in time. The first {item} came out of {place}, in the hands of {player}.',
        '{player} found {a item} at {place}, the first in all Talaran. The Museum has already sent someone round.',
        'Wenna checked every page back to the first. No {item}. Not one, until {player} found it today.',
        'New to the island: {a item}. Found by {player}, who is insufferable about it, and has every right to be.',
    ],
    record_fish: [
        '{player} pulled {a item} of {weight} out at {place}. The old record now belongs to nobody.',
        '{weight}. That is how much {player}\'s {item} weighed, and nothing heavier has come out of {place}.',
        'It took {player} two arms and a friend to hold up the {item}. {weight}, the heaviest yet.',
        'A new mark on the board at {place}: {player}, {a item}, {weight}.',
        '{player} landed {a item} at {place} that bent the rod nearly in half. {weight}, and a record.',
        'They are telling the story of {player}\'s {weight} {item} at {place} already, and the fish gets bigger each time.',
        'Somebody fetch the good scales. {player} has {a item} from {place}, and it weighs {weight}.',
        'Nothing that size has come out of {place} before. {player}\'s {item}: {weight}.',
    ],
    gem_best_grade: [
        '{player} held {a item} up to the window and there was not a mark on it.',
        'Geosper looked at {player}\'s {item} for a long time and said only, "Well."',
        'Not a flaw, not a cloud: {a item}, from {player}\'s wheel.',
        '{player} cut {a item} today, as clean as any stone on the island.',
        'They say a stone like {player}\'s {item} comes once in a hundred tries. {player} did not need the hundred.',
        '{a item}, perfect, cut by {player}. Their hands are steadier than Wenna\'s.',
        '{player} has {a item} now and keeps looking at it in different light.',
        'From the rough to {a item} in one sitting. {player} has a gift.',
    ],
    museum_first_give: [
        'The {museum} opened a new case today. In it: {a item}, and a card with {player}\'s name.',
        '{player} gave {a item} to the {museum}. It is the first they have had of its kind.',
        'Go and see the {museum}. There is {a item} on show now, and {player} brought it in.',
        'A gift for the {museum}: {a item}, from {player}, who could have sold it and did not.',
        'The keeper at the {museum} was seen smiling today. {player} had just handed over {a item}.',
        '{player}\'s name is on a plaque at the {museum} now, beside the first {item} the place has held.',
        'The {museum} has {a item} at last. {player} gave it, and asked for nothing back.',
        'One more case lit at the {museum}: {a item}. Thank {player} next time you see them.',
    ],
};

function needs(text: string): string[] {
    return [...new Set([...text.matchAll(/\{([a-z0-9 ]+)\}/g)].map((m) => m[1].replace(/^a /, '')))];
}

export async function up(knex: Knex): Promise<void> {
    for (const [kind, texts] of Object.entries(V)) {
        const have = new Set((await knex('chronicle_verses').where({ kind }).select('text')).map((r: any) => r.text));
        const rows = texts.filter((t) => !have.has(t)).map((text) => ({ kind, text, needs: needs(text) }));
        if (rows.length) await knex('chronicle_verses').insert(rows);
    }
}

export async function down(knex: Knex): Promise<void> {
    for (const [kind, texts] of Object.entries(V)) {
        await knex('chronicle_verses').where({ kind }).whereIn('text', texts).delete();
    }
}
