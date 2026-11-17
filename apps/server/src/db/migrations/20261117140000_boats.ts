import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Boats, step 1 (docs/sailing-spec.md §5 and §10; Nathan, 2026-11-15 and 16):
// building one. Sailing it, the ferry, and the islets come after.
//
//   vessel_types            a boat is a row, never an item: tier, the Carpentry
//                           level to build it, the Wayfaring level to sail it,
//                           its speed (set when sailing ships), and the pieces
//                           it is raised from, in order, each a list of
//                           materials. A new boat is content, not code.
//   player_vessels          the boats a player owns, one of each type. Once
//                           built a boat is wherever its owner stands in a port.
//   vessel_builds           a hull on a slip: whose, what, where, and which
//                           piece is going up. One per player per type.
//   vessel_build_progress   what the current piece has had set into it.
//   locations.has_slip      where a hull can be laid. Talador now, Wendhaven
//                           when Antura is built.
//   Nettle Cordage          the Skiff's lines: Stinging Nettle twisted two to a
//                           cord, by Crafting. Level 5 and 30 s are proposed.
//   The Skiff               tier 1, Carpentry 10, Wayfaring 1; 250 Lanai
//                           Planks, 500 Ambren Nails, and 30 Nettle Cordage
//                           in four pieces (agreed 2026-11-15).
//   action_presentation     the scene line and Stop button for 'vessel_build'.
//
// Building: 'vessel_build' in services/boats.ts, 1 to 5 materials a 20-second
// turn (lib/buildRoll.ts), Carpentry at the boat's tier band.

const SKIFF = {
    key: 'skiff', name: 'Skiff', tier: 1, build_level: 10, sail_level: 1,
    description: 'An open rowing boat of lapped Lanai planks, long enough for two and light enough to drag up a beach. It goes where the ferry does not.',
    pieces: [
        { key: 'keel', name: 'Keel and ribs', materials: [{ item: 'Lanai Planks', qty: 80 }, { item: 'Ambren Nails', qty: 160 }] },
        { key: 'planking', name: 'Planking', materials: [{ item: 'Lanai Planks', qty: 140 }, { item: 'Ambren Nails', qty: 300 }] },
        { key: 'thwarts', name: 'Thwarts and oars', materials: [{ item: 'Lanai Planks', qty: 30 }, { item: 'Ambren Nails', qty: 40 }] },
        { key: 'lines', name: 'Lines', materials: [{ item: 'Nettle Cordage', qty: 30 }] },
    ],
};

const CORDAGE = {
    name: 'Nettle Cordage', type: 'material', subtype: 'fiber', tier: 1, level_required: 1,
    description: 'Nettle stems retted, stripped, and twisted into a hard brown cord. It does not rot in salt water, which is the whole point of it.',
};

const CORDAGE_RECIPE = {
    name: 'Twist Nettle Cordage', skill: 'Crafting', output_item_name: CORDAGE.name, output_qty: 1,
    inputs: JSON.stringify([{ itemName: 'Stinging Nettle', qty: 2 }]),
    required_level: 5, timer_seconds: 30, xp: 22, station: null, required_tools: null, for_skill: 'Carpentry',
    flavor_text: 'You strip the fibre from the stems and twist two strands against each other into a cord.',
};

