import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// "Keep an Eye Out for Quank" (Nathan, 2026-11-17). Meeting Quank on Taiar's
// islets ends with him pressing a Tidbit into the player's hand, and that
// moment starts this quest (rollIsletFindWithin in services/isletFinds.ts).
// When he is found again on the next island's islets he wants his Tidbit back,
// as if he had always assumed it would be returned. Nothing completes the
// objective yet: that waits for Antura's islets and Quank's second scene.
//
// location_id is The Ruin, not Quank's square: resolveStage in routes/npcs.ts
// scopes a giver's quests by location before name, so pinning this to the
// square would put the tutor Quank into 'progress' for anyone who met him at
// sea before finishing his lesson. The quest is started by code, never by
// dialogue, so it needs no stage of its own.

const QUEST_NAME = 'Keep an Eye Out for Quank';
const ISLET = 'The Ruin';

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;

    const islet = await knex('locations').where({ name: ISLET }).whereNotNull('islet_kind').first('id');
    if (!islet) throw new Error(`quank_quest: islet "${ISLET}" not found`);
    if (!(await knex('items').where({ name: 'Tidbit' }).first('id'))) throw new Error('quank_quest: item "Tidbit" not found (run 20261117190000 first)');

    const row = {
        name: QUEST_NAME,
        description: 'Quank gave you a Tidbit on one of the islets off Taiar and was gone before you could ask why. '
            + 'He did not say you could keep it.',
        skill: null,
        npc_name: 'Quank',
        location_id: islet.id,
        is_active: true,
        is_tutorial: false,
        reward_gold: 0,
    };
    let quest = await knex('quests').where({ name: QUEST_NAME }).first('id');
    if (quest) await knex('quests').where({ id: quest.id }).update({ ...row, updated_at: knex.fn.now() });
    else [quest] = await knex('quests').insert(row).returning('id');

    const objective = {
        quest_id: quest.id,
        order: 1,
        description: 'Keep an eye out for Quank on the islets of other islands, and have his Tidbit with you',
        type: 'return_tidbit',
        target_item: 'Tidbit',
        required_amount: 1,
    };
    const had = await knex('quest_objectives').where({ quest_id: quest.id, order: 1 }).first('id');
    if (had) await knex('quest_objectives').where({ id: had.id }).update(objective);
    else await knex('quest_objectives').insert(objective);
}

export async function down(knex: Knex): Promise<void> {
    // Cascades take player_quests and player_quest_objectives with it.
    const quest = await knex('quests').where({ name: QUEST_NAME }).first('id');
    if (!quest) return;
    await knex('player_quest_objectives').whereIn('objective_id', knex('quest_objectives').where({ quest_id: quest.id }).select('id')).delete();
    await knex('quest_objectives').where({ quest_id: quest.id }).delete();
    await knex('player_quests').where({ quest_id: quest.id }).delete();
    await knex('quests').where({ id: quest.id }).delete();
}
