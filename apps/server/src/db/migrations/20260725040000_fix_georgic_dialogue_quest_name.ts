import type { Knex } from 'knex';

// Repair for 20260725010000_rename_farming_quest.
//
// npc_dialogues.options embeds quest names inside action strings
// ("start_quest:<name>", "complete_talk_objective:<name>"), and routes/npcs.ts
// resolves those by name. Renaming the quests row left Georgic's Accept Quest
// and turn-in buttons pointing at a title that no longer exists, so both
// returned 404 "Quest not found."
//
// Rewrites any dialogue option referencing the old title. Scans every row rather
// than the two known ones, so nothing authored later is missed, and is safe to
// re-run.

const OLD_NAME = "Georgic's Lesson";
const NEW_NAME = "The Farmer's Wisdom";

async function rewrite(knex: Knex, from: string, to: string): Promise<number> {
    const rows = await knex('npc_dialogues').select('id', 'options');
    let changed = 0;

    for (const row of rows) {
        if (row.options === null || row.options === undefined) continue;

        // options is stored as a JSON string, but tolerate a driver that hands
        // back a parsed object.
        const raw = typeof row.options === 'string' ? row.options : JSON.stringify(row.options);
        if (!raw.includes(from)) continue;

        await knex('npc_dialogues')
            .where({ id: row.id })
            .update({ options: raw.split(from).join(to) });
        changed++;
    }

    return changed;
}

export async function up(knex: Knex): Promise<void> {
    await rewrite(knex, OLD_NAME, NEW_NAME);
}

export async function down(knex: Knex): Promise<void> {
    await rewrite(knex, NEW_NAME, OLD_NAME);
}
