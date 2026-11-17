import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The islet guardians (docs/islets-plan.md §6f; Nathan, 2026-11-17). Each
// guards a drowned crew's chest: one fight, a small boss, its drop a Locked
// Sea Chest, always, and now and then its own keepsake.
//
//   fighting_spots.kind 'guardian'  a spot that shows and opens only for a
//                                   player whose landing found its cache, and
//                                   ends after one kill (services/combatFights.ts).
//   creatures.hesitate_pct          the chance a strike never comes: the
//                                   Siren's song (lib/combatFight.ts settle).
//   'cache'                         an islet find, by islet (docs/islets-plan.md §4).
//
// Profiles simulated 2026-11-17 against a one-hand fighter at the guardian's
// level (combatSim.ts kits, with its weakness): the Trow 133 s and 33% of
// health, the Siren 92 s and 49%, the Draugr 148 s and 54%. XP per kill is the
// level's (combat:derive) times the multiplier, the fight's length over a
// normal kill's, so XP an hour stays on the band. The keepsake drops from the
// guardian itself, since every Taiar guardian's chest is the same Sea Chest.

const CREATURES = [
    {
        key: 'trow', name: 'Trow', level: 9, accuracy: 0.9, defence: 1.25, power: 0.9, hp: 3.0, swing_seconds: 3.6,
        stance_pierce: 'neutral', stance_slash: 'resistant', stance_crush: 'weak', xp_multiplier: 3, xp_per_kill: 105, hesitate_pct: null,
        description: 'Squat, grey, and lumpy as the rocks it sits among, with long arms and a short temper. It does not like anyone touching its things.',
        lore: 'Trows come up out of the rocks at dusk to take what boats leave on the shingle. They never give any of it back.',
        keepsake: "Trow's Thimble",
        islets: ['The Rocky Islet', 'The Drowned Quarry'],
        spot: { name: "The Trow's Hoard", description: 'A cleft in the rock heaped with other people\'s things, and something squatting on top of the heap.' },
        lines: [
            'In a cleft above the waterline, a heap of other people\'s things: oars, net floats, a sea chest. Something lumpy and grey is sitting on it.',
            'You hear it before you see it: a grumbling, like stones turning over. The Trow is counting its hoard, and the chest on top is not its own.',
        ],
    },
    {
        key: 'siren', name: 'Siren', level: 10, accuracy: 1.25, defence: 0.9, power: 1.0, hp: 2.5, swing_seconds: 2.4,
        stance_pierce: 'weak', stance_slash: 'neutral', stance_crush: 'resistant', xp_multiplier: 2, xp_per_kill: 74, hesitate_pct: 15,
        description: 'She sits on the rocks with her hair over her shoulders and sings. The song is lovely. The rocks are covered in wrecked boats.',
        lore: 'Sailors stop their ears with wax to row past her rock. The ones who do not are under it.',
        keepsake: "Siren's Comb",
        islets: ['The Sea Stack', 'The Reef'],
        spot: { name: "The Siren's Rock", description: 'A flat rock above the breaking water, with a chest wedged in a crack behind it and someone singing.' },
        lines: [
            'Someone is singing on the rocks. You find yourself walking toward it before you have decided to, and stop just short of the edge. There is a chest behind her.',
            'The song comes across the water like a hand on your arm. On the rock below it sits a sea chest, and the singer is guarding it.',
        ],
    },
    {
        key: 'draugr', name: 'Draugr', level: 12, accuracy: 1.0, defence: 1.05, power: 1.2, hp: 3.5, swing_seconds: 3.6,
        stance_pierce: 'resistant', stance_slash: 'weak', stance_crush: 'neutral', xp_multiplier: 3, xp_per_kill: 120, hesitate_pct: null,
        description: 'A drowned sailor who never stopped standing his watch. Weed in his beard, salt on his coat, and his cargo still under his feet.',
        lore: 'The ship went down off the ruin with all hands. One of them is still there, and still on duty.',
        keepsake: "Drowned Captain's Seal",
        islets: ['The Ruin'],
        spot: { name: 'The Drowned Watch', description: 'Inside the ruined doorway a figure stands guard over a sea chest, dripping, as if it had walked up out of the sea this morning.' },
        lines: [
            'Inside the doorway a man is standing guard over a sea chest. Water runs out of his sleeves. He has been dead a long time, and he has not noticed.',
            'Wet footprints lead up from the water to the ruin and stop at a sea chest. The one who made them turns round as you come in.',
        ],
    },
];

// Islet name -> the cache's weight there (docs/islets-plan.md §4: 10 on the
// common islets, 20 on the seldom ones and the ruin).
const CACHE_WEIGHTS: Record<string, number> = {
    'The Rocky Islet': 10, 'The Reef': 10, 'The Sea Stack': 20, 'The Drowned Quarry': 20, 'The Ruin': 20,
};

const ISLAND = 'Taiar Island';