const PRESENTATION = {
    action_type: 'vessel_build', kind: null,
    scene_text: 'You work on the hull on the slip, fitting each piece as it goes up.',
    cancel_label: 'Stop Building',
};

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('vessel_types'))) {
        await knex.schema.createTable('vessel_types', (t) => {
            t.increments('id').primary();
            t.string('key', 50).notNullable().unique();
            t.string('name', 100).notNullable().unique();
            t.integer('tier').notNullable().defaultTo(1);
            t.integer('build_level').notNullable().defaultTo(1);   // Carpentry
            t.integer('sail_level').notNullable().defaultTo(1);    // Wayfaring
            t.decimal('speed_start', 6, 3).nullable();             // as a mount's, set when sailing ships
            t.decimal('speed_floor', 6, 3).nullable();
            t.jsonb('pieces').notNullable().defaultTo('[]');
            t.text('description').nullable();
            t.boolean('is_active').notNullable().defaultTo(true);
            t.timestamps(true, true);
        });
    }
    if (!(await knex.schema.hasTable('player_vessels'))) {
        await knex.schema.createTable('player_vessels', (t) => {
            t.increments('id').primary();
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.integer('vessel_type_id').notNullable().references('id').inTable('vessel_types');
            t.timestamp('built_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.unique(['player_id', 'vessel_type_id']);
        });
    }
    if (!(await knex.schema.hasTable('vessel_builds'))) {
        await knex.schema.createTable('vessel_builds', (t) => {
            t.increments('id').primary();
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.integer('vessel_type_id').notNullable().references('id').inTable('vessel_types');
            t.integer('location_id').notNullable().references('id').inTable('locations');
            t.integer('piece_index').notNullable().defaultTo(0);
            t.timestamp('started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.unique(['player_id', 'vessel_type_id']);
        });
    }
    if (!(await knex.schema.hasTable('vessel_build_progress'))) {
        await knex.schema.createTable('vessel_build_progress', (t) => {
            t.integer('build_id').notNullable().references('id').inTable('vessel_builds').onDelete('CASCADE');
            t.integer('item_id').notNullable().references('id').inTable('items');
            t.integer('delivered').notNullable().defaultTo(0);
            t.primary(['build_id', 'item_id']);
        });
        await knex.raw('ALTER TABLE vessel_build_progress ADD CONSTRAINT vessel_build_progress_nonnegative CHECK (delivered >= 0)');
    }
    if (!(await knex.schema.hasColumn('locations', 'has_slip'))) {
        await knex.schema.alterTable('locations', (t) => { t.boolean('has_slip').notNullable().defaultTo(false); });
    }

    if (!(await hasContent(knex))) return;

    for (const name of ['Stinging Nettle', 'Lanai Planks', 'Ambren Nails']) {
        if (!(await knex('items').where({ name }).first('id'))) throw new Error(`boats: item "${name}" not found`);
    }
    const cordage = await knex('items').where({ name: CORDAGE.name }).first('id');
    if (cordage) await knex('items').where({ id: cordage.id }).update(CORDAGE);
    else await knex('items').insert({ ...CORDAGE, is_active: true });

    const recipe = await knex('recipes').where({ name: CORDAGE_RECIPE.name }).first('id');
    if (recipe) await knex('recipes').where({ id: recipe.id }).update(CORDAGE_RECIPE);
    else await knex('recipes').insert({ ...CORDAGE_RECIPE, mode: 'active', is_active: true });

    const row = { ...SKIFF, pieces: JSON.stringify(SKIFF.pieces) };
    const skiff = await knex('vessel_types').where({ key: SKIFF.key }).first('id');
    if (skiff) await knex('vessel_types').where({ id: skiff.id }).update({ ...row, updated_at: knex.fn.now() });
    else await knex('vessel_types').insert(row);

    const talador = await knex('locations').where({ name: 'Talador' }).update({ has_slip: true });
    if (talador !== 1) throw new Error('boats: location "Talador" not found');

    const shown = await knex('action_presentation').where({ action_type: PRESENTATION.action_type }).whereNull('kind').first('id');
    if (shown) await knex('action_presentation').where({ id: shown.id }).update(PRESENTATION);
    else await knex('action_presentation').insert(PRESENTATION);
}

export async function down(knex: Knex): Promise<void> {
    if (await hasContent(knex)) {
        await knex('action_presentation').where({ action_type: PRESENTATION.action_type }).delete();
        await knex('recipes').where({ name: CORDAGE_RECIPE.name }).delete();
        // The Nettle Cordage item stays, as items do: players may hold it.
    }
    await knex('player_actions').where({ action_type: 'vessel_build' }).delete();
    if (await knex.schema.hasColumn('locations', 'has_slip')) await knex.schema.alterTable('locations', (t) => { t.dropColumn('has_slip'); });
    await knex.schema.dropTableIfExists('vessel_build_progress');
    await knex.schema.dropTableIfExists('vessel_builds');
    await knex.schema.dropTableIfExists('player_vessels');
    await knex.schema.dropTableIfExists('vessel_types');
}
