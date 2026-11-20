import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Antura's creatures (docs/antura-plan.md §10), part one: the roster, where it
// fights, and its drops (frequent drops settled by Nathan 2026-11-17, the rest
// from the same day's drop pass). The crafted gear made from them and the
// three rare weapons follow in their own migrations.
//
//   Where      Mettlefell (one), Farvick Narrows (two, chosen), Vergehorns
//              (three, chosen), Yondereach (two, drawn: the bear 70 in 100,
//              the Bolter 30, settled 2026-11-17).
//   Profiles   from each creature's character (§10), checked in combatSim.ts
//              roster against the ±15% XP-an-hour guardrail (2026-11-20, a
//              level-matched one-hander on its weakness): Wolverine 108%,
//              Kelpie 103, Shellycoat 90, Sea Eagle 103, Reaver 93,
//              Snallygaster 96, Cave Bear 89, Bolter 92. The bear and the
//              Bolter cost the most health an hour, the Shellycoat the least.
//   XP a kill  xpPerKillAt(level) (combat:derive), as every creature's is.
//   Drops      one frequent drop each, about one kill in four to six, of the
//              creature's own; no meat (CLAUDE.md §2 Combat). Trophies at the
//              plan's rates; the Bolter opens Serph veins as the Knocker opens
//              Burgh. Bad luck protection is for rare weapons only.

const C = (o: Record<string, unknown>) => o;
const CREATURES = [
    C({ key: 'wolverine', name: 'Wolverine', level: 13, accuracy: 1.15, defence: null, power: 1.1, hp: 0.9, swing_seconds: 2.4,
        stance_pierce: 'neutral', stance_slash: 'weak', stance_crush: 'resistant', xp_per_kill: 34,
        description: 'A low, heavy, brown animal with a pale stripe down each flank and claws like hooks. Quick, fierce, and afraid of nothing its own size or any other.',
        lore: 'The charcoal burners of Mettlefell leave their stores locked. A wolverine will eat through a door to get at a sack of nothing it can eat.' }),
    C({ key: 'kelpie', name: 'Kelpie', level: 15, accuracy: 1.15, defence: 0.95, power: 0.95, hp: null, swing_seconds: 2.4,
        stance_pierce: 'weak', stance_slash: 'neutral', stance_crush: 'resistant', xp_per_kill: 37,
        coin_chance_one_in: 4, coin_min: 4, coin_max: 16,
        description: 'A black horse standing in the shallows, water running off its mane, weed in its tail. It looks gentle. It wants you to climb on.',
        lore: 'Those who climb on are ridden into the strait and not seen again. Their purses wash up. Their owners do not.' }),
    C({ key: 'shellycoat', name: 'Shellycoat', level: 17, accuracy: 0.9, defence: 1.15, power: null, hp: 1.0, swing_seconds: 3.6,
        stance_pierce: 'neutral', stance_slash: 'resistant', stance_crush: 'weak', xp_per_kill: 40,
        description: 'A thin gray river spirit hung all over with shells that clatter when it moves, so you hear it before you see it.',
        lore: 'It calls in a drowning voice to bring people down to the water, then laughs when they come. The fishermen of the Narrows carry it a share of the catch to keep it quiet.' }),
    C({ key: 'sea_eagle', name: 'Sea Eagle', level: 19, accuracy: 1.15, defence: 1.2, power: 0.85, hp: 0.8, swing_seconds: 2.4,
        stance_pierce: 'neutral', stance_slash: 'weak', stance_crush: 'resistant', xp_per_kill: 44,
        description: 'A huge eagle with a white tail and a hooked yellow beak, wings wide as a door, stooping out of the sky.',
        lore: 'It takes lambs off the headlands and gulls out of the air. It has been known to take a hat.' }),
    C({ key: 'reaver', name: 'Reaver', level: 20, accuracy: 0.95, defence: 1.1, power: 1.15, hp: 1.0, swing_seconds: 3.6,
        stance_pierce: 'neutral', stance_slash: 'resistant', stance_crush: 'weak', xp_per_kill: 46,
        coin_chance_one_in: 4, coin_min: 6, coin_max: 24,
        description: 'A sea raider in a mail shirt and a rusted helm, a Dane axe on his shoulder and a sack of somebody else\'s harvest at his belt.',
        lore: 'They come round the Vergehorns in long boats at the end of summer, when the barns of Farefield are full.' }),
    C({ key: 'snallygaster', name: 'Snallygaster', level: 21, accuracy: 1.05, defence: 1.0, power: 1.1, hp: 1.05, swing_seconds: null,
        stance_pierce: 'weak', stance_slash: 'neutral', stance_crush: 'resistant', xp_per_kill: 48,
        description: 'A winged, scaled beast of the headlands, part bird and part dragon, with one great eye in the middle of its brow and a beak full of teeth.',
        lore: 'The lord of the Vergehorns. It sheds its scales on the rocks like a snake sheds skin, and the armorers of Antura pay well for them.' }),
    C({ key: 'cave_bear', name: 'Cave Bear', level: 22, accuracy: 0.9, defence: null, power: 1.35, hp: 1.15, swing_seconds: 3.6,
        stance_pierce: 'resistant', stance_slash: 'weak', stance_crush: 'neutral', xp_per_kill: 51,
        description: 'An enormous bear of the high caves, bigger than any bear alive elsewhere, slow, shaggy, and impossible to stop once it gets going.',
        lore: 'Bears like it were gone from every other island before anyone came to them. The caves of Yondereach kept a few, and they have not forgiven anyone for it.' }),
    C({ key: 'slide_rock_bolter', name: 'Slide-rock Bolter', level: 24, accuracy: 0.85, defence: 1.05, power: 1.45, hp: 1.05, swing_seconds: 3.6,
        stance_pierce: 'resistant', stance_slash: 'neutral', stance_crush: 'weak', xp_per_kill: 55,
        vein_chance_one_in: 150, vein_ore_name: 'Serph Ore', vein_min: 15, vein_max: 30,
        description: 'A creature of the mountain slopes the size of a barn, with a little head and a huge mouth and a tail that hooks over the ridge to hold it, until it lets go and comes down the slide.',
        lore: 'It lies along the high passes looking like a fall of scree. Travelers walk right up to it. It is the last thing a good many of them do.' }),
];

