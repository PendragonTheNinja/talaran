import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Hollin Bray's one line of conversation (2026-11-05).
//
// The game never asks for it: tapping the Crier opens his poll
// (LocationPanel.tsx). Only a tab still running the code from before the polls
// shipped asks for his dialogue, and with none it showed "Dialogue not found."
// This tells that player what to do. resolveStage gives a quest-less NPC
// 'intro'.

const NAME = 'Hollin Bray';
const STAGE = 'intro';
const TEXT_LINES = [
    'Hear ye! The Maker has a question going round, and you have not heard it yet.',
    'The page you are reading from is an old one, friend. Refresh it, and I will put the question to you proper.',
];
const OPTIONS = [
    { label: '"I will."', next_stage: null, action: 'close' },
];

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    const npc = await knex('npcs').where({ name: NAME }).first('id');
    if (!npc) throw new Error(`crier_old_page_line: no NPC named ${NAME} (run 20261105120000_crier_polls first).`);
    const row = { text_lines: TEXT_LINES, options: JSON.stringify(OPTIONS) };
    const existing = await knex('npc_dialogues').where({ npc_id: npc.id, stage_key: STAGE }).first('id');
    if (existing) await knex('npc_dialogues').where({ id: existing.id }).update({ ...row, updated_at: knex.fn.now() });
    else await knex('npc_dialogues').insert({ npc_id: npc.id, stage_key: STAGE, ...row });
}

export async function down(knex: Knex): Promise<void> {
    const npc = await knex('npcs').where({ name: NAME }).first('id');
    if (npc) await knex('npc_dialogues').where({ npc_id: npc.id, stage_key: STAGE }).delete();
}
