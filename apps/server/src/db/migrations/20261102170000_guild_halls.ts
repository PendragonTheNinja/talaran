import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Guild halls and their storehouses (services/guildHall.ts; Nathan, 2026-11-02).
//
// A guild may raise one hall on each island, at any location it chooses. The
// hall is built by its members together, one material at a time: "Add Lanai
// Planks" is a 20-second action paying Carpentry XP that sets one plank into
// the work. Each tier asks for far more than a farmstead, because everyone is
// building it. A finished tier opens (or enlarges) the storehouse.
//
//   guild_hall_tiers        CONTENT. What each tier needs ([{ item, qty }], by
//                           item NAME so a tier can name a material the world
//                           does not have yet: it simply cannot be finished
//                           until someone can make it) and how much the
//                           storehouse holds once that tier stands.
//   guild_halls             one per guild per island (locations.region). tier
//                           is the highest FINISHED tier; 0 while the first is
//                           going up. gold is the storehouse's coin, no limit.
//   guild_hall_progress     what has gone into the tier being built.
//   guild_hall_contributions  who gave what to the building, for the list of
//                           builders on the hall's page.
//   guild_storage           the storehouse: a quantity per item. Its room is
//                           counted in ITEMS, not stacks: 300 Granite and 7
//                           Ambren Ore take 307 of it. A personal store holds a
//                           few kinds in bulk; the guild's holds many kinds.
//   guild_storage_ledger    every deposit and withdrawal, items and gold, by
//                           whom. The record officers trust the storehouse by.
//   action_presentation     the scene line and Stop button for 'guild_build'.
//
// Tiers 1 and 2 are seeded. Tier 2 needs Serph Nails, which no one can make
// yet, so it waits for Serph. Tiers 3 to 9 are added as their materials are
// named (Nathan: tier 3 is a second building stone, Hatch Planks and
// Azulyss Nails).

const TIERS = [
    {
        tier: 1, capacity: 10000,
        requirements: [
            { item: 'Lanai Planks', qty: 2000 },
            { item: 'Granite Block', qty: 2000 },
            { item: 'Ambren Nails', qty: 4000 },
        ],
    },
    {
        tier: 2, capacity: 15000,
        requirements: [
            { item: 'Lanai Planks', qty: 3000 },
            { item: 'Granite Block', qty: 3000 },
            { item: 'Serph Nails', qty: 5000 },
        ],
    },
];