const SPOTS = [
    { key: 'mettlefell_burners', place: 'Mettlefell', name: "The Burners' Yard", kind: 'chosen', display_order: 1,
      description: 'Charcoal stacks smoking at the edge of the trees, and the sheds the burners keep locked. Something has clawed at every door.',
      creatures: [['wolverine', 1]] },
    { key: 'farvick_shallows', place: 'Farvick Narrows', name: 'The Haunted Shallows', kind: 'chosen', display_order: 1,
      description: 'Slack water between the shoals, where a horse stands up to its knees and something on the shingle rattles like shells.',
      creatures: [['kelpie', 1], ['shellycoat', 1]] },
    { key: 'vergehorns_heights', place: 'Vergehorns', name: 'The Horns', kind: 'chosen', display_order: 1,
      description: 'Two headlands of bare rock in the wind, the raiders\' boats drawn up in the cove below and the eyries above.',
      creatures: [['sea_eagle', 1], ['reaver', 1], ['snallygaster', 1]] },
    { key: 'yondereach_passes', place: 'Yondereach', name: 'The High Passes', kind: 'drawn', display_order: 1,
      description: 'A road of scree and broken stone below the caves, where the slopes have a way of coming down on people.',
      creatures: [['cave_bear', 70], ['slide_rock_bolter', 30]] },
];

const ITEMS = [
    { name: 'Wolverine Pelt', subtype: 'hide', description: 'A coarse dark-brown pelt with a pale band along each side. Frost will not stick to it.' },
    { name: 'Cave Bear Pelt', subtype: 'hide', description: 'A huge shaggy pelt, brown going gray at the tips, heavy enough to bow your back. It smells of the den.' },
    { name: 'Snallyscale', subtype: 'scale', description: 'A scale off a snallygaster, dull green-black and hard as horn, with a ridge down the middle. They are shed, not plucked, and a good thing too.' },
    { name: "Kelpie's Bridle", subtype: 'trophy', description: 'A bridle of rotten leather and green weed, dripping still. Whoever held it was ridden into the sea.' },
    { name: "Snallygaster's Eye", subtype: 'trophy', description: 'The great single eye of a snallygaster, dried hard and yellow as old amber. It still seems to follow you round the room.' },
    { name: 'Cave Bear Skull', subtype: 'trophy', description: 'A bear\'s skull the size of a bucket, the teeth worn down to stumps. It lay in the den for longer than anyone has lived on Antura.' },
    { name: "Bolter's Heartstone", subtype: 'trophy', description: 'A smooth, heavy stone, warm in the hand, found at the heart of a slide-rock bolter. It is the only part of the beast that was not trying to flatten you.' },
];

