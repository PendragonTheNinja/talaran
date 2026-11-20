import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The Cog (docs/sailing-spec.md, the ladder and the materials; Nathan,
// 2026-11-15): the tier 2 boat, built at Carpentry 19 and sailed at Wayfaring
// 13, on the slips at Talador and Wendhaven, in the same pieces-and-rolls build
// as the Skiff (services/boats.ts). Only the Cog has a sail.
//
//   Speed   0.8 at the start and 0.55 at the floor, closed by Wayfaring as a
//           mount's are (legSeconds in services/voyages.ts): the crossing is
//           298 s at Wayfaring 13, the spec's "about 5 minutes" (the Skiff
//           369 s), and an islet leg 128 s. Wayfaring XP per real second stays
//           under walking's at every level (0.64 against 0.83 at 13, 0.81
//           against 2.33 at 100).
//   Waters  an island's islets want a boat of its tier (putToSea): the Cog
//           sails Antura's, and Taiar's faster.

const COG = {
    key: 'cog', name: 'Cog', tier: 2, build_level: 19, sail_level: 13, speed_start: 0.8, speed_floor: 0.55,
    description: 'A broad, deep-bellied boat of Lanai planks on Serph nails, with one square sail of linen. Slow to turn and hard to sink.',
    pieces: [
        { key: 'keel', name: 'Keel and ribs', materials: [{ item: 'Lanai Planks', qty: 150 }, { item: 'Serph Nails', qty: 300 }] },
        { key: 'planking', name: 'Planking', materials: [{ item: 'Lanai Planks', qty: 300 }, { item: 'Serph Nails', qty: 650 }] },
        { key: 'deck', name: 'Deck', materials: [{ item: 'Lanai Planks', qty: 110 }, { item: 'Serph Nails', qty: 200 }] },
        { key: 'mast', name: 'Mast and yard', materials: [{ item: 'Lanai Planks', qty: 40 }, { item: 'Serph Nails', qty: 50 }] },
        { key: 'rigging', name: 'Rigging', materials: [{ item: 'Nettle Cordage', qty: 60 }] },
        { key: 'sail', name: 'Sail', materials: [{ item: 'Linen Cloth', qty: 20 }] },
    ],
};

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    for (const piece of COG.pieces) {
        for (const m of piece.materials) {
            if (!(await knex('items').where({ name: m.item }).first('id'))) throw new Error(`cog: item "${m.item}" not found`);
        }
    }
    const row = { ...COG, pieces: JSON.stringify(COG.pieces), is_active: true };
    const had = await knex('vessel_types').where({ key: COG.key }).first('id');
    if (had) await knex('vessel_types').where({ id: had.id }).update(row);
    else await knex('vessel_types').insert(row);
    for (const port of ['Talador', 'Wendhaven']) {
        const slip = await knex('locations').where({ name: port }).first('has_slip');
        if (!slip?.has_slip) throw new Error(`cog: ${port} has no slip`);
    }
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    // Switched off, not deleted: hulls and owned boats point at it.
    await knex('vessel_types').where({ key: COG.key }).update({ is_active: false });
}
