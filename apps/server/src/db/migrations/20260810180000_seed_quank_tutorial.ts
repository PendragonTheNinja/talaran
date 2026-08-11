import type { Knex } from 'knex';

// Quank, and the arrival of new people (docs/marketplace-spec.md §8).
//
// The quest exists because alpha players reported not knowing what to do, or
// how to reach the next town. It teaches six things, four of them in dialogue
// and two as objectives, because the Manual and the Marketplace are the only
// two things a brand new player can actually DO while standing in Talador.
//
// TWO SCRIPTS. The first thing Quank asks is whether you want this properly or
// quickly, and the quick version is him speaking like a stone. It is a joke
// that pays for itself: compressing every beat to its irreducible sentence
// produces a genuinely clearer explanation, and "Work take time. Start work. Go
// away. Come back. Work done" may be the plainest thing in the patch.
//
// He hands nothing over until the end. Everything is one final conversation:
// pony, coin, and a reminder to equip the one and go somewhere with the other.
// Then hide_after_quest_id removes him from Talador, for that player only.

const QUEST_NAME = 'A Word From Quank';

export async function up(knex: Knex): Promise<void> {
    const talador = await knex('locations').where({ name: 'Talador' }).first();
    if (!talador) throw new Error('Quank seed: no location named Talador.');

    // ── Quest ───────────────────────────────────────────────────────────────
    let quest = await knex('quests').where({ name: QUEST_NAME }).first();
    if (!quest) {
        [quest] = await knex('quests').insert({
            name: QUEST_NAME,
            description:
                'An old man in the square has appointed himself your guide. '
                + 'He has been waiting a long time for someone to explain things to.',
            skill: null,
            npc_name: 'Quank',
            location_id: talador.id,
            is_active: true,
            start_items: JSON.stringify([]),
            // The pony is the whole point of the ending: it is the first thing a
            // new player equips and the thing that makes the next town reachable.
            reward_items: JSON.stringify([{ itemName: "Novice's Pony", qty: 1 }]),
            reward_xp: 0,
            // Enough to replace a broken entry tool at the 175% wall with change
            // left over, and not enough to skip the early loop.
            reward_gold: 150,
        }).returning('*');

        await knex('quest_objectives').insert([
            {
                quest_id: quest.id,
                order: 1,
                description: 'Open the Manual of Talaran and have a look',
                type: 'visit',
                target_item: 'Manual',
                required_amount: 1,
            },
            {
                quest_id: quest.id,
                order: 2,
                description: 'Visit the Taiar Marketplace',
                type: 'visit',
                target_item: 'Taiar Marketplace',
                required_amount: 1,
            },
            {
                quest_id: quest.id,
                order: 3,
                description: 'Return to Quank',
                type: 'talk',
                target_item: null,
                required_amount: 1,
            },
        ]);
    }

    // ── Quank ───────────────────────────────────────────────────────────────
    let quank = await knex('npcs').where({ name: 'Quank' }).first();
    if (!quank) {
        [quank] = await knex('npcs').insert({
            name: 'Quank',
            title: 'Fixture of the Square',
            location_id: talador.id,
            submenu: null,
            avatar: '🪶',
            is_active: true,
        }).returning('*');
    }

    // Gone once you are done with him. Per player, so he is still standing
    // there for everyone who has not met him.
    await knex('npcs').where({ id: quank.id }).update({ hide_after_quest_id: quest.id });

    await knex('npc_dialogues').where({ npc_id: quank.id }).delete();
    await knex('npc_dialogues').insert([
        // ── The fork ────────────────────────────────────────────────────────
        {
            npc_id: quank.id,
            stage_key: 'intro',
            text_lines: [
                'Oh. Oh! Someone new. Look at you. Look at YOU.',
                'No, not you, the fellow standing there. You. The one behind his eyes. I know you are there, I always know, it is the way you all pause before you move.',
                'Quank. That is me. I have been in this square so long the gulls have opinions about me. Sit. Do not sit, there is nowhere to sit. Stand attentively.',
                'Now. I can explain this world at a leisurely pace, or I can compress myself. Compressing hurts a little and I speak like a stone, but it is faster.',
            ],
            options: JSON.stringify([
                // Quest ID, not name: names are display-only and a rename would
                // silently break the button (see resolveActionQuest in routes/npcs.ts).
                { label: '"Take your time."', next_stage: 'long_1', action: `start_quest:${quest.id}` },
                { label: '"Compress yourself."', next_stage: 'short_1', action: `start_quest:${quest.id}` },
                { label: '"Not now."', next_stage: null, action: 'close' },
            ]),
        },

        // ── Thorough ────────────────────────────────────────────────────────
        {
            npc_id: quank.id,
            stage_key: 'long_1',
            text_lines: [
                'FIRST. First thing. This is the one they never tell you and then they wonder why you are clicking like a woodpecker.',
                'Work here takes TIME. Actual time. The kind that passes. You set your fellow to chopping and he chops, and he keeps chopping, log after log, and you do not need to be watching him do it. He is not shy.',
                'So go. Put the kettle on. Answer the door. Speak to a person made of meat. Come back in twenty minutes and there is a heap of wood, and he is very pleased with himself.',
                'But not all afternoon. Every half hour or so the world taps him on the shoulder and asks him to prove he is a person and not some clever machinery. Everyone gets asked, I get asked, the gulls do not, which I have raised as a concern. He stops and waits politely until you come and answer it.',
                'So: half an hour at a stretch. Wander off longer than that and you will come back to a man standing perfectly still in a forest, achieving nothing, and I will not be there to laugh.',
            ],
            options: JSON.stringify([{ label: '"Go on."', next_stage: 'long_2', action: null }]),
        },
        {
            npc_id: quank.id,
            stage_key: 'long_2',
            text_lines: [
                'SECOND. Or third. I have lost one. It does not matter.',
                'You cannot do everything here. Talador has boats, merchants, gulls, me. Trees are elsewhere. Rock is elsewhere. Fish are, obviously, in the water, but the water is also elsewhere.',
                'Every skill lives in a place, and standing in that place is an old fool exactly like me, waiting to teach it to you. We are all called Geo-something. Geonsen. Georgic. Georemy. I do not know why and I stopped asking around year six.',
                'Go to them and they will GIVE you the tools. Free. Nobody buys their way into a trade here. I think that is rather lovely and nobody agrees with me.',
            ],
            options: JSON.stringify([{ label: '"Go on."', next_stage: 'long_3', action: null }]),
        },
        {
            npc_id: quank.id,
            stage_key: 'long_3',
            text_lines: [
                'THIRD. Someone wrote it all down. The whole world. In a book.',
                'And the book UPDATES ITSELF, which I want you to sit with for a moment, because I have and I have not slept properly since.',
                'Go and open it. Look at anything. Come back. I will be here. I am always here. That is rather the trouble.',
                'And if the book has no answer, ask in the help chat. There are people in there who genuinely enjoy being asked things, which I find suspicious and useful.',
                'FOURTH, and I am confident about that number. Coin. Go and look at the market too, while you are up.',
                'They sell dear and they buy cheap and you will think, that old crook. No. They do it ON PURPOSE. They are not merchants so much as a very slow sign, telling everybody roughly what a thing is worth.',
                'And the gap between those two prices, that lovely fat gap, is where people live. Sell to a person and you will always do better than selling to Merrick. Always. That is the whole economy and I have just handed you a month of your life back. You are welcome. Give it to the gulls.',
            ],
            options: JSON.stringify([{ label: '"The book, then the market."', next_stage: null, action: 'close' }]),
        },

        // ── Abridged ────────────────────────────────────────────────────────
        {
            npc_id: quank.id,
            stage_key: 'short_1',
            text_lines: [
                'Good. Quank talk small now. Quank like small.',
                'Work take time. Start work. Go away. Come back. Work done, again and again, no clicking.',
                'But go away small time. Half hour. Then world ask if you real person. Work stop and wait for you. Not bad thing. World ask everyone.',
                'Go away long time, come back, find man standing still. Sad man. Do not be sad man.',
            ],
            options: JSON.stringify([{ label: '"More."', next_stage: 'short_2', action: null }]),
        },
        {
            npc_id: quank.id,
            stage_key: 'short_2',
            text_lines: [
                'Cannot do all thing here. Tree other place. Rock other place.',
                'Every place have teacher. Teacher name start with Geo. Teacher give tool free. Go find teacher.',
                'Big book have all answer. Book fix self. Strange. Go look at book.',
                'Book no help? Ask people in help chat. People nice.',
            ],
            options: JSON.stringify([{ label: '"More."', next_stage: 'short_3', action: null }]),
        },
        {
            npc_id: quank.id,
            stage_key: 'short_3',
            text_lines: [
                'Coin now. Go look at market too.',
                'Merchant sell high. Merchant buy low. Merchant do on purpose. Merchant only show what thing worth.',
                'Sell to person, get more coin. That whole trick.',
            ],
            options: JSON.stringify([{ label: '"Book. Market. Go."', next_stage: null, action: 'close' }]),
        },

        // ── Mid-quest ───────────────────────────────────────────────────────
        //
        // One nagging stage for both scripts. Splitting it would double the
        // upkeep for a line nobody lingers on.
        {
            npc_id: quank.id,
            stage_key: 'progress',
            text_lines: [
                'Still here? The book and the market. Neither of them is far. Neither of them bites.',
                'I would show you myself but I have a bit of a thing about leaving this square.',
            ],
            options: JSON.stringify([{ label: '"Right, yes."', next_stage: null, action: 'close' }]),
        },

        // ── The end ─────────────────────────────────────────────────────────
        {
            npc_id: quank.id,
            stage_key: 'ready',
            text_lines: [
                'There. You know more than most who have been here a fortnight, and considerably more than the gulls.',
                'Take these. The pony is old and she is honest, and she is quicker between towns than your own two feet, which are, if I may, not much. And a little coin, so you begin with something rattling.',
                'Now. Put the pony on properly, she does no good stood in a bag. Then go somewhere that is not here. Anywhere. The road out is on your map.',
                'And then, ah. Then I am off. I have been meaning to for years and you have handed me a reason, which is the only thing I ever wanted from any of you. Do not come looking. There will be nothing to look at.',
                'Goodbye, you behind his eyes. Mind the gap. Mind the gulls.',
            ],
            options: JSON.stringify([
                // Payload required: the route matches on 'complete_talk_objective:'
                // and a bare action falls through and completes nothing.
                { label: '"Goodbye, Quank."', next_stage: null, action: `complete_talk_objective:${quest.id}` },
            ]),
        },

        // Should never be seen: hide_after_quest_id takes him off the location
        // list the moment the quest completes. It exists for the stale client
        // that still has him on screen, and it keeps him in character rather
        // than showing an empty dialogue.
        {
            npc_id: quank.id,
            stage_key: 'complete',
            text_lines: [
                'No no no. I have gone. You are talking to the shape of a man who has gone.',
                'Go on. The road is that way and I am not.',
            ],
            options: JSON.stringify([{ label: '"Sorry."', next_stage: null, action: 'close' }]),
        },
    ]);
}

export async function down(knex: Knex): Promise<void> {
    const quank = await knex('npcs').where({ name: 'Quank' }).first();
    if (quank) {
        await knex('npc_dialogues').where({ npc_id: quank.id }).delete();
        await knex('npcs').where({ id: quank.id }).delete();
    }

    const quest = await knex('quests').where({ name: QUEST_NAME }).first();
    if (quest) {
        const objectiveIds = await knex('quest_objectives').where({ quest_id: quest.id }).pluck('id');
        if (objectiveIds.length) {
            await knex('player_quest_objectives').whereIn('objective_id', objectiveIds).delete();
        }
        await knex('quest_objectives').where({ quest_id: quest.id }).delete();
        await knex('player_quests').where({ quest_id: quest.id }).delete();
        await knex('quests').where({ id: quest.id }).delete();
    }
}
