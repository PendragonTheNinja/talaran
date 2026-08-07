import type { Knex } from 'knex';

// Geothro's kit, corrected. Two changes:
//
//   Grain 40 -> 20. Two chicks eat 2 a feed, so forty was twenty feeds — most of
//   a chicken's life handed over at the door, and nothing left to teach the
//   player that grain comes from a field.
//
//   Straw 10, added. Mucking out now lays fresh bedding and costs straw, which it
//   did not when this quest was written. Without it a new stockman reaches his
//   first mucking with no way to do it and no obvious reason why.
//
// The same migration also refreshes Geothro's 'offer' dialogue, which now tells
// the player where grain and straw come from. 20260731160000 carries both changes
// for fresh databases; this migration exists because that one has already run
// everywhere else, and an edit to an applied migration never executes again.

const START_ITEMS = [
    { itemName: 'Feed Pail', qty: 1 },
    { itemName: 'Mucking Fork', qty: 1 },
    { itemName: 'Chick', qty: 2 },
    { itemName: 'Grain', qty: 20 },
    { itemName: 'Straw', qty: 10 },
];

// Kept verbatim in step with the 'offer' stage in 20260731160000.
const OFFER_LINES = [
    "Build them a coop first, boarded tight, and a door that latches. Then put a chick in it. Then feed them, and keep feeding them.",
    "Take grain and straw enough to start. Grain goes in them, straw goes under them, and both come off a field; so when you run dry, you know where to go.",
    "Understand what feeding buys you. A bird that isn't fed doesn't sicken and it doesn't die. It simply stops. Stops growing, stops laying, stands there waiting on you. Come back in a month and you'll find it exactly as you left it, and a month behind where it might have been.",
    "That's the cruelty of it, if you want one. Nothing here punishes you. It only waits.",
];

export async function up(knex: Knex): Promise<void> {
    // This migration runs BEFORE the quest is renamed (20260731220000), but a
    // fresh database seeds the new name straight away in 20260731160000. Accept
    // either so the order works from both directions.
    const quest = await knex('quests')
        .whereIn('name', ["The Stockman's Seminar", "The Stockman's Lesson"]).first();
    if (!quest) throw new Error('geothro_start_items: the Stockman quest was not found');

    await knex('quests').where({ id: quest.id }).update({
        start_items: JSON.stringify(START_ITEMS),
    });

    const geothro = await knex('npcs').where({ name: 'Geothro' }).first();
    if (!geothro) throw new Error('geothro_start_items: Geothro not found');

    await knex('npc_dialogues')
        .where({ npc_id: geothro.id, stage_key: 'offer' })
        .update({ text_lines: OFFER_LINES });
}

export async function down(knex: Knex): Promise<void> {
    await knex('quests').whereIn('name', ["The Stockman's Seminar", "The Stockman's Lesson"]).update({
        start_items: JSON.stringify([
            { itemName: 'Feed Pail', qty: 1 },
            { itemName: 'Mucking Fork', qty: 1 },
            { itemName: 'Chick', qty: 2 },
            { itemName: 'Grain', qty: 40 },
        ]),
    });
}
