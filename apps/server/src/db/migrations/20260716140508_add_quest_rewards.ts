import type { Knex } from 'knex';

// Quests could never GIVE anything — they were pure gates (prove yourself ->
// forge/workshop unlocked). The Huntsman's Lesson needs to hand over a bow at
// the start and snares at the end, so quests gain rewards.
// JSON columns match the drop_table / recipe inputs pattern already in use.

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('quests', (t) => {
        t.text('start_items').nullable();   // JSON: [{ itemName, qty }] granted on accept
        t.text('reward_items').nullable();  // JSON: [{ itemName, qty }] granted on completion
        t.integer('reward_xp').nullable();  // awarded to quests.skill on completion
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('quests', (t) => {
        t.dropColumn('start_items');
        t.dropColumn('reward_items');
        t.dropColumn('reward_xp');
    });
}