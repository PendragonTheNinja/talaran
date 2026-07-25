import type { Knex } from 'knex';

// "Georgic's Lesson" -> "The Farmer's Wisdom".
// Brings the farming tutorial quest in line with the established title pattern
// (The Huntsman's Lesson, The Blacksmith's Bargain, The Carpenter's Commission).
// Georgic keeps his name; only the quest title changes.
//
// The seed in 20260723030000_seed_georgics_lesson.ts is frozen and still inserts
// the old title, so on a fresh database that seed runs first and this migration
// renames the row immediately after. No code looks the quest up by name —
// backfillQuestObjectives and the npcs routes both resolve it by id.

const OLD_NAME = "Georgic's Lesson";
const NEW_NAME = "The Farmer's Wisdom";

export async function up(knex: Knex): Promise<void> {
    const quest = await knex('quests').where({ name: OLD_NAME }).first();

    if (!quest) {
        // Already renamed — safe to no-op.
        if (await knex('quests').where({ name: NEW_NAME }).first()) return;
        throw new Error(
            `rename_farming_quest: neither "${OLD_NAME}" nor "${NEW_NAME}" found in quests`,
        );
    }

    await knex('quests').where({ id: quest.id }).update({ name: NEW_NAME });
}

export async function down(knex: Knex): Promise<void> {
    await knex('quests').where({ name: NEW_NAME }).update({ name: OLD_NAME });
}
