import type { Knex } from 'knex';

/**
 * Cooking, part 1: schema, the cookhouse tools, and Geomima.
 *
 * Adds items.heal_amount and the two burn columns, creates the eight tools the
 * cookhouse rack takes, and puts the cook in Phoenwick with her tutorial quest.
 *
 * Food itself lands in part 2. Nothing here is edible: heal_amount is written
 * but nothing consumes it until combat exists, so food is a production and
 * trade good in the meantime.
 *
 * DEPENDS ON PART 2: her quest objective is to cook fish, so the quest cannot
 * be finished until the cooking recipes exist. Both migrations must ship in the
 * same patch.
 *
 * Two tools are granite and made by Crafting with no station, deliberately.
 * The hearth is the one required cookhouse slot, so needing a cookhouse to make
 * a hearth would soft-lock the whole skill (CLAUDE.md section 4). Cutting one
 * by hand is the way in, following Cut Granite Block which already works this
 * way. The six metal tools are Smithing at the forge like every other metal
 * tool.
 */

type ItemRow = {
    name: string;
    type: string;
    subtype: string;
    tier: number;
    level_required: number;
    description: string;
    is_active: boolean;
};

const tool = (name: string, subtype: string, description: string): ItemRow => ({
    name, type: 'tool', subtype, tier: 1, level_required: 1, description, is_active: true,
});

