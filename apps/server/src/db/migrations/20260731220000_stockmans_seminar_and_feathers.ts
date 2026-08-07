import type { Knex } from 'knex';

// Two corrections.
//
// 1. "The Stockman's Lesson" -> "The Stockman's Seminar". The quest name is
//    referenced by npc_dialogues options as `start_quest:<name>` and
//    `complete_talk_objective:<name>`, so those strings have to move with it or
//    Geothro's buttons stop working.
//
// 2. CHICKEN FEATHERS. The slaughter table had feathers at 80%, so one bird in
//    five gave none at all — and a plucked chicken with no feathers is a strange
//    object. Feathers are the whole reason chickens matter to the arrow economy
//    (CLAUDE.md §4: farmed = volume), so a 20% chance of nothing was working
//    against the one loop the bird exists to feed. Now guaranteed, and more of
//    them: 5-9 rather than 3-6.

const OLD_NAME = "The Stockman's Lesson";
const NEW_NAME = "The Stockman's Seminar";

const CHICKEN_SLAUGHTER = JSON.stringify([
    { itemName: 'Chicken Meat', min: 1, max: 2, chance: 100 },
    { itemName: 'Feathers', min: 5, max: 9, chance: 100 },
]);

async function renameQuest(knex: Knex, from: string, to: string): Promise<void> {
    const quest = await knex('quests').where({ name: from }).first();
    if (!quest) return;

    await knex('quests').where({ id: quest.id }).update({ name: to });

    // Dialogue options carry the quest name inside their action strings.
    const geothro = await knex('npcs').where({ name: 'Geothro' }).first();
    if (!geothro) return;

    const rows = await knex('npc_dialogues').where({ npc_id: geothro.id });
    for (const row of rows) {
        const raw = typeof row.options === 'string' ? row.options : JSON.stringify(row.options);
        if (!raw || !raw.includes(from)) continue;
        await knex('npc_dialogues')
            .where({ id: row.id })
            .update({ options: raw.split(from).join(to) });
    }
}

export async function up(knex: Knex): Promise<void> {
    await renameQuest(knex, OLD_NAME, NEW_NAME);

    const chicken = await knex('animal_species').where({ name: 'Chicken' }).first();
    if (!chicken) throw new Error('stockmans_seminar: Chicken species not found');
    await knex('animal_species').where({ id: chicken.id }).update({ slaughter_table: CHICKEN_SLAUGHTER });
}

export async function down(knex: Knex): Promise<void> {
    await renameQuest(knex, NEW_NAME, OLD_NAME);

    await knex('animal_species').where({ name: 'Chicken' }).update({
        slaughter_table: JSON.stringify([
            { itemName: 'Chicken Meat', min: 1, max: 2, chance: 100 },
            { itemName: 'Feathers', min: 3, max: 6, chance: 80 },
        ]),
    });
}
