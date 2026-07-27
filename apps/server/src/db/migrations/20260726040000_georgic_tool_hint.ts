import type { Knex } from 'knex';

// Georgic mentions the mallet and saw before you accept his quest.
//
// He hands over a hoe, a bucket, and seed, so players reasonably assume they have
// been given everything the quest needs. They then stand at Novita unable to
// raise the farmstead, because that wants a Lanai Mallet held in hand and an
// Ambren Saw carried, neither of which Georgic gives and neither of which the
// quest text mentioned.
//
// Added as a third paragraph on the 'offer' stage, in his own blunt register, and
// pointing at Carpentry as the source rather than implying he supplies it.
// Idempotent: skips if the reminder is already there.

const ORIGINAL_OFFER = [
    "First you'll want land of your own. A farmstead—timber, dressed stone, and a great many nails. It's a long haul and I'll not pretend otherwise. Half the folk who mean to farm never get past it.",
    "I'll not carry that for you. But here, a hoe, a bucket, and enough carrot seed to fill your first field. When the farmstead stands, the rest of it is easy.",
    "Raise it. Break a field. Sow it. Then leave it be, and come back when it's ready. That's the whole of it.",
];

const REVISED_OFFER = [
    "First you'll want land of your own. A farmstead—timber, dressed stone, and a great many nails. It's a long haul and I'll not pretend otherwise. Half the folk who mean to farm never get past it.",
    "I'll not carry that for you. But here, a hoe, a bucket, and enough carrot seed to fill your first field. When the farmstead stands, the rest of it is easy.",
    "One thing more, and mind it. A mallet in your hands and a saw in your pack, or the frame won't go up at all. Carpenter's kit, that, not mine to give. More folk have stood in a field blaming the ground than have thought to check what they were holding.",
    "Raise it. Break a field. Sow it. Then leave it be, and come back when it's ready. That's the whole of it.",
];

async function setOffer(knex: Knex, lines: string[]): Promise<void> {
    const georgic = await knex('npcs').where({ name: 'Georgic' }).first();
    if (!georgic) return;

    await knex('npc_dialogues')
        .where({ npc_id: georgic.id, stage_key: 'offer' })
        .update({ text_lines: lines, updated_at: knex.fn.now() });
}

export async function up(knex: Knex): Promise<void> {
    const georgic = await knex('npcs').where({ name: 'Georgic' }).first();
    if (!georgic) return;

    const stage = await knex('npc_dialogues')
        .where({ npc_id: georgic.id, stage_key: 'offer' })
        .first();

    if (!stage) return;

    // Already carries the reminder, so leave whatever wording is in place. This
    // matters because the dialogue is editable and should not be stomped.
    const current: string[] = stage.text_lines || [];
    if (current.some((line) => line.includes('a saw in your pack'))) return;

    await setOffer(knex, REVISED_OFFER);
}

export async function down(knex: Knex): Promise<void> {
    await setOffer(knex, ORIGINAL_OFFER);
}
