import type { Knex } from 'knex';

// Converts dialogue quest references from names to IDs.
//
// npc_dialogues.options holds action strings like "start_quest:<payload>", and
// routes/npcs.ts resolved that payload against quests.name. That made quest names
// load-bearing identifiers: renaming a quest broke its NPC, which is exactly what
// happened to Georgic (fixed in 20260725040000). IDs don't move when a title does.
//
// Names are resolved here rather than hardcoded, so each database writes its own
// correct IDs. Any future dialogue seed must do the same — look the quest up by
// name at migration time and store the ID.
//
// Throws if a referenced quest can't be found, so a bad reference fails the
// migration instead of reaching players as a dead button.

const PREFIXES = ['start_quest:', 'complete_talk_objective:'];

interface Option {
    action?: string | null;
    [key: string]: unknown;
}

async function convert(knex: Knex, toIds: boolean): Promise<void> {
    const rows = await knex('npc_dialogues').select('id', 'npc_id', 'options');

    for (const row of rows) {
        if (row.options === null || row.options === undefined) continue;

        const options: Option[] =
            typeof row.options === 'string' ? JSON.parse(row.options) : row.options;
        if (!Array.isArray(options)) continue;

        let changed = false;

        for (const opt of options) {
            if (typeof opt?.action !== 'string') continue;

            const prefix = PREFIXES.find(p => opt.action!.startsWith(p));
            if (!prefix) continue;

            const payload = opt.action.slice(prefix.length).trim();
            const isNumeric = /^\d+$/.test(payload);

            // up(): names -> IDs. down(): IDs -> names.
            if (toIds === isNumeric) continue;

            const quest = toIds
                ? await knex('quests').where({ name: payload }).first()
                : await knex('quests').where({ id: parseInt(payload, 10) }).first();

            if (!quest) {
                throw new Error(
                    `dialogue_quest_ids: npc_dialogues.id=${row.id} (npc ${row.npc_id}) `
                    + `references quest "${payload}", which does not exist`,
                );
            }

            opt.action = `${prefix}${toIds ? quest.id : quest.name}`;
            changed = true;
        }

        if (changed) {
            await knex('npc_dialogues')
                .where({ id: row.id })
                .update({ options: JSON.stringify(options) });
        }
    }
}

export async function up(knex: Knex): Promise<void> {
    await convert(knex, true);
}

export async function down(knex: Knex): Promise<void> {
    await convert(knex, false);
}
