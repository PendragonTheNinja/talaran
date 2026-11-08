import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The Chronicle, step 3 (docs/chronicle-spec.md §2): the Salty Sloth in
// Talador, and Wenna Halloway, who keeps the tidings there.
//
//   taverns row         the place: its name and what you see walking in.
//                       routes/location.ts sends it with the location, and the
//                       location panel offers "The Salty Sloth".
//   Wenna (npcs)        stands among Talador's people; her dialogue has an
//                       option that opens the tavern (action 'open:tavern',
//                       handled by the client, never sent to the server).
//   greeting verses     what she says when the tavern opens, one per day,
//                       chosen by the composer's seeded picker.

const TAVERN = {
    name: 'The Salty Sloth',
    description: 'A low room off the Talador docks, all pipe smoke and wet wool. The sloth carved over the door lost most of its nose to a gull years ago.',
};

const WENNA = { name: 'Wenna Halloway', title: 'Keeper of the Tidings', avatar: '🪶' };

const DIALOGUE: { stage: string; text_lines: string[]; options: { label: string; next_stage: string | null; action: string | null }[] }[] = [
    {
        stage: 'intro',
        text_lines: [
            "Wenna Halloway. Sit anywhere that isn't sticky.",
            "Whatever this island gets up to, somebody tells me before the night is out. At midnight I write the best of it in the book.",
        ],
        options: [
            { label: '"What news is there?"', next_stage: null, action: 'open:tavern' },
            { label: '"What book?"', next_stage: 'about', action: null },
            { label: '"Another time."', next_stage: null, action: 'close' },
        ],
    },
    {
        stage: 'about',
        text_lines: [
            "The tidings. Every day that ends goes in, with the names of whoever earned a place.",
            "Find something rare, master a trade, beat a thing you had no right to beat. I'll hear of it. I always do.",
            "You can read any page back to the first. Ask, and I'll fetch it down.",
        ],
        options: [
            { label: '"Let me see it."', next_stage: null, action: 'open:tavern' },
            { label: '"Another time."', next_stage: null, action: 'close' },
        ],
    },
];

const GREETINGS = [
    'Come in out of the weather. The tidings so far are on the board, and the beer is behind me.',
    "Sit down, you look like you've been working. Here's what the island has been up to.",
    "Busy day? Everyone's is. Here's what I've heard.",
    "Wipe your boots. There's news, and some of it is even good.",
    "Back again. Good. I've a few things to tell you.",
    "Pull up a stool. Mind the one with three legs.",
];

export async function up(knex: Knex): Promise<void> {
    const have = new Set((await knex('chronicle_verses').where({ kind: 'greeting' }).select('text')).map((r: any) => r.text));
    const rows = GREETINGS.filter((t) => !have.has(t)).map((text) => ({ kind: 'greeting', text, needs: [] as string[] }));
    if (rows.length) await knex('chronicle_verses').insert(rows);

    if (!(await hasContent(knex))) return;
    const talador = await knex('locations').where({ name: 'Talador' }).first('id');
    if (!talador) throw new Error('salty_sloth: no location named Talador.');

    let npc = await knex('npcs').where({ name: WENNA.name }).first('id');
    if (npc) await knex('npcs').where({ id: npc.id }).update({ ...WENNA, location_id: talador.id, is_active: true });
    else [npc] = await knex('npcs').insert({ ...WENNA, location_id: talador.id, is_active: true }).returning('id');
    const npcId = typeof npc === 'object' ? npc.id : npc;

    for (const d of DIALOGUE) {
        const row = { text_lines: d.text_lines, options: JSON.stringify(d.options) };
        const existing = await knex('npc_dialogues').where({ npc_id: npcId, stage_key: d.stage }).first('id');
        if (existing) await knex('npc_dialogues').where({ id: existing.id }).update({ ...row, updated_at: knex.fn.now() });
        else await knex('npc_dialogues').insert({ npc_id: npcId, stage_key: d.stage, ...row });
    }

    const tavern = { ...TAVERN, location_id: talador.id, bard_npc_id: npcId };
    await knex('taverns').insert(tavern).onConflict('name').merge(tavern);
}

export async function down(knex: Knex): Promise<void> {
    await knex('taverns').where({ name: TAVERN.name }).delete();
    const npc = await knex('npcs').where({ name: WENNA.name }).first('id');
    if (npc) {
        await knex('npc_dialogues').where({ npc_id: npc.id }).delete();
        await knex('npcs').where({ id: npc.id }).delete();
    }
    await knex('chronicle_verses').where({ kind: 'greeting' }).whereIn('text', GREETINGS).delete();
}
