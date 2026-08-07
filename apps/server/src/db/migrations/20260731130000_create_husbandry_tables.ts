import type { Knex } from 'knex';

// Husbandry, schema only (content lands in a following migration).
//
//   animal_species — content. Nouns are rows: every timing, yield and level gate
//                    for a species lives here, so balance ships as a migration.
//   player_pens    — pen slots inside a property, the farm_plots pattern. A pen
//                    is built as a coop or a paddock and then locks to the first
//                    species put in it; emptying it clears the lock.
//   player_animals — one animal. Timers are pause-aware: an animal only ages and
//                    only makes product while its pen is fed, so we store accrued
//                    fed-seconds and fold in elapsed time on read (the farm_plots
//                    ready_at habit, adapted — no tick sweep).
//
// Nothing here dies. There is no death column and no health column by design:
// an unfed animal stops accruing and waits.

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('animal_species', (t) => {
        t.increments('id').primary();
        t.string('name', 60).notNullable().unique();     // upsert key for data migrations
        t.string('pen_type', 12).notNullable();          // coop | paddock
        t.integer('husbandry_level').unsigned().notNullable().defaultTo(1);

        // Lifecycle. Both are fed-seconds, not wall-clock.
        t.integer('grow_seconds').unsigned().notNullable();          // juvenile -> adult
        t.integer('elder_seconds').unsigned().notNullable();         // adult -> elder

        // The item that becomes this animal when placed in a pen.
        t.string('baby_item_name', 60).notNullable();

        // Feeding. Cost is per head, per feed.
        t.string('feed_item_name', 60).notNullable();
        t.integer('feed_qty').unsigned().notNullable().defaultTo(1);

        // Repeating product. Null product_item_name = makes nothing while alive
        // (a pure slaughter animal). product_chance is out of 100 and is what
        // makes a truffle a find rather than a harvest.
        t.string('product_item_name', 60).nullable();
        t.integer('product_seconds').unsigned().nullable();
        t.integer('product_qty').unsigned().notNullable().defaultTo(1);
        t.integer('product_chance').unsigned().notNullable().defaultTo(100);

        // Elder decay. Applied to every yield an elder produces, product chance
        // included, so an elder is worse at everything and the wheel turns.
        t.float('elder_yield_multiplier').notNullable().defaultTo(0.5);
        t.float('elder_time_multiplier').notNullable().defaultTo(1.5);

        // Slaughter drops. JSON: [{ "itemName": "...", "min": n, "max": n, "chance": n }]
        t.text('slaughter_table').notNullable();

        // Mounts: on reaching adult these leave the pen as an inventory item,
        // and an item does not age. Null for livestock.
        t.string('mount_item_name', 60).nullable();

        // XP. Active actions and passive milestones are priced separately;
        // see docs/xp-rebalance.md §8 and the husbandry uptime sim.
        t.integer('xp_product').unsigned().notNullable().defaultTo(0);
        t.integer('xp_mature').unsigned().notNullable().defaultTo(0);
        t.integer('xp_slaughter').unsigned().notNullable().defaultTo(0);

        t.text('description').nullable();
        t.boolean('is_active').notNullable().defaultTo(true);
        t.timestamps(true, true);
    });

    await knex.schema.createTable('player_pens', (t) => {
        t.increments('id').primary();
        t.integer('property_id').unsigned().notNullable()
            .references('id').inTable('player_properties').onDelete('CASCADE');
        t.integer('slot_index').unsigned().notNullable();
        t.string('pen_type', 12).notNullable();          // coop | paddock, chosen at build
        t.integer('species_id').unsigned().nullable()
            .references('id').inTable('animal_species').onDelete('SET NULL');
        t.integer('capacity').unsigned().notNullable().defaultTo(4);

        // Feeding is per pen: one Feed All sets this for every head inside.
        t.timestamp('fed_until').nullable();
        // Mucking is per pen too, and falls due on wall-clock time rather than
        // fed time — a neglected pen still needs shovelling out.
        t.timestamp('muck_due_at').nullable();

        t.timestamps(true, true);
        t.unique(['property_id', 'slot_index']);
    });

    await knex.schema.createTable('player_animals', (t) => {
        t.increments('id').primary();
        t.integer('player_id').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');
        t.integer('pen_id').unsigned().notNullable()
            .references('id').inTable('player_pens').onDelete('CASCADE');
        t.integer('species_id').unsigned().notNullable()
            .references('id').inTable('animal_species').onDelete('CASCADE');

        // Randomised at placement from a per-species pool, renameable forever.
        t.string('name', 40).notNullable();

        // Pause-aware clocks. grow_seconds_accrued measures the whole life so a
        // single number carries both juvenile->adult and adult->elder;
        // product_seconds_accrued resets each time a product is collected.
        // accrued_at is the last moment folded in.
        t.integer('grow_seconds_accrued').unsigned().notNullable().defaultTo(0);
        t.integer('product_seconds_accrued').unsigned().notNullable().defaultTo(0);
        t.timestamp('accrued_at').notNullable().defaultTo(knex.fn.now());

        // Milestone XP is paid once, on the read that first sees adulthood.
        t.boolean('mature_xp_paid').notNullable().defaultTo(false);

        t.timestamp('born_at').notNullable().defaultTo(knex.fn.now());
        t.timestamps(true, true);
        t.index(['player_id']);
        t.index(['pen_id']);
    });

    // Pen count sits on the property beside plot_slots, so a later tier upgrade
    // is a number change rather than a schema change (CLAUDE.md §2c).
    if (!(await knex.schema.hasColumn('player_properties', 'pen_slots'))) {
        await knex.schema.alterTable('player_properties', (t) => {
            t.integer('pen_slots').unsigned().notNullable().defaultTo(0);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('player_properties', 'pen_slots')) {
        await knex.schema.alterTable('player_properties', (t) => t.dropColumn('pen_slots'));
    }
    await knex.schema.dropTableIfExists('player_animals');
    await knex.schema.dropTableIfExists('player_pens');
    await knex.schema.dropTableIfExists('animal_species');
}
