import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Garnet jewelry, tier 2 (docs/talar-spec.md §8; Nathan, 2026-10-28: "T2 waits
// for Serph"). The quartz pieces' twins: Serph and garnet, worn from Talar 13,
// made at the lapidary by Crafting (rings at 20, amulets at 22) from 2 Serph
// Ingots and 3 Lit, 2 Bright, or 1 Radiant Garnet, 120 s, XP by the
// finished-goods law (207 and 218). Strength is the tier's, in code
// (lib/jewelry.ts aidStrength: 1.5 times quartz at tier 2). Antura's museum's.
// Priced in scripts/deriveValues.ts OVERRIDES, as the quartz pieces are.

const ISLAND = 'Antura';
const VALUE = 4150;   // Radiant Garnet 4,050 + 2 Serph Ingots 68 + setting

const PIECES = [
    { name: "Garnet Keeper's Band", subtype: 'ring', slot: 'finger', aid: 'wear', level: 20,
      description: 'A plain band of Serph with a deep red garnet sunk flush in it. Kit carried by its wearer seems to forget the knocks it takes.' },
    { name: "Garnet Prospector's Ring", subtype: 'ring', slot: 'finger', aid: 'vein', level: 20,
      description: 'A Serph ring with a red garnet set high, like a lamp on a pole. A seam found by its wearer tends to run deeper.' },
    { name: "Garnet Seedsaver's Ring", subtype: 'ring', slot: 'finger', aid: 'harvest', level: 20,
      description: 'A Serph ring engraved with a sheaf of grain round a small red garnet. At harvest, something is often left over for next year.' },
    { name: "Garnet Hearty Amulet", subtype: 'amulet', slot: 'neck', aid: 'fight_food', level: 22,
      description: 'A heavy Serph pendant with a garnet the color of a beating heart. Bread eaten in a hard moment goes further.' },
    { name: "Garnet Wayfinder's Amulet", subtype: 'amulet', slot: 'neck', aid: 'road', level: 22,
      description: 'A Serph pendant shaped like a compass rose, a garnet at its center for north. Walkers who wear one notice what lies at the roadside.' },
    { name: "Garnet Baitkeeper's Amulet", subtype: 'amulet', slot: 'neck', aid: 'bait', level: 22,
      description: 'A Serph pendant cast as a coiled fish, with a garnet for its eye. What goes on the hook or under the snare is often not taken.' },
];

const GRADES: Array<[string, number]> = [['Radiant', 1], ['Bright', 2], ['Lit', 3]];
const XP: Record<number, number> = { 20: 207, 22: 218 };

function recipes() {
    return PIECES.flatMap(p => GRADES.map(([grade, qty]) => ({
        name: `Set ${p.name} (${grade})`, skill: 'Crafting', output_item_name: p.name, output_qty: 1,
        inputs: JSON.stringify([{ itemName: `${grade} Garnet`, qty }, { itemName: 'Serph Ingot', qty: 2 }]),
        required_level: p.level, timer_seconds: 120, xp: XP[p.level], station: 'lapidary',
        required_tools: JSON.stringify(['lap_wheel', 'gem_chisel', 'jewelers_pliers']), for_skill: 'Talar', mode: 'active',
        flavor_text: 'You draw the Serph into a setting, seat the garnet, and close the claws round it.',
        is_active: true,
    })));
}

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    for (const n of ['Radiant Garnet', 'Bright Garnet', 'Lit Garnet', 'Serph Ingot']) {
        if (!(await knex('items').where({ name: n }).first('id'))) throw new Error(`garnet_jewelry: item "${n}" not found`);
    }
    for (const p of PIECES) {
        const row = {
            name: p.name, type: 'jewelry', subtype: p.subtype, slot: p.slot, tier: 2, level_required: 13, jewelry_aid: p.aid,
            description: p.description, value: VALUE, value_locked: true, island: ISLAND, is_active: true,
        };
        const had = await knex('items').where({ name: p.name }).first('id');
        if (had) await knex('items').where({ id: had.id }).update(row);
        else await knex('items').insert(row);
    }
    for (const r of recipes()) {
        const had = await knex('recipes').where({ name: r.name }).first('id');
        if (had) await knex('recipes').where({ id: had.id }).update(r);
        else await knex('recipes').insert(r);
    }
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    await knex('recipes').whereIn('name', recipes().map(r => r.name)).delete();
    // The pieces stay, as players may hold them.
}
