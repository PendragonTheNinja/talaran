import type { Knex } from 'knex';

// Taiar Marketplace merchants (docs/marketplace-spec.md §3).
//
// ── READ THIS BEFORE RUNNING ────────────────────────────────────────────────
// DO NOT run `npm run seed` on live. That runs every seed in this directory,
// and 02_items.ts opens by deleting player_inventory and player_equipment.
// Run this file alone:
//
//   npx knex --knexfile knexfile.ts seed:run --specific=08_merchants.ts
//
// Unlike its neighbours, this seed is idempotent and non-destructive. It
// upserts on merchants.key and on (merchant_id, item_id), so re-running it is
// safe and is the intended way to change the marketplace.
//
// It is also DECLARATIVE: the lists below are the whole truth. A stock row that
// no longer appears here is deactivated rather than left behind, so deleting a
// line from this file actually removes it from the shelf. Deactivated, not
// deleted, because merchant_stock rows may be referenced by future history.
//
// Items are referenced BY NAME and resolved at run time. A rename fails loudly
// here instead of silently pointing a merchant at whatever now holds that id.

interface MerchantSeed {
    key: string;
    name: string;
    title: string;
    greeting: string;
    buy_rate: number;
    buys_anything: boolean;
    sells: boolean;
    is_active: boolean;
    display_order: number;
    /** Always in stock. The safety net that makes tools breaking survivable. */
    core: string[];
    /** Candidates for the daily rotation. Empty is fine. */
    rotating?: string[];
}

const LOCATION = 'Talador';

// Names are placeholders. Geo- is the skill-tutor register and must stay that,
// so merchants need their own; these are here to be overwritten.
const MERCHANTS: MerchantSeed[] = [
    {
        key: 'smith',
        name: 'Merrick',
        title: 'Smith of Talador',
        greeting: 'Ambren and edge. Bring me ore and I will not haggle.',
        buy_rate: 0.45,
        buys_anything: false,
        sells: true,
        is_active: true,
        display_order: 1,
        core: [
            'Ambren Pickaxe',
            'Ambren Hatchet',
            'Ambren Hammer',
            'Ambren Tongs',
            'Ambren Saw',
            'Ambren Plane',
            'Ambren Hoe',
            'Ambren Foraging Knife',
            'Ambren Butchering Knife',
            'Mucking Fork',
        ],
    },
    {
        key: 'carpenter',
        name: 'Alder',
        title: 'Carpenter of Talador',
        greeting: 'Everything here started as a tree. Some of it still smells like one.',
        buy_rate: 0.45,
        buys_anything: false,
        sells: true,
        is_active: true,
        display_order: 2,
        core: [
            'Lanai Mallet',
            'Lanai Bucket',
            'Lanai Sawhorse',
            'Feed Pail',
            'Foraging Basket',
            'Snare',
            'Lanai Staff',
        ],
    },
    {
        key: 'leatherworker',
        name: 'Tessa',
        title: 'Leatherworker of Talador',
        greeting: 'Hides, cured and cut. Sturdy enough for a season of walking.',
        buy_rate: 0.45,
        buys_anything: false,
        sells: true,
        is_active: true,
        display_order: 3,
        core: [
            'Leather Boots',
            'Leather Foraging Gloves',
            'Halter & Lead',
        ],
    },
    {
        // DISABLED. Nothing to sell yet: fishing needs no bait, seeds come from
        // foraging, and there is no cooked food line. While this is inactive,
        // every fish, crop, herb and berry falls to the pawnbroker at 35%
        // instead of 45%.
        //
        // To make him a buyer only, set is_active true and leave sells false.
        // That restores the 45% floor on all of it without needing a shelf.
        key: 'provisioner',
        name: 'Hettie',
        title: 'Provisioner of Talador',
        greeting: 'Field and river, both feed a town.',
        buy_rate: 0.45,
        buys_anything: false,
        sells: false,
        is_active: false,
        display_order: 4,
        core: [],
    },
    {
        key: 'pawnbroker',
        name: 'Corvin',
        title: 'Pawnbroker of Talador',
        greeting: 'I will take anything off your hands. You will not enjoy the price.',
        buy_rate: 0.35,
        buys_anything: true,
        sells: false,
        is_active: true,
        display_order: 5,
        core: [],
    },
];

// Units of a given tool one player may buy per day. Rolled per item per day
// between these, so the shelf is stable for a whole Eastern day.
const TOOL_MIN_QTY = 1;
const TOOL_MAX_QTY = 5;

export async function seed(knex: Knex): Promise<void> {
    const location = await knex('locations').where({ name: LOCATION }).first();
    if (!location) throw new Error(`Merchant seed: no location named ${LOCATION}.`);

    // Resolve every name up front so a typo fails before anything is written.
    const wanted = new Set<string>();
    for (const m of MERCHANTS) {
        for (const n of [...m.core, ...(m.rotating ?? [])]) wanted.add(n);
    }

    const items = await knex('items').whereIn('name', [...wanted]).select('id', 'name');
    const itemIdByName = new Map<string, number>(items.map((i: any) => [i.name, i.id]));

    const missing = [...wanted].filter(n => !itemIdByName.has(n));
    if (missing.length) {
        throw new Error(`Merchant seed: these items do not exist: ${missing.join(', ')}`);
    }

    for (const m of MERCHANTS) {
        const row = {
            key: m.key,
            name: m.name,
            title: m.title,
            greeting: m.greeting,
            location_id: location.id,
            buy_rate: m.buy_rate,
            buys_anything: m.buys_anything,
            sells: m.sells,
            is_active: m.is_active,
            display_order: m.display_order,
        };

        const existing = await knex('merchants').where({ key: m.key }).first();
        if (existing) {
            await knex('merchants').where({ id: existing.id }).update(row);
        } else {
            await knex('merchants').insert(row);
        }

        const merchant = await knex('merchants').where({ key: m.key }).first();

        const lines = [
            ...m.core.map(name => ({ name, is_core: true })),
            ...(m.rotating ?? []).map(name => ({ name, is_core: false })),
        ];

        for (const line of lines) {
            const itemId = itemIdByName.get(line.name)!;
            const stockRow = {
                merchant_id: merchant.id,
                item_id: itemId,
                is_core: line.is_core,
                min_qty: TOOL_MIN_QTY,
                max_qty: TOOL_MAX_QTY,
                is_active: true,
            };

            const existingStock = await knex('merchant_stock')
                .where({ merchant_id: merchant.id, item_id: itemId })
                .first();

            if (existingStock) {
                await knex('merchant_stock').where({ id: existingStock.id }).update(stockRow);
            } else {
                await knex('merchant_stock').insert(stockRow);
            }
        }

        // Anything this merchant carries that is no longer listed above goes
        // quiet. This is what makes the file declarative: removing a line here
        // removes it from the shelf, instead of leaving a row nobody remembers
        // adding.
        const keepIds = lines.map(l => itemIdByName.get(l.name)!);
        const staleQuery = knex('merchant_stock').where({ merchant_id: merchant.id });
        if (keepIds.length) staleQuery.whereNotIn('item_id', keepIds);
        await staleQuery.update({ is_active: false });
    }
}
