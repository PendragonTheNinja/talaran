import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Antura's three rare weapons (docs/antura-plan.md §10; names Nathan's,
// 2026-11-17). As Taiar's three (20261012140000): one of each damage type, in
// the forms Taiar did not use, never of the dropper's weakness, as strong as
// the next tier's smithed weapon of its form (tier 3, weaponAim and
// weaponPower in lib/combatMath.ts, which give the Serph Scimitar's 138 and 46
// at tier 2), gated at the creature's level, 2,000 sure uses then 0.2%.
//
//   Eagle Talons       dual pierce, from the Sea Eagle (weak to slash), 1 in 1,250
//   Reaver's Dane Axe  two-hand slash, from the Reaver (weak to crush), 1 in 1,250
//   Dripstone Cudgel   one-hand crush, from the Cave Bear (weak to slash), 1 in 1,000
//
// Rates per kill at the spot, as Taiar's (§10): Vergehorns is chosen; the bear
// is 70 in 100 at Yondereach. Each carries the bad-luck trail at twice its
// odds (20261112180000). Only the pawnbroker buys them (services/marketplace.ts).

const RARE = [
    { name: 'Eagle Talons', level_required: 19, weapon_form: 'dual', damage_type: 'pierce', aim: 185, power: 61, creature: 'sea_eagle', one_in: 1250,
      description: "A pair of sea eagle's talons, each bound to a grip of wrapped leather, hooked and black and sharp as the day they were torn loose." },
    { name: "Reaver's Dane Axe", level_required: 20, weapon_form: 'twohand', damage_type: 'slash', aim: 175, power: 103, creature: 'reaver', one_in: 1250,
      description: 'A long-hafted axe with a broad, thin crescent of a blade, nicked along the edge. Sea raiders carried these ashore, and swung them two-handed.' },
    { name: 'Dripstone Cudgel', level_required: 22, weapon_form: 'onehand', damage_type: 'crush', aim: 165, power: 60, creature: 'cave_bear', one_in: 1000,
      description: "A club of cave stone from a bear's den, grown slowly from the drip of water over a thousand winters, and broken off at the right length." },
];

const BAD_LUCK_MULTIPLE = 2;

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    for (const w of RARE) {
        const row = {
            name: w.name, type: 'weapon', subtype: 'rare_weapon', slot: 'mainhand', tier: 2, level_required: w.level_required,
            weapon_form: w.weapon_form, damage_type: w.damage_type, aim: w.aim, power: w.power,
            durability_uses: 2000, durability_break_pct: 0.2, description: w.description, is_active: true,
        };
        const had = await knex('items').where({ name: w.name }).first('id');
        let itemId: number;
        if (had) { await knex('items').where({ id: had.id }).update(row); itemId = had.id; }
        else { const [ins] = await knex('items').insert(row).returning('id'); itemId = typeof ins === 'object' ? ins.id : ins; }

        if (!(await knex('creatures').where({ key: w.creature }).first('id'))) {
            throw new Error(`antura_rare_weapons: creature "${w.creature}" not found (run 20261120200000 first)`);
        }
        const source_key = `combat:${w.creature}`;
        const drop = { source_key, item_id: itemId, chance_one_in: w.one_in, chance_percent: null, min_qty: 1, max_qty: 1,
            bad_luck_kills: w.one_in * BAD_LUCK_MULTIPLE, is_active: true };
        const hadDrop = await knex('drop_table_entries').where({ source_key, item_id: itemId }).first('id');
        if (hadDrop) await knex('drop_table_entries').where({ id: hadDrop.id }).update(drop);
        else await knex('drop_table_entries').insert(drop);
    }
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    const items = await knex('items').whereIn('name', RARE.map(w => w.name)).pluck('id');
    await knex('drop_table_entries').whereIn('item_id', items).whereIn('source_key', RARE.map(w => `combat:${w.creature}`)).delete();
    // The weapons stay, as players may hold them.
}
