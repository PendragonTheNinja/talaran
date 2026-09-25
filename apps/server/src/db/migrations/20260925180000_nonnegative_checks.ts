import type { Knex } from 'knex';

// Database backstops for "never below zero" (audit §5.1, §14 item 6).
//
// There were no CHECK constraints anywhere in the schema. Every dupe the audits
// found worked the same way: two requests read the same row, both passed the
// app's "have you got enough?" check, and both wrote, leaving a stack or a
// balance below zero. services/gold.ts stopped that for gold by locking and
// refusing, but twenty-odd item paths still write directly. With these in
// place, any future bug of that class fails loudly at the database instead of
// quietly minting value.
//
// Each constraint is `>= 0`, not `> 0`. Some paths still decrement a stack to
// zero and leave the row, which is harmless. Tightening to `> 0` belongs with
// the §5.1 inventory module, once every path deletes a stack that hits zero.
//
// THIS MIGRATION REFUSES TO RUN OVER BAD DATA. If live already holds negatives
// from the old bugs, it lists every offending row and stops with nothing
// changed. It never repairs them itself: a negative stack is evidence of a dupe
// (someone likely holds the copies elsewhere), and deciding what each one
// should become is a judgement, not a default. Fix the listed rows by hand,
// then run migrate again.

interface Backstop {
    table: string;
    name: string;
    check: string;
    /** SELECT returning `id` and a human-readable `detail` for each row that breaks the check. */
    violators: string;
}

const BACKSTOPS: Backstop[] = [
    {
        table: 'players',
        name: 'players_gold_nonnegative',
        check: 'gold >= 0',
        violators: `
            SELECT p.id, p.username || ' has ' || p.gold || 'g' AS detail
            FROM players p WHERE NOT (p.gold >= 0) ORDER BY p.id`,
    },
    {
        table: 'player_inventory',
        name: 'player_inventory_quantity_nonnegative',
        check: 'quantity >= 0',
        violators: `
            SELECT pi.id, p.username || ': ' || i.name || ' x' || pi.quantity AS detail
            FROM player_inventory pi
            JOIN players p ON p.id = pi.player_id
            JOIN items i ON i.id = pi.item_id
            WHERE NOT (pi.quantity >= 0) ORDER BY pi.id`,
    },
    {
        table: 'property_storage',
        name: 'property_storage_quantity_nonnegative',
        check: 'quantity >= 0',
        violators: `
            SELECT ps.id, coalesce(p.username, 'property ' || ps.property_id) || ' storage: '
                || i.name || ' x' || ps.quantity AS detail
            FROM property_storage ps
            LEFT JOIN player_properties pp ON pp.id = ps.property_id
            LEFT JOIN players p ON p.id = pp.player_id
            JOIN items i ON i.id = ps.item_id
            WHERE NOT (ps.quantity >= 0) ORDER BY ps.id`,
    },
    {
        table: 'ground_items',
        name: 'ground_items_quantity_nonnegative',
        check: 'quantity >= 0',
        violators: `
            SELECT g.id, 'location ' || g.location_id || ': ' || i.name || ' x' || g.quantity AS detail
            FROM ground_items g JOIN items i ON i.id = g.item_id
            WHERE NOT (g.quantity >= 0) ORDER BY g.id`,
    },
    {
        table: 'shop_listings',
        name: 'shop_listings_quantity_nonnegative',
        check: 'quantity >= 0',
        violators: `
            SELECT sl.id, 'shop ' || sl.shop_id || ' shelf: ' || i.name || ' x' || sl.quantity AS detail
            FROM shop_listings sl JOIN items i ON i.id = sl.item_id
            WHERE NOT (sl.quantity >= 0) ORDER BY sl.id`,
    },
    {
        table: 'shop_buy_orders',
        name: 'shop_buy_orders_filled_within_wanted',
        check: 'quantity_filled >= 0 AND quantity_filled <= quantity_wanted',
        violators: `
            SELECT o.id, 'shop ' || o.shop_id || ' order: ' || i.name || ' filled '
                || o.quantity_filled || ' of ' || o.quantity_wanted AS detail
            FROM shop_buy_orders o JOIN items i ON i.id = o.item_id
            WHERE NOT (o.quantity_filled >= 0 AND o.quantity_filled <= o.quantity_wanted) ORDER BY o.id`,
    },
    {
        table: 'player_shops',
        name: 'player_shops_till_nonnegative',
        check: 'till_gold >= 0',
        violators: `
            SELECT s.id, s.name || ' till: ' || s.till_gold || 'g' AS detail
            FROM player_shops s WHERE NOT (s.till_gold >= 0) ORDER BY s.id`,
    },
    {
        table: 'player_shops',
        name: 'player_shops_buy_fund_nonnegative',
        check: 'buy_fund_gold >= 0',
        violators: `
            SELECT s.id, s.name || ' buy fund: ' || s.buy_fund_gold || 'g' AS detail
            FROM player_shops s WHERE NOT (s.buy_fund_gold >= 0) ORDER BY s.id`,
    },
    {
        table: 'trade_offers',
        name: 'trade_offers_quantity_nonnegative',
        check: 'quantity >= 0',
        violators: `
            SELECT t.id, 'trade ' || t.trade_id || ', player ' || t.player_id || ': '
                || i.name || ' x' || t.quantity AS detail
            FROM trade_offers t JOIN items i ON i.id = t.item_id
            WHERE NOT (t.quantity >= 0) ORDER BY t.id`,
    },
    {
        table: 'trade_gold',
        name: 'trade_gold_amount_nonnegative',
        check: 'gold_amount >= 0',
        violators: `
            SELECT t.id, 'trade ' || t.trade_id || ', player ' || t.player_id || ': '
                || t.gold_amount || 'g' AS detail
            FROM trade_gold t WHERE NOT (t.gold_amount >= 0) ORDER BY t.id`,
    },
];

/** How many offending rows to print per constraint before summarising the rest. */
const LIST_LIMIT = 25;

export async function up(knex: Knex): Promise<void> {
    // Look at everything first, so one run reports every problem at once
    // rather than one table per attempt.
    const problems: string[] = [];
    for (const b of BACKSTOPS) {
        const { rows } = await knex.raw(b.violators);
        if (!rows.length) continue;
        problems.push(`  ${b.table} breaks ${b.name} (${b.check}): ${rows.length} row(s)`);
        for (const r of rows.slice(0, LIST_LIMIT)) problems.push(`    id ${r.id}: ${r.detail}`);
        if (rows.length > LIST_LIMIT) problems.push(`    ...and ${rows.length - LIST_LIMIT} more`);
    }

    if (problems.length) {
        throw new Error(
            'nonnegative_checks: refusing to add the constraints, because live data already breaks them.\n'
            + 'Nothing has been changed. These rows are left over from the old dupe bugs; decide what each\n'
            + 'should become, fix them by hand, then run migrate again.\n'
            + problems.join('\n'),
        );
    }

    for (const b of BACKSTOPS) {
        await knex.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (${b.check})`, [b.table, b.name]);
    }
}

export async function down(knex: Knex): Promise<void> {
    for (const b of [...BACKSTOPS].reverse()) {
        await knex.raw('ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??', [b.table, b.name]);
    }
}
