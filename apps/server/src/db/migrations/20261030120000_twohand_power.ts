import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Two-handed weapons hit 8% harder (Nathan, 2026-10-30, from the forum). They
// killed exactly as fast as dual weapons while swinging slower and wasting more
// on the killing blow, so nothing rewarded the choice. combatSim forms after:
// two-hand ~3 to 5% ahead of dual at every combat level, no more damage taken.
// TIER1_POWER in lib/combatMath.ts carries the same change for new tiers.
// Absolute values by name, so it re-runs safely.

const POWER: Array<[name: string, before: number, after: number]> = [
    ['Ambren Atgeir', 61, 66],
    ['Ambren Greatsword', 64, 69],
    ['Ambren Maul', 66, 71],
    ['Hodag Horn', 74, 80],
    ["Gouger's Legbone", 81, 87],
];

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    for (const [name, , after] of POWER) {
        const item = await knex('items').where({ name }).first('id', 'weapon_form');
        if (!item) throw new Error(`twohand_power: no item named ${name}`);
        if (item.weapon_form !== 'twohand') throw new Error(`twohand_power: ${name} is not two-handed`);
        await knex('items').where({ id: item.id }).update({ power: after });
    }
}

export async function down(knex: Knex): Promise<void> {
    for (const [name, before] of POWER) await knex('items').where({ name }).update({ power: before });
}
