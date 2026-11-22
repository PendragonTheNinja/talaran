import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The tutors' daily tasks and a few lines of their own (Nathan, 2026-11-22),
// and the first rare lines: the Friddicks' faint hint of their lost brothers.
// The verbs are services/dailies.ts.
//
//   npcs.daily_skill           a tutor: the skill a daily pays.
//   npcs.daily_after_quest_id  their lesson, which must be done first.
//   npcs.daily_chatter         lines said at random between tasks (jsonb).
//   daily_tasks                what a tutor may ask for: an item and how many,
//                              what they say asking ({qty}), and thanks.
//   player_daily_tasks         one a tutor a player a game day: the gate.
//   npc_rare_lines             a line any NPC adds, 1 in chance_one_in talks.
//
// The Friddicks' lore (Nathan, 2026-11-22): there were seven brothers. Four of
// them went through a door one day and never came out the other side. (In the
// game Syrnia there are four Friddick Brothers; this is a nod to them, never
// named.) A main quest may tell it one day; for now, only a rare line.

interface TaskDef { item: string; qty: number; ask: string[]; thanks: string[] }
interface Tutor { npc: string; quest: string; skill: string; chatter: string[]; tasks: TaskDef[] }

const TUTORS: Tutor[] = [
    { npc: 'Geoffrey', quest: "The Blacksmith's Bargain", skill: 'Smithing',
      chatter: ['Anvil\'s been ringing all morning. Mine, not yours. Yours is wherever you left it.', 'Charc\'s gone up again. Everything goes up but wages.', 'Keep your tongs dry. Wet tongs and hot iron is how ye learn a new word.'],
      tasks: [
        { item: 'Ambren Nails', qty: 40, ask: ['I\'m short of nails for a cart wheel. {qty} Ambren nails, if ye have them.'], thanks: ['Good nails. Straight, mostly.'] },
        { item: 'Ambren Ingot', qty: 10, ask: ['A merchant wants a run of hinges and I\'ve not the ingots. {qty} Ambren ingots would see me through.'], thanks: ['That\'s the order filled. Ye smelt a clean ingot.'] },
        { item: 'Ambren Hook', qty: 6, ask: ['The fishers keep losing hooks to the big ones at Dawncrest. {qty} Ambren hooks for my shelf.'], thanks: ['They\'ll lose these too. That\'s good for business.'] },
      ] },
    { npc: 'Geossica', quest: "The Carpenter's Commission", skill: 'Carpentry',
      chatter: ['Smell that? Fresh-sawn lanai. Best smell in Verdale.', 'Someone left a saw in the rain last week. I won\'t say who. It wasn\'t me.', 'Lift with your legs. I tell everyone. Nobody listens until their back does it for them.'],
      tasks: [
        { item: 'Lanai Planks', qty: 25, ask: ['I\'m laying a new floor in the bench shed. {qty} lanai planks would do it.'], thanks: ['Good, even boards. The floor will be glad of them.'] },
        { item: 'Lanai Arrow Shafts', qty: 25, ask: ['Geonsen\'s been on at me for shafts again. {qty} arrow shafts, and he can stop asking.'], thanks: ['There. That\'ll keep him quiet for a fortnight.'] },
        { item: 'Lanai Tool Rod', qty: 10, ask: ['Handles. Everybody breaks handles. {qty} tool rods for the rack.'], thanks: ['Straight grain on all of them. You\'ve got the eye now.'] },
      ] },
    { npc: 'Geonsen', quest: "The Huntsman's Lesson", skill: 'Hunting',
      chatter: ['A fox crossed the path this morning and looked at me as if I owed it money.', 'The deer are moving early this year. Something up north has them nervous.', 'Quiet, now. No. That was a bird. Carry on.'],
      tasks: [
        { item: 'Feathers', qty: 25, ask: ['I\'m fletching for the winter and I\'m short of feathers. {qty} feathers.'], thanks: ['Good, clean flights. These will fly true.'] },
        { item: 'Buckskin', qty: 3, ask: ['The old jerkin\'s through at the elbows. {qty} buckskins, and I\'ll have it mended.'], thanks: ['Well taken. You\'re hunting it kindly, I can tell from the hide.'] },
      ] },
    { npc: 'Georgic', quest: "The Farmer's Wisdom", skill: 'Farming',
      chatter: ['Rain tonight. I can feel it in the knee.', 'Field\'s resting. Doesn\'t look like much, but it\'s working harder than either of us.', 'There\'s a crow on the fence post that\'s been watching me plant for six years. I\'ve named him. I won\'t tell you what.'],
      tasks: [
        { item: 'Carrot', qty: 30, ask: ['I\'ve promised the Novita kitchen carrots and my own row came up thin. {qty} carrots.'], thanks: ['Good roots. Sweet, by the look of them.'] },
        { item: 'Onion', qty: 30, ask: ['Pickling week. {qty} onions, if you\'ve grown them.'], thanks: ['That\'s the jars filled. My eyes are watering just looking at them.'] },
        { item: 'Turnip', qty: 20, ask: ['Geothro wants turnips for the cattle over winter. {qty} turnips.'], thanks: ['He\'ll be pleased. He won\'t say so, but he will be.'] },
      ] },
    { npc: 'Geothro', quest: "The Stockman's Seminar", skill: 'Husbandry',
      chatter: ['One of the hens has started laying in my boot. I\'ve stopped wearing that boot.', 'Animals know when you\'re in a hurry. They make a point of it.', 'Mucked out at dawn. Everything smells of it. You get used to it. You don\'t, actually.'],
      tasks: [
        { item: 'Egg', qty: 15, ask: ['The baker\'s short and my hens are sulking. {qty} eggs, if yours aren\'t.'], thanks: ['Brown and speckled, the good kind. Your hens are happy.'] },
        { item: 'Honeycomb', qty: 3, ask: ['The children at Novita were promised honey and the bees here have other ideas. {qty} honeycombs.'], thanks: ['Thank you. You\'ve not been stung much, by the look of you. Well done.'] },
      ] },
    { npc: 'Georemy', quest: 'The Luxmere Investigation', skill: 'Fishing',
      chatter: ['The lake was very still last night. Too still. I made a note of it.', 'A heron took a fish from under my line this morning. We looked at each other for some time.', 'Thirty years and the water still surprises me. That is the reason I stay.'],
      tasks: [
        { item: 'Whiting', qty: 15, ask: ['I am weighing fish for my records. {qty} whiting, if you would.'], thanks: ['Noted. Thank you. The records grow.'] },
        { item: 'Tiddle', qty: 20, ask: ['Small fish say a great deal about a water. {qty} tiddle for the study.'], thanks: ['Healthy, all of them. A good sign.'] },
        { item: 'Perch', qty: 12, ask: ['{qty} perch. Do not ask what for. I will tell you anyway, and it will take an hour.'], thanks: ['Excellent. The hour is yours, whenever you want it.'] },
      ] },
    { npc: 'Geomima', quest: "The Cook's Conundrum", skill: 'Cooking',
      chatter: ['Someone put salt in the sugar crock. Again. I know who it was.', 'Never trust a cook who is thin. Never trust one who is too cheerful, either.', 'The ovens are hot and the parish is hungry. It is always this way.'],
      tasks: [
        { item: 'Cooked Whiting', qty: 10, ask: ['The almshouse needs feeding and I have three pans on already. {qty} cooked whiting, cooked through.'], thanks: ['Not one burnt. I am almost impressed.'] },
        { item: 'Root Pottage', qty: 6, ask: ['A cold night coming. {qty} bowls of root pottage for the sick ward.'], thanks: ['Thick enough to stand a spoon in. Good.'] },
        { item: 'Flatbread', qty: 10, ask: ['Market day and I have no bread. {qty} flatbreads, quickly.'], thanks: ['Warm still. You walked fast.'] },
      ] },
    { npc: 'Georold', quest: "The Warden's Count", skill: 'Melee',
      chatter: ['Two hundred and twelve rats this morning. Up six.', 'A ship came in with a cat aboard. The cat left at the first port. I respect the cat.', 'Stand up straight. You fight the way you stand.'],
      tasks: [
        { item: 'Ratskin', qty: 10, ask: ['The harbor wants proof I am still keeping count. {qty} ratskins. They like proof.'], thanks: ['Counted. Filed. The harbor is satisfied, for once.'] },
      ] },
    { npc: 'Geosper', quest: "The Lapidary's Lesson", skill: 'Crafting',
      chatter: ['Found a pebble in my tea this morning. Turned out to be quartz. I kept it.', 'The wheel needs truing again. It always needs truing again.', 'Leatherworkers next door are arguing about stitches. They argue about stitches every day.'],
      tasks: [
        { item: 'Cut Quartz', qty: 5, ask: ['A Rift pilgrim wants a set of matched stones and I\'m behind. {qty} cut quartz.'], thanks: ['Clean facets. You\'ve been practicing.'] },
        { item: 'Halter & Lead', qty: 2, ask: ['Geothro keeps losing halters to his horses. {qty} halters.'], thanks: ['Good stitching. He\'ll lose them anyway.'] },
      ] },
    { npc: 'Georome', quest: "The Priest's Portion", skill: 'Talar',
      chatter: ['Swept the chapel twice today. The wind brings the grit back in. The wind and I have an understanding.', 'The light is quiet this morning. It comes and goes like a tide.', 'People ask what is down there. I sweep the floor and let them ask.'],
      tasks: [
        { item: 'Rough Quartz', qty: 5, ask: ['The altar stones are worn smooth. {qty} rough quartz, raw, for new ones.'], thanks: ['These will do. The light likes a stone with some fight left in it.'] },
      ] },
];

