import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The brothers are Friddik, not Friddick (Nathan, 2026-11-25). Every place the
// name is written in content: their names and titles, what they say, the
// errand legs (which name them as from and to), and the birthday card.
// The errand pool's key, 'friddick', is a code key players never see, and
// stays as it is.

const FROM = 'Friddick';
const TO = 'Friddik';

// [table, column, kind]
const COLUMNS: [string, string, 'text' | 'array' | 'jsonb'][] = [
    ['npcs', 'name', 'text'],
    ['npcs', 'title', 'text'],
    ['npc_dialogues', 'text_lines', 'array'],
    ['npc_dialogues', 'options', 'jsonb'],
    ['npc_rare_lines', 'line', 'text'],
    ['items', 'description', 'text'],
    ['errands', 'name', 'text'],
    ['errands', 'legs', 'jsonb'],
    ['daily_tasks', 'ask', 'jsonb'],
    ['daily_tasks', 'thanks', 'jsonb'],
    ['quests', 'description', 'text'],
    ['quest_objectives', 'description', 'text'],
];

async function respell(knex: Knex, from: string, to: string): Promise<void> {
    for (const [table, column, kind] of COLUMNS) {
        if (!(await knex.schema.hasTable(table)) || !(await knex.schema.hasColumn(table, column))) continue;
        const set = kind === 'array'
            ? `array(select replace(x, ?, ?) from unnest(${column}) as x)`
            : kind === 'jsonb' ? `replace(${column}::text, ?, ?)::jsonb` : `replace(${column}, ?, ?)`;
        await knex.raw(`UPDATE ${table} SET ${column} = ${set} WHERE ${column}::text LIKE ?`, [from, to, `%${from}%`]);
    }
}

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    await respell(knex, FROM, TO);
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    await respell(knex, TO, FROM);
}