export async function up(knex: Knex): Promise<void> {
    // ── Schema ────────────────────────────────────────────────────
    //
    // Guarded so the whole migration can be re-run by hand. Knex rolls a failed
    // migration back, but this one earned the belt and braces.
    if (!(await knex.schema.hasColumn('items', 'heal_amount'))) {
        await knex.schema.alterTable('items', (t) => {
            t.integer('heal_amount').nullable(); // flat HP restored; null means not food
        });
    }
    if (!(await knex.schema.hasColumn('recipes', 'burn_base'))) {
        await knex.schema.alterTable('recipes', (t) => {
            t.float('burn_base').nullable();   // burn chance at the recipe's own level, percent
            t.integer('burn_stop').nullable(); // level where burn bottoms out at 1%, linear between
        });
    }

    // ── Tools ─────────────────────────────────────────────────────
    const items: ItemRow[] = [
        tool('Granite Hearth', 'hearth',
            'A ring of dressed granite and a flue, built to hold a working fire.'),
        tool('Granite Mortar and Pestle', 'mortar_pestle',
            'A heavy granite bowl worn smooth, for bruising herbs and grinding seed.'),
        tool('Ambren Cauldron', 'cauldron',
            'A deep belly of hammered ambren, made to hang over a fire all day.'),
        tool('Ambren Skillet', 'skillet',
            'A shallow pan with a long handle, for anything wanting a quick fierce heat.'),
        tool('Ambren Cooking Knife', 'cooking_knife',
            'A short blade kept keen for paring, slicing and fine work.'),
        tool('Ambren Meat Cleaver', 'meat_cleaver',
            'Broad and weighty, meant to come down once and part the joint.'),
        tool('Ambren Ladle', 'ladle',
            'A long-handled bowl for lifting broth without scalding your knuckles.'),
        tool('Ambren Flesh Hook', 'flesh_hook',
            'A two-pronged hook for drawing meat out of a boiling pot.'),
    ];

    for (const item of items) {
        const existing = await knex('items').where({ name: item.name }).first();
        if (!existing) await knex('items').insert(item);
    }

    // ── Recipes ───────────────────────────────────────────────────
    // XP per docs/xp-rebalance.md section 8: target = policy x 1.10 x R-hat(u),
    // then xp = round(target x timer / 3600). Crafting policy 1.8, unlock 1,
    // so target = 1.8 x 1.10 x 2000 = 3,960 xp/hr.
    const target = 1.8 * 1.10 * 2000;
    const xpFor = (timer: number) => Math.round((target * timer) / 3600);

    const make = (
        skill: string,
        name: string,
        inputs: { itemName: string; qty: number }[],
        timer: number,
        station: string | null,
        requiredTools: string[],
        flavor: string,
    ) => ({
        skill,
        name,
        output_item_name: name,
        output_qty: 1,
        inputs: JSON.stringify(inputs),
        required_level: 1,
        timer_seconds: timer,
        xp: xpFor(timer),
        station,
        required_tools: JSON.stringify(requiredTools),
        mode: 'active',
        for_skill: 'Cooking',
        flavor_text: flavor,
        is_active: true,
    });

    const recipes = [
        // Granite, by hand. The way into the skill.
        make('Crafting', 'Granite Hearth',
            [{ itemName: 'Granite Block', qty: 4 }, { itemName: 'Limestone', qty: 6 }],
            300, null, [], 'You are setting granite around a firepit.'),
        make('Crafting', 'Granite Mortar and Pestle',
            [{ itemName: 'Granite', qty: 4 }],
            120, null, [], 'You are hollowing out a bowl of granite.'),

        // Metal, at the forge.
        make('Smithing', 'Ambren Cauldron', [{ itemName: 'Ambren Ingot', qty: 6 }],
            240, 'smithing', ['anvil', 'hammer', 'tongs'], 'You are raising the belly of a cauldron.'),
        make('Smithing', 'Ambren Skillet', [{ itemName: 'Ambren Ingot', qty: 3 }],
            120, 'smithing', ['anvil', 'hammer', 'tongs'], 'You are beating out a skillet.'),
        make('Smithing', 'Ambren Cooking Knife', [{ itemName: 'Ambren Ingot', qty: 2 }],
            90, 'smithing', ['anvil', 'hammer', 'tongs'], 'You are grinding an edge onto a small knife.'),
        make('Smithing', 'Ambren Meat Cleaver', [{ itemName: 'Ambren Ingot', qty: 3 }],
            110, 'smithing', ['anvil', 'hammer', 'tongs'], 'You are forging a heavy cleaver.'),
        make('Smithing', 'Ambren Ladle', [{ itemName: 'Ambren Ingot', qty: 2 }],
            80, 'smithing', ['anvil', 'hammer', 'tongs'], 'You are drawing out the handle of a ladle.'),
        make('Smithing', 'Ambren Flesh Hook', [{ itemName: 'Ambren Ingot', qty: 2 }],
            80, 'smithing', ['anvil', 'hammer', 'tongs'], 'You are turning two prongs on a flesh hook.'),
    ];

    for (const recipe of recipes) {
        const existing = await knex('recipes').where({ name: recipe.name }).first();
        if (!existing) await knex('recipes').insert(recipe);
    }

    // ── Geomima, cook of Phoenwick ────────────────────────────────
    //
    // Looked up by name, never hardcoded. Ids in content-snapshots are a
    // point-in-time export and do not match a live or dev database, which is
    // exactly how the first attempt at this migration died on the npcs
    // location_id foreign key.
    const phoenwick = await knex('locations').where({ name: 'Phoenwick' }).first();
    if (!phoenwick) {
        throw new Error('Cooking migration: no location named Phoenwick. Seed locations first.');
    }
    const PHOENWICK = phoenwick.id;

    let npc = await knex('npcs').where({ name: 'Geomima' }).first();
    if (!npc) {
        const [inserted] = await knex('npcs')
            .insert({
                name: 'Geomima',
                title: 'Cook of Phoenwick',
                location_id: PHOENWICK,
                submenu: 'cookhouse',
                avatar: '🍲',
                is_active: true,
            })
            .returning('id');
        npc = { id: typeof inserted === 'object' ? (inserted as any).id : inserted };
    }

    let quest = await knex('quests').where({ name: "The Cook's Conundrum" }).first();
    if (!quest) {
        const [inserted] = await knex('quests')
            .insert({
                name: "The Cook's Conundrum",
                description: 'Geomima, the cook of Phoenwick, will share her hearth once you show you can be trusted not to burn it down.',
                skill: 'Cooking',
                npc_name: 'Geomima',
                location_id: PHOENWICK,
                is_active: true,
            })
            .returning('id');
        quest = { id: typeof inserted === 'object' ? (inserted as any).id : inserted };
    }

    const existingObjectives = await knex('quest_objectives').where({ quest_id: quest.id });
    if (existingObjectives.length === 0) {
        await knex('quest_objectives').insert([
            {
                quest_id: quest.id,
                order: 1,
                description: 'Cook 6 fish at the public hearth',
                type: 'cooking',
                target_item: null,
                required_amount: 6,
            },
            {
                quest_id: quest.id,
                order: 2,
                description: 'Speak to Geomima to finish the matter',
                type: 'talk',
                target_item: null,
                required_amount: 1,
            },
        ]);
    }

    const dialogues = await knex('npc_dialogues').where({ npc_id: npc.id });
    if (dialogues.length === 0) {
        await knex('npc_dialogues').insert([
            {
                npc_id: npc.id,
                stage_key: 'intro',
                text_lines: [
                    'Mind the pots. And mind yourself, this floor has had three centuries to get slippery.',
                    "You want to learn? Everyone wants to learn, right up until they scorch a good fish. Bring me six cooked properly and I will believe you.",
                    'Use my hearth. It is old and it is slow and it is not yours, but it will not let you burn the parish down.',
                ],
                options: JSON.stringify([
                    { label: '"I can manage six fish."', action: null, next_stage: 'offer' },
                    { label: '"Another time."', action: 'close', next_stage: null },
                ]),
            },
            {
                npc_id: npc.id,
                stage_key: 'offer',
                text_lines: [
                    'Six. Cooked, not blackened. Come back when you have them and we will talk about a hearth of your own.',
                ],
                options: JSON.stringify([
                    { label: 'Accept Quest', action: `start_quest:${quest.id}`, next_stage: 'progress' },
                    { label: 'Cancel', action: 'close', next_stage: null },
                ]),
            },
            {
                npc_id: npc.id,
                stage_key: 'progress',
                text_lines: [
                    'Still going? Pull it off the heat sooner than you think you should. It keeps cooking after.',
                ],
                options: JSON.stringify([{ label: 'Close', action: 'close', next_stage: null }]),
            },
            {
                npc_id: npc.id,
                stage_key: 'ready',
                text_lines: [
                    'Six, and not a one of them ruined. Better than my last two apprentices between them.',
                    'The hearth here is yours to use. It is slow, mind, and I will want it back the moment I need it.',
                    'Build your own when you can. A granite hearth is the whole of it to start with, cut by hand, no bench needed. The rest, the cauldron and the skillet and the knives, you will want a smith for.',
                ],
                options: JSON.stringify([
                    { label: '"Thank you, Geomima."', action: `complete_talk_objective:${quest.id}`, next_stage: 'complete' },
                ]),
            },
            {
                npc_id: npc.id,
                stage_key: 'complete',
                text_lines: [
                    'The hearth is there when you need it. But get your own built, and get a cauldron under it. You cannot make anything worth eating in a skillet alone.',
                ],
                options: JSON.stringify([{ label: 'Farewell', action: 'close', next_stage: null }]),
            },
        ]);
    }
}

export async function down(knex: Knex): Promise<void> {
    const npc = await knex('npcs').where({ name: 'Geomima' }).first();
    if (npc) {
        await knex('npc_dialogues').where({ npc_id: npc.id }).delete();
        await knex('npcs').where({ id: npc.id }).delete();
    }

    const quest = await knex('quests').where({ name: "The Cook's Conundrum" }).first();
    if (quest) {
        await knex('quest_objectives').where({ quest_id: quest.id }).delete();
        await knex('player_quests').where({ quest_id: quest.id }).delete();
        await knex('quests').where({ id: quest.id }).delete();
    }

    const names = [
        'Granite Hearth', 'Granite Mortar and Pestle', 'Ambren Cauldron', 'Ambren Skillet',
        'Ambren Cooking Knife', 'Ambren Meat Cleaver', 'Ambren Ladle', 'Ambren Flesh Hook',
    ];
    await knex('recipes').whereIn('name', names).delete();
    await knex('items').whereIn('name', names).delete();

    await knex.schema.alterTable('recipes', (t) => {
        t.dropColumn('burn_base');
        t.dropColumn('burn_stop');
    });
    await knex.schema.alterTable('items', (t) => {
        t.dropColumn('heal_amount');
    });
}