export async function up(knex: Knex): Promise<void> {
    await knex.raw('ALTER TABLE fighting_spots DROP CONSTRAINT IF EXISTS fighting_spots_kind_valid');
    await knex.raw("ALTER TABLE fighting_spots ADD CONSTRAINT fighting_spots_kind_valid CHECK (kind IN ('drawn', 'chosen', 'guardian'))");
    if (!(await knex.schema.hasColumn('creatures', 'hesitate_pct'))) {
        await knex.schema.alterTable('creatures', (t) => { t.decimal('hesitate_pct', 5, 2).nullable(); });
    }
    await knex('islet_find_kinds').insert({ key: 'cache', skill: null, amount_min: 1, amount_max: 1, boost: 1, is_active: true })
        .onConflict('key').merge();

    if (!(await hasContent(knex))) return;

    const chest = await knex('items').where({ name: 'Locked Sea Chest' }).first('id');
    if (!chest) throw new Error('islet_guardians: item "Locked Sea Chest" not found (run 20261117170000 first)');

    for (const g of CREATURES) {
        const row = {
            key: g.key, name: g.name, level: g.level, accuracy: g.accuracy, defence: g.defence, power: g.power, hp: g.hp,
            swing_seconds: g.swing_seconds, stance_pierce: g.stance_pierce, stance_slash: g.stance_slash, stance_crush: g.stance_crush,
            xp_multiplier: g.xp_multiplier, xp_per_kill: g.xp_per_kill, hesitate_pct: g.hesitate_pct,
            description: g.description, lore: g.lore, is_active: true,
        };
        const existing = await knex('creatures').where({ key: g.key }).first('id');
        let creatureId: number;
        if (existing) {
            await knex('creatures').where({ id: existing.id }).update(row);
            creatureId = existing.id;
        } else {
            const [ins] = await knex('creatures').insert(row).returning('id');
            creatureId = typeof ins === 'object' ? ins.id : ins;
        }

        const keepsake = await knex('items').where({ name: g.keepsake }).first('id');
        if (!keepsake) throw new Error(`islet_guardians: item "${g.keepsake}" not found`);
        for (const [itemId, oneIn] of [[chest.id, 1], [keepsake.id, 20]] as [number, number][]) {
            const source_key = `combat:${g.key}`;
            const drop = { source_key, item_id: itemId, chance_one_in: oneIn, chance_percent: null, min_qty: 1, max_qty: 1, is_active: true };
            const had = await knex('drop_table_entries').where({ source_key, item_id: itemId }).first('id');
            if (had) await knex('drop_table_entries').where({ id: had.id }).update(drop);
            else await knex('drop_table_entries').insert(drop);
        }

        for (const isletName of g.islets) {
            const islet = await knex('locations').where({ name: isletName }).whereNotNull('islet_kind').first('id');
            if (!islet) throw new Error(`islet_guardians: islet "${isletName}" not found`);
            const key = `${g.key}_${isletName.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '')}`;
            const spotRow = { key, location_id: islet.id, name: g.spot.name, kind: 'guardian', description: g.spot.description, display_order: 0, is_active: true };
            const hadSpot = await knex('fighting_spots').where({ key }).first('id');
            let spotId: number;
            if (hadSpot) {
                await knex('fighting_spots').where({ id: hadSpot.id }).update(spotRow);
                spotId = hadSpot.id;
            } else {
                const [ins] = await knex('fighting_spots').insert(spotRow).returning('id');
                spotId = typeof ins === 'object' ? ins.id : ins;
            }
            await knex('fighting_spot_creatures').where({ spot_id: spotId }).delete();
            await knex('fighting_spot_creatures').insert({ spot_id: spotId, creature_id: creatureId, weight: 1 });

            await knex('islet_finds').insert({ location_id: islet.id, kind: 'cache', weight: CACHE_WEIGHTS[isletName] ?? 10 })
                .onConflict(['location_id', 'kind']).merge();
            await knex('voyage_lines').where({ island: ISLAND, moment: 'find_cache', location_id: islet.id }).delete();
            await knex('voyage_lines').insert(g.lines.map(text => ({ island: ISLAND, moment: 'find_cache', location_id: islet.id, text })));
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await hasContent(knex)) {
        const keys = CREATURES.map(g => g.key);
        await knex('voyage_lines').where({ island: ISLAND, moment: 'find_cache' }).delete();
        await knex('islet_finds').where({ kind: 'cache' }).delete();
        const spots = await knex('fighting_spots').where({ kind: 'guardian' }).pluck('id');
        if (spots.length) {
            const fights = await knex('combat_fights').whereIn('spot_id', spots).pluck('action_id');
            if (fights.length) await knex('player_actions').whereIn('id', fights).delete();
            await knex('fighting_spot_creatures').whereIn('spot_id', spots).delete();
            await knex('fighting_spots').whereIn('id', spots).delete();
        }
        await knex('drop_table_entries').whereIn('source_key', keys.map(k => `combat:${k}`)).delete();
        // The creature rows go inactive rather than away: kill counts point at them.
        await knex('creatures').whereIn('key', keys).update({ is_active: false });
    }
    if (await knex.schema.hasTable('islet_find_kinds')) {
        await knex('player_islet_finds').where({ kind: 'cache' }).delete();
        await knex('islet_find_kinds').where({ key: 'cache' }).delete();
    }
    if (await knex.schema.hasColumn('creatures', 'hesitate_pct')) await knex.schema.alterTable('creatures', (t) => { t.dropColumn('hesitate_pct'); });
    await knex.raw('ALTER TABLE fighting_spots DROP CONSTRAINT IF EXISTS fighting_spots_kind_valid');
    await knex.raw("ALTER TABLE fighting_spots ADD CONSTRAINT fighting_spots_kind_valid CHECK (kind IN ('drawn', 'chosen'))");
}