const RARE_LINES: { npc: string; line: string; chance: number }[] = [
    { npc: 'Nathan Friddick', chance: 25, line: 'Mother still sets seven places at the table. Nobody says anything about it.' },
    { npc: 'Matthew Friddick', chance: 25, line: 'There were seven of us, once. Four went through an old door one spring to see where it went. It went somewhere. Not here.' },
    { npc: 'Christopher Friddick', chance: 25, line: 'Some nights the Rift hums as if someone on the other side is trying the latch. I sleep near it, in case.' },
];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('npcs', 'daily_skill'))) {
        await knex.schema.alterTable('npcs', (t) => {
            t.string('daily_skill', 50).nullable();
            t.integer('daily_after_quest_id').nullable().references('id').inTable('quests').onDelete('SET NULL');
            t.jsonb('daily_chatter').nullable();
        });
    }
    if (!(await knex.schema.hasTable('daily_tasks'))) {
        await knex.schema.createTable('daily_tasks', (t) => {
            t.increments('id').primary();
            t.string('npc_name', 100).notNullable();
            t.string('item_name', 100).notNullable();
            t.integer('quantity').notNullable();
            t.jsonb('ask').notNullable();
            t.jsonb('thanks').notNullable();
            t.boolean('is_active').notNullable().defaultTo(true);
            t.timestamps(true, true);
            t.unique(['npc_name', 'item_name']);
        });
        await knex.raw('ALTER TABLE daily_tasks ADD CONSTRAINT daily_tasks_quantity CHECK (quantity >= 1)');
    }
    if (!(await knex.schema.hasTable('player_daily_tasks'))) {
        await knex.schema.createTable('player_daily_tasks', (t) => {
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.string('npc_name', 100).notNullable();
            t.string('day', 10).notNullable();
            t.integer('task_id').notNullable().references('id').inTable('daily_tasks').onDelete('CASCADE');
            t.timestamp('done_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.primary(['player_id', 'npc_name', 'day']);
        });
    }
    if (!(await knex.schema.hasTable('npc_rare_lines'))) {
        await knex.schema.createTable('npc_rare_lines', (t) => {
            t.increments('id').primary();
            t.integer('npc_id').notNullable().references('id').inTable('npcs').onDelete('CASCADE');
            t.text('line').notNullable();
            t.integer('chance_one_in').notNullable().defaultTo(25);
            t.boolean('is_active').notNullable().defaultTo(true);
            t.timestamps(true, true);
            t.unique(['npc_id', 'line']);
        });
    }
    if (!(await hasContent(knex))) return;

    for (const t of TUTORS) {
        const npc = await knex('npcs').where({ name: t.npc }).first('id');
        if (!npc) throw new Error(`tutor_dailies: no NPC named ${t.npc}`);
        const quest = await knex('quests').where({ name: t.quest }).first('id');
        if (!quest) throw new Error(`tutor_dailies: no quest named ${t.quest}`);
        if (!(await knex('skills').where({ name: t.skill }).first('id'))) throw new Error(`tutor_dailies: no skill named ${t.skill}`);
        await knex('npcs').where({ id: npc.id }).update({ daily_skill: t.skill, daily_after_quest_id: quest.id, daily_chatter: JSON.stringify(t.chatter) });
        for (const task of t.tasks) {
            if (!(await knex('items').where({ name: task.item }).first('id'))) throw new Error(`tutor_dailies: no item named ${task.item}`);
            const row = { npc_name: t.npc, item_name: task.item, quantity: task.qty, ask: JSON.stringify(task.ask), thanks: JSON.stringify(task.thanks), is_active: true };
            const had = await knex('daily_tasks').where({ npc_name: t.npc, item_name: task.item }).first('id');
            if (had) await knex('daily_tasks').where({ id: had.id }).update({ ...row, updated_at: knex.fn.now() });
            else await knex('daily_tasks').insert(row);
        }
    }

    for (const r of RARE_LINES) {
        const npc = await knex('npcs').where({ name: r.npc }).first('id');
        if (!npc) throw new Error(`tutor_dailies: no NPC named ${r.npc} (run the Friddick migration first)`);
        await knex('npc_rare_lines').insert({ npc_id: npc.id, line: r.line, chance_one_in: r.chance, is_active: true })
            .onConflict(['npc_id', 'line']).merge({ chance_one_in: r.chance, is_active: true });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('npc_rare_lines');
    await knex.schema.dropTableIfExists('player_daily_tasks');
    await knex.schema.dropTableIfExists('daily_tasks');
    if (await knex.schema.hasColumn('npcs', 'daily_skill')) {
        await knex.schema.alterTable('npcs', (t) => {
            t.dropColumn('daily_chatter');
            t.dropColumn('daily_after_quest_id');
            t.dropColumn('daily_skill');
        });
    }
}