const PRESENTATION = {
    action_type: 'guild_build',
    kind: null as string | null,
    scene_text: 'You work alongside your guild, setting each piece into the hall as it rises.',
    cancel_label: 'Stop Building',
};

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('guild_hall_tiers'))) {
        await knex.schema.createTable('guild_hall_tiers', t => {
            t.increments('id').primary();
            t.integer('tier').notNullable().unique();
            t.integer('capacity').notNullable();
            t.jsonb('requirements').notNullable();
            t.timestamps(true, true);
        });
    }
    if (!(await knex.schema.hasTable('guild_halls'))) {
        await knex.schema.createTable('guild_halls', t => {
            t.increments('id').primary();
            t.integer('guild_id').notNullable().references('id').inTable('guilds').onDelete('CASCADE');
            t.string('island', 100).notNullable();
            t.integer('location_id').notNullable().references('id').inTable('locations');
            t.integer('tier').notNullable().defaultTo(0);
            t.bigInteger('gold').notNullable().defaultTo(0);
            t.integer('founded_by').nullable().references('id').inTable('players').onDelete('SET NULL');
            t.timestamps(true, true);
            t.unique(['guild_id', 'island']);
        });
        await knex.raw('ALTER TABLE guild_halls ADD CONSTRAINT guild_halls_nonnegative CHECK (gold >= 0 AND tier >= 0)');
    }
    if (!(await knex.schema.hasTable('guild_hall_progress'))) {
        await knex.schema.createTable('guild_hall_progress', t => {
            t.integer('hall_id').notNullable().references('id').inTable('guild_halls').onDelete('CASCADE');
            t.integer('item_id').notNullable().references('id').inTable('items');
            t.integer('delivered').notNullable().defaultTo(0);
            t.primary(['hall_id', 'item_id']);
        });
        await knex.raw('ALTER TABLE guild_hall_progress ADD CONSTRAINT guild_hall_progress_nonnegative CHECK (delivered >= 0)');
    }
    if (!(await knex.schema.hasTable('guild_hall_contributions'))) {
        await knex.schema.createTable('guild_hall_contributions', t => {
            t.integer('hall_id').notNullable().references('id').inTable('guild_halls').onDelete('CASCADE');
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.integer('item_id').notNullable().references('id').inTable('items');
            t.integer('quantity').notNullable().defaultTo(0);
            t.primary(['hall_id', 'player_id', 'item_id']);
        });
    }
    if (!(await knex.schema.hasTable('guild_storage'))) {
        await knex.schema.createTable('guild_storage', t => {
            t.integer('hall_id').notNullable().references('id').inTable('guild_halls').onDelete('CASCADE');
            t.integer('item_id').notNullable().references('id').inTable('items');
            t.integer('quantity').notNullable();
            t.primary(['hall_id', 'item_id']);
        });
        await knex.raw('ALTER TABLE guild_storage ADD CONSTRAINT guild_storage_nonnegative CHECK (quantity >= 0)');
    }
    if (!(await knex.schema.hasTable('guild_storage_ledger'))) {
        await knex.schema.createTable('guild_storage_ledger', t => {
            t.increments('id').primary();
            t.integer('hall_id').notNullable().references('id').inTable('guild_halls').onDelete('CASCADE');
            t.integer('player_id').nullable().references('id').inTable('players').onDelete('SET NULL');
            // Kept as written: the ledger outlives a player leaving or a rename.
            t.string('player_name', 100).notNullable();
            t.integer('item_id').nullable().references('id').inTable('items');
            /** Positive in, negative out. Items when item_id is set, gold when it is null. */
            t.integer('delta').notNullable();
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.index(['hall_id', 'created_at']);
        });
    }

    if (!(await hasContent(knex))) return;

    for (const t of TIERS) {
        const row = { tier: t.tier, capacity: t.capacity, requirements: JSON.stringify(t.requirements) };
        const existing = await knex('guild_hall_tiers').where({ tier: t.tier }).first();
        if (existing) await knex('guild_hall_tiers').where({ id: existing.id }).update(row);
        else await knex('guild_hall_tiers').insert(row);
    }
    // Every material that exists today must resolve; Serph Nails is the one
    // known to wait for its metal.
    for (const name of ['Lanai Planks', 'Granite Block', 'Ambren Nails']) {
        if (!(await knex('items').where({ name }).first())) throw new Error(`guild_halls: item "${name}" not found`);
    }

    const existing = await knex('action_presentation').where({ action_type: PRESENTATION.action_type }).whereNull('kind').first();
    if (existing) await knex('action_presentation').where({ id: existing.id }).update({ ...PRESENTATION, updated_at: knex.fn.now() });
    else await knex('action_presentation').insert(PRESENTATION);
}

export async function down(knex: Knex): Promise<void> {
    // Refuse rather than destroy what guilds have built and stored.
    if (await knex.schema.hasTable('guild_halls')) {
        const [{ n }] = await knex('guild_halls').count('* as n');
        if (Number(n) > 0) throw new Error(`guild_halls: ${n} hall(s) exist; down() would destroy them and their storehouses.`);
    }
    if (await knex.schema.hasTable('action_presentation')) {
        await knex('action_presentation').where({ action_type: PRESENTATION.action_type }).delete();
    }
    for (const t of ['guild_storage_ledger', 'guild_storage', 'guild_hall_contributions', 'guild_hall_progress', 'guild_halls', 'guild_hall_tiers']) {
        await knex.schema.dropTableIfExists(t);
    }
}
