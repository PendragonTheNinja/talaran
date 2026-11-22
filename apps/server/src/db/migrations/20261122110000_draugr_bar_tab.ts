import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The Draugr's bar tab (Nathan, 2026-11-22). Odda Fenn, who keeps the
// Gaster's Gaze in Wendhaven, still has her great-grandmother's tally book,
// and one name in it never paid: Hrolf, a Draugr. Anyone on her quest who
// fights Draugr on The Ruin may meet him by name, and he carries the purse.
//
//   quest_foes                a named creature met only on a quest: the quest,
//                             the creature it stands in for, its name, the
//                             chance (1 in N, each time that creature is
//                             drawn), and what it drops. Read by rollQuestFoe in
//                             services/combatFights.ts; reusable for any
//                             "a named one is out there" quest.
//   combat_fights.quest_foe_id  whom the player faces, so a later settle keeps
//                             the name.
//
// Hrolf's Purse is type 'quest': no museum takes it, so it cannot be donated
// away before it is handed in.

const QUEST_NAME = "The Draugr's Bar Tab";
const NPC = { name: 'Odda Fenn', title: "Keeps the Gaster's Gaze", place: 'Wendhaven', avatar: '🍺' };
// 1 in 2: Draugr are met only as The Ruin's guardian, on about one landing
// in five there, so every one is already rare.
const FOE = { name: 'Hrolf Ale-Debt', creature: 'Draugr', chance: 2, drop: "Hrolf's Purse" };
const PURSE = {
    name: "Hrolf's Purse", type: 'quest', subtype: 'quest', tier: 1, level_required: 1, value: 0, is_active: true,
    description: 'A leather purse gone hard as wood, stitched shut with sinew. It still smells of ale, and it is owed to the Gaster\'s Gaze.',
};

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('quest_foes'))) {
        await knex.schema.createTable('quest_foes', (t) => {
            t.increments('id').primary();
            t.integer('quest_id').notNullable().references('id').inTable('quests').onDelete('CASCADE');
            t.integer('creature_id').notNullable().references('id').inTable('creatures').onDelete('CASCADE');
            t.string('name', 100).notNullable();
            t.integer('chance_one_in').notNullable().defaultTo(25);
            t.string('drop_item_name', 100).notNullable();
            t.boolean('is_active').notNullable().defaultTo(true);
            t.timestamps(true, true);
            t.unique(['quest_id', 'creature_id']);
        });
        await knex.raw('ALTER TABLE quest_foes ADD CONSTRAINT quest_foes_chance CHECK (chance_one_in >= 1)');
    }
    if (!(await knex.schema.hasColumn('combat_fights', 'quest_foe_id'))) {
        await knex.schema.alterTable('combat_fights', (t) => {
            t.integer('quest_foe_id').nullable().references('id').inTable('quest_foes').onDelete('SET NULL');
        });
    }
    if (!(await hasContent(knex))) return;

    const place = await knex('locations').where({ name: NPC.place }).first('id');
    if (!place) throw new Error(`draugr_bar_tab: no location named ${NPC.place}`);
    const creature = await knex('creatures').where({ name: FOE.creature }).first('id');
    if (!creature) throw new Error(`draugr_bar_tab: no creature named ${FOE.creature}`);
    for (const s of ['Melee', 'Defense', 'Constitution']) {
        if (!(await knex('skills').where({ name: s }).first('id'))) throw new Error(`draugr_bar_tab: no skill named ${s}`);
    }
    if (!(await knex('items').where({ name: 'Ale' }).first('id'))) throw new Error('draugr_bar_tab: no item named Ale');

    const hadPurse = await knex('items').where({ name: PURSE.name }).first('id');
    if (hadPurse) await knex('items').where({ id: hadPurse.id }).update(PURSE);
    else await knex('items').insert(PURSE);

    const npcRow = { name: NPC.name, title: NPC.title, location_id: place.id, avatar: NPC.avatar, is_active: true };
    let npc = await knex('npcs').where({ name: NPC.name }).first('id');
    if (npc) await knex('npcs').where({ id: npc.id }).update(npcRow);
    else [npc] = await knex('npcs').insert(npcRow).returning('id');

    const questRow = {
        name: QUEST_NAME, npc_name: NPC.name, location_id: place.id, is_active: true, is_tutorial: false,
        description: 'Odda Fenn keeps a tally book her great-grandmother started. One customer never paid: Hrolf, a Draugr, two hundred years ago.',
        skill: 'Melee', reward_xp: 1500,
        reward_skill_xp: JSON.stringify([{ skill: 'Defense', xp: 1800 }, { skill: 'Constitution', xp: 900 }]),
        reward_gold: 300, reward_items: JSON.stringify([{ itemName: 'Ale', qty: 3 }]),
        start_items: null, stage_prefix: null, requires_quest_id: null, exclusive_group: null,
    };
    let quest = await knex('quests').where({ name: QUEST_NAME }).first('id');
    if (quest) await knex('quests').where({ id: quest.id }).update({ ...questRow, updated_at: knex.fn.now() });
    else [quest] = await knex('quests').insert(questRow).returning('id');

    const objectives = [
        { order: 1, description: 'Find Hrolf among the Draugr of The Ruin, off Taiar, and take his purse', type: 'give', target_item: PURSE.name, required_amount: 1 },
        { order: 2, description: 'Bring the purse to Odda Fenn', type: 'talk', target_item: null, required_amount: 1 },
    ];
    for (const o of objectives) {
        const row = { quest_id: quest.id, ...o };
        const had = await knex('quest_objectives').where({ quest_id: quest.id, order: o.order }).first('id');
        if (had) await knex('quest_objectives').where({ id: had.id }).update(row);
        else await knex('quest_objectives').insert(row);
    }

    const foeRow = { quest_id: quest.id, creature_id: creature.id, name: FOE.name, chance_one_in: FOE.chance, drop_item_name: FOE.drop, is_active: true };
    const hadFoe = await knex('quest_foes').where({ quest_id: quest.id, creature_id: creature.id }).first('id');
    if (hadFoe) await knex('quest_foes').where({ id: hadFoe.id }).update(foeRow);
    else await knex('quest_foes').insert(foeRow);

    const start = `start_quest:${quest.id}`;
    const handIn = `complete_talk_objective:${quest.id}`;
    const stages = [
        { key: 'intro', lines: [
            'You\'ll want an ale. Everyone wants an ale. It\'s thirty, and I don\'t run a tab.',
            'I ran one once. My great-grandmother did, anyway. The book\'s still behind the bar.',
            'Hrolf. No other name in it, only Hrolf, and a tally of marks three pages long. He drank here the winter the harbor froze, two hundred years back, and he never paid.',
            'They say he\'s still about, out on the islets off Taiar where the drowned keep watch. If you find him, his purse is owed to this house.',
        ], options: [{ label: '"I\'ll collect."', next_stage: 'accepted', action: start }, { label: '"Just the ale, thanks."', next_stage: null, action: 'close' }] },
        { key: 'accepted', lines: [
            'He won\'t be the only one of his kind out there. You\'ll know him when you meet him.',
            'Bring me the purse. Whatever\'s in it, the tab\'s settled.',
        ], options: [{ label: '"I\'ll find him."', next_stage: null, action: 'close' }] },
        { key: 'progress', lines: [
            'The book\'s still open at his page.',
        ], options: [{ label: '"Not yet."', next_stage: null, action: 'close' }] },
        { key: 'ready', lines: [
            'That\'s his purse. Look at the stitching. Nobody sews like that anymore.',
            'I\'ll strike him out of the book.',
        ], options: [{ label: '"Settled, then."', next_stage: null, action: handIn }] },
        { key: 'complete', lines: [
            'Two hundred years and three pages of marks. Struck through.',
            'Your next round is on the house. Your next one. Not every one.',
        ], options: [{ label: '"Fair enough."', next_stage: null, action: 'close' }] },
    ];
    await knex('npc_dialogues').where({ npc_id: npc.id }).delete();
    for (const st of stages) {
        await knex('npc_dialogues').insert({ npc_id: npc.id, stage_key: st.key, text_lines: st.lines, options: JSON.stringify(st.options) });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('combat_fights', 'quest_foe_id')) {
        await knex.schema.alterTable('combat_fights', (t) => { t.dropColumn('quest_foe_id'); });
    }
    await knex.schema.dropTableIfExists('quest_foes');
    const quest = await knex('quests').where({ name: QUEST_NAME }).first('id');
    if (quest) {
        await knex('player_quest_objectives').whereIn('objective_id', knex('quest_objectives').where({ quest_id: quest.id }).select('id')).delete();
        await knex('quest_objectives').where({ quest_id: quest.id }).delete();
        await knex('player_quests').where({ quest_id: quest.id }).delete();
        await knex('quests').where({ id: quest.id }).delete();
    }
    const npc = await knex('npcs').where({ name: NPC.name }).first('id');
    if (npc) {
        await knex('npc_dialogues').where({ npc_id: npc.id }).delete();
        await knex('npcs').where({ id: npc.id }).delete();
    }
    // Hrolf's Purse stays: a player may hold one.
}
