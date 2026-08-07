import type { Knex } from 'knex';

// Liquids live in containers.
//
// Milk stopped being a loose item that appeared from nowhere and became volume
// held in buckets. Three pieces:
//
//   Lanai Bucket    — empty, as before.
//   Bucket of Milk  — sealed and full (10 units). An ordinary stackable item, so
//                     storage, trade, and ground pickup all handle it with no
//                     special cases. This is what the earlier capacity-permit
//                     model got wrong: the constraint has to travel WITH the item,
//                     or the store hands you unlimited milk with no buckets.
//   player_liquids  — the ONE open container per liquid per player. 1-9 units.
//
// The invariant that keeps the books straight: an open container is a bucket that
// has LEFT your inventory and is in use. Every bucket is therefore in exactly one
// of three states — empty in your pack, sealed as a Bucket of X, or open with
// units in it. Nothing is created or destroyed; buckets recycle as milk is spent.
//
// The open container follows the player rather than sitting at a workstation:
// dairy has no bench (Churn Butter and Press Cheese are station: null), milking
// happens at a pen, and Cooking will happen at a hearth. Binding it to a place
// would strand milk the moment the player walked indoors to churn it.
//
// `Milk` remains an item row: recipes still declare { itemName: 'Milk', qty: n }
// and services/recipes.ts routes those to volume instead of inventory. It simply
// never appears in a player's inventory again.

const LIQUIDS = [
    {
        liquid: 'Milk',
        sealed: 'Bucket of Milk',
        empty: 'Lanai Bucket',
        per: 10,
        description: 'A sealed bucket, cool and heavy. Ten good measures of milk, and the lid stays on until you need it.',
    },
];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('player_liquids'))) {
        await knex.schema.createTable('player_liquids', (t) => {
            t.increments('id').primary();
            t.integer('player_id').unsigned().notNullable()
                .references('id').inTable('players').onDelete('CASCADE');
            // The liquid's unit item name ('Milk'), matching recipe inputs.
            t.string('liquid', 60).notNullable();
            // Strictly 0-(per-1); at `per` the container seals into an item and
            // this returns to 0, so a row at full capacity should never exist.
            t.integer('units').unsigned().notNullable().defaultTo(0);
            t.timestamps(true, true);
            t.unique(['player_id', 'liquid']);
        });
    }

    for (const l of LIQUIDS) {
        const row = {
            name: l.sealed,
            type: 'material',
            subtype: 'liquid',
            tier: 1,
            quality: null,
            slot: null,
            level_required: 1,
            description: l.description,
            stackable: true,
        };
        const existing = await knex('items').where({ name: l.sealed }).first();
        if (existing) await knex('items').where({ id: existing.id }).update(row);
        else await knex('items').insert(row);
    }

    // Convert any loose Milk players are holding into sealed buckets, rounding
    // up so nobody loses milk in the change. The buckets are a gift; charging
    // for them would take away something players already had.
    const milk = await knex('items').where({ name: 'Milk' }).first();
    const sealed = await knex('items').where({ name: 'Bucket of Milk' }).first();
    if (milk && sealed) {
        const held = await knex('player_inventory').where({ item_id: milk.id });
        for (const row of held) {
            const buckets = Math.ceil(Number(row.quantity) / 10);
            if (buckets > 0) {
                const existing = await knex('player_inventory')
                    .where({ player_id: row.player_id, item_id: sealed.id }).first();
                if (existing) {
                    await knex('player_inventory').where({ id: existing.id }).increment('quantity', buckets);
                } else {
                    await knex('player_inventory').insert({
                        player_id: row.player_id, item_id: sealed.id, quantity: buckets,
                    });
                }
            }
            await knex('player_inventory').where({ id: row.id }).delete();
        }

        // Property storage too, or stored milk would become unreachable.
        if (await knex.schema.hasTable('property_storage')) {
            const stored = await knex('property_storage').where({ item_id: milk.id });
            for (const row of stored) {
                const buckets = Math.ceil(Number(row.quantity) / 10);
                if (buckets > 0) {
                    const existing = await knex('property_storage')
                        .where({ property_id: row.property_id, item_id: sealed.id }).first();
                    if (existing) {
                        await knex('property_storage').where({ id: existing.id }).increment('quantity', buckets);
                    } else {
                        await knex('property_storage').insert({
                            property_id: row.property_id, item_id: sealed.id, quantity: buckets,
                        });
                    }
                }
                await knex('property_storage').where({ id: row.id }).delete();
            }
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('player_liquids');
    // Sealed buckets are left in place — players are holding them, and turning
    // them back into loose Milk would be a second lossy conversion.
}
