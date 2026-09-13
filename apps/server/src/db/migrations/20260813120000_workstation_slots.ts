import type { Knex } from 'knex';

/**
 * Workstation slots — increment 1 of the workstation rework.
 *
 * PURELY ADDITIVE. Nothing reads these tables yet and no existing behaviour
 * changes, so live smithing and carpentry keep working off the old has_*
 * booleans until the cutover migration retires them.
 *
 * Replaces hardcoded has_anvil/has_hammer/has_tongs/has_bucket with generic
 * slots, so a station type can declare any number of slots without a schema
 * change. The apiary is a workstation whose slots hold flowers, not tools.
 *
 * recipes.required_tools names the slots a recipe needs. An empty array means
 * no tools, which is what lets a campfire (a station with no slots) run the
 * plain raw-to-cooked recipes.
 *
 * CIRCULARITY (CLAUDE.md section 4): a tool recipe must never require its own
 * output. Ambren Anvil does not need an anvil; Lanai Sawhorse does not need a
 * sawhorse. Bootstrapping from nothing is covered by the NPC's forge, which is
 * a fully equipped station that runs slowly, handled in the service increment.
 */

type SlotDef = {
    station_type: string;
    slot: string;
    label: string;
    capacity: number;
    accepts_subtype: string | null;
    accepts_names: string | null; // JSON array, for when subtype is too broad
    is_required: boolean;         // needed for the station to function at all
    display_order: number;
};

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('workstation_slot_types', (t) => {
        t.increments('id').primary();
        t.string('station_type', 50).notNullable();
        t.string('slot', 50).notNullable();
        t.string('label', 60).notNullable();
        t.integer('capacity').notNullable().defaultTo(1);
        t.string('accepts_subtype', 50).nullable();
        t.text('accepts_names').nullable();
        t.boolean('is_required').notNullable().defaultTo(true);
        t.integer('display_order').notNullable().defaultTo(0);
        t.timestamps(true, true);
        t.unique(['station_type', 'slot']);
    });

    await knex.schema.createTable('workstation_slots', (t) => {
        t.increments('id').primary();
        t.integer('workstation_id').unsigned().notNullable()
            .references('id').inTable('workstations').onDelete('CASCADE');
        t.string('slot', 50).notNullable();
        t.integer('slot_index').notNullable().defaultTo(0); // 0 for single slots, 0..n for repeated
        t.string('item_name', 100).notNullable();
        t.timestamp('socketed_at').notNullable().defaultTo(knex.fn.now());
        t.unique(['workstation_id', 'slot', 'slot_index']);
        t.index(['workstation_id']);
    });

    await knex.schema.alterTable('recipes', (t) => {
        t.text('required_tools').nullable(); // JSON array of slot names
    });

    const names = (...n: string[]) => JSON.stringify(n);

    const defs: SlotDef[] = [
        // smithing
        { station_type: 'smithing', slot: 'anvil', label: 'Anvil', capacity: 1, accepts_subtype: 'anvil', accepts_names: null, is_required: true, display_order: 1 },
        { station_type: 'smithing', slot: 'hammer', label: 'Hammer', capacity: 1, accepts_subtype: null, accepts_names: names('Ambren Hammer'), is_required: true, display_order: 2 },
        { station_type: 'smithing', slot: 'tongs', label: 'Tongs', capacity: 1, accepts_subtype: null, accepts_names: names('Ambren Tongs'), is_required: true, display_order: 3 },

        // carpentry
        { station_type: 'carpentry', slot: 'sawhorse', label: 'Sawhorse', capacity: 1, accepts_subtype: null, accepts_names: names('Lanai Sawhorse'), is_required: true, display_order: 1 },
        { station_type: 'carpentry', slot: 'saw', label: 'Saw', capacity: 1, accepts_subtype: null, accepts_names: names('Ambren Saw'), is_required: true, display_order: 2 },
        { station_type: 'carpentry', slot: 'plane', label: 'Plane', capacity: 1, accepts_subtype: null, accepts_names: names('Ambren Plane'), is_required: false, display_order: 3 },

        // cooking (items land in the Cooking increment)
        { station_type: 'cooking', slot: 'hearth', label: 'Hearth', capacity: 1, accepts_subtype: null, accepts_names: names('Stone Hearth'), is_required: true, display_order: 1 },
        { station_type: 'cooking', slot: 'cauldron', label: 'Cauldron', capacity: 1, accepts_subtype: null, accepts_names: names('Ambren Cauldron'), is_required: false, display_order: 2 },
        { station_type: 'cooking', slot: 'skillet', label: 'Skillet', capacity: 1, accepts_subtype: null, accepts_names: names('Ambren Skillet'), is_required: false, display_order: 3 },
        { station_type: 'cooking', slot: 'cooking_knife', label: 'Cooking Knife', capacity: 1, accepts_subtype: null, accepts_names: names('Ambren Cooking Knife'), is_required: false, display_order: 4 },
        { station_type: 'cooking', slot: 'meat_cleaver', label: 'Meat Cleaver', capacity: 1, accepts_subtype: null, accepts_names: names('Ambren Meat Cleaver'), is_required: false, display_order: 5 },
        { station_type: 'cooking', slot: 'ladle', label: 'Ladle', capacity: 1, accepts_subtype: null, accepts_names: names('Ambren Ladle'), is_required: false, display_order: 6 },
        { station_type: 'cooking', slot: 'flesh_hook', label: 'Flesh Hook', capacity: 1, accepts_subtype: null, accepts_names: names('Ambren Flesh Hook'), is_required: false, display_order: 7 },
        { station_type: 'cooking', slot: 'mortar_pestle', label: 'Mortar and Pestle', capacity: 1, accepts_subtype: null, accepts_names: names('Stone Mortar and Pestle'), is_required: false, display_order: 8 },

        // apiary: ten flower slots, any flower
        { station_type: 'apiary', slot: 'flower', label: 'Flowers', capacity: 10, accepts_subtype: 'flower', accepts_names: null, is_required: false, display_order: 1 },
    ];

    await knex('workstation_slot_types').insert(defs);

    // Per-recipe tool requirements for everything that already exists.
    const tools = (...slots: string[]) => JSON.stringify(slots);

    const perRecipe: Array<[string, string]> = [
        // Smithing. The three station tools must not require themselves.
        ['Ambren Anvil', tools('hammer', 'tongs')],
        ['Ambren Hammer', tools('anvil', 'tongs')],
        ['Ambren Tongs', tools('anvil', 'hammer')],
        ['Ambren Pickaxe', tools('anvil', 'hammer', 'tongs')],
        ['Ambren Hatchet', tools('anvil', 'hammer', 'tongs')],
        ['Ambren Saw', tools('anvil', 'hammer', 'tongs')],
        ['Ambren Plane', tools('anvil', 'hammer', 'tongs')],

        // Carpentry. The sawhorse must not require a sawhorse.
        ['Lanai Sawhorse', tools('saw')],
        ['Split Arrow Shafts', tools('saw')],
        ['Lanai Tool Rod', tools('saw', 'sawhorse')],
        ['Lanai Staff', tools('saw', 'sawhorse', 'plane')],
        ['Lanai Mallet', tools('saw', 'sawhorse', 'plane')],
        ['Build Tanning Rack', tools('saw', 'sawhorse')],
        ['Build Tanning Barrel', tools('saw', 'sawhorse')],
        ['Raise a Bucket', tools('saw', 'sawhorse', 'plane')],
    ];

    for (const [name, required] of perRecipe) {
        await knex('recipes').where({ name }).update({ required_tools: required });
    }

    // Everything else needs no tools today: tanning recipes are passive and run
    // at a rack or barrel, and the station-less ones (Fletch Arrows, Mill Flour,
    // Churn Butter and the rest) are done by hand.
    await knex('recipes').whereNull('required_tools').update({ required_tools: '[]' });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('recipes', (t) => {
        t.dropColumn('required_tools');
    });
    await knex.schema.dropTableIfExists('workstation_slots');
    await knex.schema.dropTableIfExists('workstation_slot_types');
}
