import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// A tutor's daily also pays a tool of their craft (Nathan, 2026-11-22), with
// more XP and gold than before (services/dailies.ts). Tools wear out (T1 lasts
// about twelve hours of work), so a tool a day keeps pace with what a player
// breaks rather than piling up.
//
//   npcs.daily_tools   [{ level, items }]: from the highest band the player's
//                      level in the tutor's skill reaches, one item, picked by
//                      the day. Ambren below 13, Serph from 13. Georome, who
//                      has no tool, gives a cut stone for the rift.

const T = (a: string[], b: string[]) => JSON.stringify([{ level: 1, items: a }, { level: 13, items: b }]);
const both = (kinds: string[]) => T(kinds.map(k => `Ambren ${k}`), kinds.map(k => `Serph ${k}`));

const TOOLS: Record<string, string> = {
    Geoffrey: both(['Hammer', 'Tongs']),
    Geossica: both(['Saw', 'Plane']),
    Geonsen: T(['Lanai Hunting Bow', 'Ambren Butchering Knife'], ['Lanai Hunting Bow', 'Serph Butchering Knife']),
    Georgic: both(['Hoe', 'Scythe']),
    Geothro: T(['Feed Pail', 'Mucking Fork', 'Ambren Butchering Knife'], ['Feed Pail', 'Mucking Fork', 'Serph Butchering Knife']),
    Georemy: both(['Fishing Rod', 'Flesh Hook']),
    Geomima: both(['Skillet', 'Cooking Knife', 'Ladle']),
    Georold: both(['Scimitar', 'Mace', 'Spear']),
    Geosper: both(['Gem Chisel', "Jeweller's Pliers"]),
    Georome: T(['Cut Quartz'], ['Cut Garnet']),
};

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('npcs', 'daily_tools'))) {
        await knex.schema.alterTable('npcs', (t) => { t.jsonb('daily_tools').nullable(); });
    }
    if (!(await hasContent(knex))) return;
    for (const [npc, tools] of Object.entries(TOOLS)) {
        for (const band of JSON.parse(tools) as { items: string[] }[]) {
            for (const item of band.items) {
                if (!(await knex('items').where({ name: item }).first('id'))) throw new Error(`daily_tools: no item named ${item}`);
            }
        }
        const n = await knex('npcs').where({ name: npc }).update({ daily_tools: tools });
        if (n !== 1) throw new Error(`daily_tools: no NPC named ${npc}`);
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('npcs', 'daily_tools')) {
        await knex.schema.alterTable('npcs', (t) => { t.dropColumn('daily_tools'); });
    }
}