// [creature key, item, 1 in, min, max]
const DROPS: Array<[string, string, number, number, number]> = [
    ['wolverine', 'Wolverine Pelt', 6, 1, 1],
    ['wolverine', 'Charc', 8, 1, 2],
    ['kelpie', 'Linen Cloth', 60, 1, 1],
    ['kelpie', "Kelpie's Bridle", 600, 1, 1],
    ['shellycoat', 'Mackerel', 8, 1, 1],
    ['shellycoat', 'Pollock', 10, 1, 1],
    ['shellycoat', 'Sea Bass', 12, 1, 1],
    ['shellycoat', 'River Mussel', 15, 1, 1],
    ['shellycoat', 'Amber', 100, 1, 1],
    ['shellycoat', 'Freshwater Pearl', 200, 1, 1],
    ['sea_eagle', 'Feathers', 4, 1, 2],
    ['reaver', 'Barley', 10, 1, 3],
    ['reaver', 'Broad Beans', 15, 1, 1],
    ['reaver', 'Locked Rusty Chest', 30, 1, 1],
    ['reaver', 'Rough Garnet', 250, 1, 1],
    ['snallygaster', 'Snallyscale', 4, 1, 1],
    ['snallygaster', "Snallygaster's Eye", 750, 1, 1],
    ['cave_bear', 'Cave Bear Pelt', 6, 1, 1],
    ['cave_bear', 'Cave Bear Skull', 750, 1, 1],
    ['slide_rock_bolter', 'Granite', 4, 2, 3],
    ['slide_rock_bolter', 'Granite Block', 40, 1, 1],
    ['slide_rock_bolter', 'Rough Garnet', 60, 1, 1],
    ['slide_rock_bolter', 'Rough Quartz', 120, 1, 1],
    ['slide_rock_bolter', 'Rough Amethyst', 300, 1, 1],
    ['slide_rock_bolter', "Bolter's Heartstone", 250, 1, 1],
];

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;

    for (const it of ITEMS) {
        const row = { name: it.name, type: 'material', subtype: it.subtype, tier: 2, level_required: 1, description: it.description, is_active: true };
        const had = await knex('items').where({ name: it.name }).first('id');
        if (had) await knex('items').where({ id: had.id }).update(row);
        else await knex('items').insert(row);
    }

    const ids = new Map<string, number>();
    for (const c of CREATURES) {
        const row = { coin_chance_one_in: null, coin_min: null, coin_max: null, vein_chance_one_in: null, vein_ore_name: null, vein_min: null, vein_max: null,
            xp_multiplier: 1, hesitate_pct: null, ...c, is_active: true };
        const had = await knex('creatures').where({ key: c.key }).first('id');
        if (had) { await knex('creatures').where({ id: had.id }).update(row); ids.set(String(c.key), had.id); }
        else { const [ins] = await knex('creatures').insert(row).returning('id'); ids.set(String(c.key), typeof ins === 'object' ? ins.id : ins); }
    }
    if (!(await knex('items').where({ name: 'Serph Ore' }).first('id'))) throw new Error('antura_creatures: item "Serph Ore" not found');

    for (const [key, itemName, oneIn, min, max] of DROPS) {
        const item = await knex('items').where({ name: itemName }).first('id');
        if (!item) throw new Error(`antura_creatures: item "${itemName}" not found`);
        const source_key = `combat:${key}`;
        const drop = { source_key, item_id: item.id, chance_one_in: oneIn, chance_percent: null, min_qty: min, max_qty: max, is_active: true };
        const had = await knex('drop_table_entries').where({ source_key, item_id: item.id }).first('id');
        if (had) await knex('drop_table_entries').where({ id: had.id }).update(drop);
        else await knex('drop_table_entries').insert(drop);
    }

    for (const s of SPOTS) {
        const place = await knex('locations').where({ name: s.place }).first('id');
        if (!place) throw new Error(`antura_creatures: no location named ${s.place} (run 20261119130000 first)`);
        const row = { key: s.key, location_id: place.id, name: s.name, kind: s.kind, description: s.description, display_order: s.display_order, is_active: true };
        const had = await knex('fighting_spots').where({ key: s.key }).first('id');
        let spotId: number;
        if (had) { await knex('fighting_spots').where({ id: had.id }).update(row); spotId = had.id; }
        else { const [ins] = await knex('fighting_spots').insert(row).returning('id'); spotId = typeof ins === 'object' ? ins.id : ins; }
        await knex('fighting_spot_creatures').where({ spot_id: spotId }).delete();
        for (const [key, weight] of s.creatures as Array<[string, number]>) {
            await knex('fighting_spot_creatures').insert({ spot_id: spotId, creature_id: ids.get(key)!, weight });
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    const spots = await knex('fighting_spots').whereIn('key', SPOTS.map(s => s.key)).pluck('id');
    await knex('fighting_spot_creatures').whereIn('spot_id', spots).delete();
    await knex('fighting_spots').whereIn('id', spots).delete();
    await knex('drop_table_entries').whereIn('source_key', CREATURES.map(c => `combat:${c.key}`)).delete();
    // Creatures go inactive, not deleted: kills and Bestiary rows point at them.
    await knex('creatures').whereIn('key', CREATURES.map(c => String(c.key))).update({ is_active: false });
}
