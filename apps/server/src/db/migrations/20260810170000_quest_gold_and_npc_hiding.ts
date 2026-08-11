import type { Knex } from 'knex';

// Two things the new player tutorial needs that the quest system cannot yet
// express (docs/marketplace-spec.md §8).
//
// 1. quests.reward_gold
//    reward_items grants items and reward_xp grants experience. Gold had no
//    home, so the only way to hand a new player their starting coin would have
//    been to invent an item that turns into money.
//
// 2. quests.skill becomes nullable
//    Every quest so far has belonged to a skill, so the column was NOT NULL.
//    The tutorial belongs to no skill: it is about the game, not a trade.
//    Naming a skill anyway would file it under that trade in the journal and
//    lie about what it teaches.
//
// 3. npcs.hide_after_quest_id
//    Quank leaves. Not "stops offering the quest", leaves: once you have
//    finished with him he is no longer standing in Talador, and the square is
//    quieter for it. is_active is server-wide, so it cannot express "gone for
//    you but still there for everyone who has not met him".

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('quests', 'reward_gold'))) {
        await knex.schema.alterTable('quests', (t) => {
            t.integer('reward_gold').notNullable().defaultTo(0);
        });
    }

    await knex.schema.alterTable('quests', (t) => {
        t.string('skill').nullable().alter();
    });

    if (!(await knex.schema.hasColumn('npcs', 'hide_after_quest_id'))) {
        await knex.schema.alterTable('npcs', (t) => {
            t.integer('hide_after_quest_id').unsigned().nullable()
                .references('id').inTable('quests').onDelete('SET NULL');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('npcs', 'hide_after_quest_id')) {
        await knex.schema.alterTable('npcs', (t) => t.dropColumn('hide_after_quest_id'));
    }
    if (await knex.schema.hasColumn('quests', 'reward_gold')) {
        await knex.schema.alterTable('quests', (t) => t.dropColumn('reward_gold'));
    }

    // Restore NOT NULL. Any skill-less quest must go first or this will fail,
    // which is correct: silently inventing a skill for it would be worse.
    await knex('quests').whereNull('skill').delete();
    await knex.schema.alterTable('quests', (t) => {
        t.string('skill').notNullable().alter();
    });
}
