/**
 * Item coverage audit.
 *
 *   npm run items:audit
 *
 * WHAT THIS IS FOR
 *
 * The manual's item pages are assembled by services/itemPage.ts, which reads a
 * fixed set of places an item can be produced or consumed. That set was written
 * by hand, which means it is a snapshot: the day someone adds a new system with
 * its own item costs, every affected item page quietly becomes wrong, and the
 * only way anyone finds out is by browsing to the item and noticing an absence.
 *
 * This script closes that loop. It finds every place in the codebase and the
 * schema where an item is referenced by name, subtracts the places itemPage
 * already reads, and prints the remainder with file and line. A clean run means
 * every known item reference is reachable from a page.
 *
 * WHAT IT CANNOT DO, and this matters
 *
 * It finds references, not meaning. It cannot tell a consume from a produce
 * from a display label, so each gap it reports still needs a person to decide
 * what the page should say. And it matches on item NAMES, so a system that
 * works in types or subtypes (`where({ type: 'log' })`) or assembles a name
 * from parts is invisible to it. Those remain the gap in the net, and they are
 * the reason COVERED_CODE below is maintained by hand rather than inferred.
 *
 * Exit code is 1 when anything is uncovered, so this can gate a deploy.
 */

import fs from 'fs';
import path from 'path';
import db from '../db';
import { COVERED_TABLES, COVERED_CODE } from '../services/itemPage';

const SERVICE_DIR = path.join(__dirname, '..', 'services');
const MIGRATION_DIR = path.join(__dirname, '..', 'db', 'migrations');

interface Finding {
    where: string;      // file:line
    item: string;
    context: string;
}

function walk(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter(f => f.endsWith('.ts'))
        .map(f => path.join(dir, f));
}

/**
 * Columns that point at an item by ID rather than by name.
 *
 * These were the hole in the net. The scan below matches item names, so a table
 * joining `items` on an integer is invisible to it however carefully it is
 * read: drop_table_entries held every secondary drop in the game, and nothing
 * about it looked like an item reference. Listing the columns from the schema
 * means a new one shows up here the day it is created.
 */
/**
 * Tables that record where an item currently IS, rather than where it comes
 * from or what it is for.
 *
 * A player's pack, their equipment slots, a shop listing, a trade offer, a pile
 * on the ground: every one of these joins items by id, and not one of them
 * belongs on an item page. "Somebody, somewhere, is holding one" is not a way
 * to obtain something. Runtime rows of live veins and daily merchant limits are
 * the same: the definitions behind them are already covered, and the instances
 * add nothing a reader could act on.
 *
 * Kept as a rule rather than as twenty-six separate exceptions, so a new
 * per-player table does not need a line here to be understood.
 */
const RUNTIME_TABLES = [
    /^player_/,           // inventory, equipment, traps, firsts
    /^shop_/,             // listings, buy orders, transactions
    /^npc_(sale|purchase)_daily$/,
    /^(ground_items|trade_offers|property_storage|ore_veins|item_firsts)$/,
];

function isRuntime(table: string): boolean {
    return RUNTIME_TABLES.some(re => re.test(table));
}

function itemIdColumns(): { table: string; column: string }[] {
    const found: { table: string; column: string }[] = [];
    for (const file of walk(MIGRATION_DIR)) {
        const src = fs.readFileSync(file, 'utf8');
        let table: string | null = null;
        for (const line of src.split('\n')) {
            const t = line.match(/(?:createTable|alterTable)\('([a-z_]+)'/);
            if (t) table = t[1];
            const c = line.match(/\.(?:integer|bigInteger)\('([a-z_]*item_id)'/);
            if (table && c && !isRuntime(table)
                && !found.some(f => f.table === table && f.column === c[1])) {
                found.push({ table: table!, column: c[1] });
            }
        }
    }
    return found;
}

/** Columns in the schema that hold an item NAME rather than an id. */
function itemNameColumns(): { table: string; column: string }[] {
    const found: { table: string; column: string }[] = [];
    const NAMEY = /(item_name|_table$|^inputs$|start_items|reward_items|target_item)/;

    for (const file of walk(MIGRATION_DIR)) {
        const src = fs.readFileSync(file, 'utf8');
        let table: string | null = null;
        for (const line of src.split('\n')) {
            const t = line.match(/(?:createTable|alterTable)\('([a-z_]+)'/);
            if (t) table = t[1];
            const c = line.match(/\.(?:string|text|jsonb)\('([a-z_]+)'/);
            if (table && c && NAMEY.test(c[1])) {
                if (!found.some(f => f.table === table && f.column === c[1])) {
                    found.push({ table: table!, column: c[1] });
                }
            }
        }
    }
    return found;
}

async function main(): Promise<void> {
    const items: { name: string; is_active: boolean }[] =
        await db('items').select('name', 'is_active');
    const names = new Set(items.map(i => i.name));
    const live = items.filter(i => i.is_active);
    const retired = items.length - live.length;
    console.log(`Auditing ${names.size} items (${live.length} active, ${retired} retired).\n`);

    // ── 1. Schema columns holding item names ────────────────────────────────
    const columns = itemNameColumns();
    const uncoveredColumns = columns.filter(
        c => !COVERED_TABLES.some(cov => cov.table === c.table && cov.column === c.column),
    );

    const idColumns = itemIdColumns();
    const uncoveredIds = idColumns.filter(
        c => !COVERED_TABLES.some(cov => cov.table === c.table && cov.column === c.column),
    );

    console.log(`── Schema ──────────────────────────────────────────────`);
    console.log(`   ${columns.length} columns hold item names, ${columns.length - uncoveredColumns.length} covered.`);
    for (const c of uncoveredColumns) {
        console.log(`   UNCOVERED  ${c.table}.${c.column}`);
    }
    console.log(`   ${idColumns.length} columns point at items by id, ${idColumns.length - uncoveredIds.length} covered.`);
    for (const c of uncoveredIds) {
        console.log(`   UNCOVERED  ${c.table}.${c.column}   (joins items by id)`);
    }

    // ── 2. Item names hardcoded in service files ────────────────────────────
    const findings: Finding[] = [];
    for (const file of walk(SERVICE_DIR)) {
        const rel = path.relative(path.join(__dirname, '..'), file);
        if (COVERED_CODE.includes(rel)) continue;

        const lines = fs.readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
            if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
            for (const quoted of line.matchAll(/'([^']{3,60})'/g)) {
                if (!names.has(quoted[1])) continue;
                findings.push({
                    where: `${rel}:${i + 1}`,
                    item: quoted[1],
                    context: line.trim().slice(0, 90),
                });
            }
        });
    }

    const byFile = new Map<string, Finding[]>();
    for (const f of findings) {
        const file = f.where.split(':')[0];
        byFile.set(file, [...(byFile.get(file) || []), f]);
    }

    console.log(`\n── Code ────────────────────────────────────────────────`);
    if (byFile.size === 0) {
        console.log('   Every service that names an item is covered.');
    } else {
        console.log(`   ${findings.length} item references in ${byFile.size} uncovered files:\n`);
        for (const [file, list] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
            const unique = [...new Set(list.map(l => l.item))];
            console.log(`   ${file}  (${list.length} refs, ${unique.length} items)`);
            for (const l of list.slice(0, 4)) {
                console.log(`      ${l.where.padEnd(34)} ${l.item}`);
            }
            if (list.length > 4) console.log(`      ... and ${list.length - 4} more`);
            console.log('');
        }
    }

    // ── 3. Items no page can say anything about ─────────────────────────────
    //
    // Only ACTIVE items are counted. An orphan among these is a genuine
    // problem: the item is live in the game, and its page says nothing about
    // where it comes from or what it is for.
    //
    // Inactive items are listed separately and never fail the run. That set is
    // two different things wearing the same face, and the difference is not
    // something a script can see: content that was built and later cut, and
    // content that is seeded ahead of the systems that will use it. Both are
    // correctly empty today. Marking a retired item is_active = false is what
    // keeps this list meaningful, and is the only way this check can tell the
    // difference between "not built yet" and "quietly broken".
    const { buildItemPage } = await import('../services/itemPage');
    const liveOrphans: string[] = [];
    const retiredOrphans: string[] = [];

    for (const item of items) {
        const page = await buildItemPage(item.name);
        if (!page || page.sources.length || page.uses.length) continue;
        (item.is_active ? liveOrphans : retiredOrphans).push(item.name);
    }

    console.log(`── Active items with no source and no use ──────────────`);
    if (liveOrphans.length === 0) {
        console.log('   None. Everything in the game can be obtained and is good for something.');
    } else {
        console.log(`   ${liveOrphans.length} of ${live.length} active items:`);
        for (const o of liveOrphans.sort()) console.log(`      ${o}`);
    }

    if (retiredOrphans.length) {
        console.log(`\n   (${retiredOrphans.length} inactive items are also empty, which is expected.)`);
    }

    const failed = uncoveredColumns.length > 0 || uncoveredIds.length > 0
        || byFile.size > 0 || liveOrphans.length > 0;
    console.log(`\n${failed ? 'GAPS FOUND' : 'CLEAN'}\n`);
    await db.destroy();
    process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
    console.error(err);
    await db.destroy();
    process.exit(1);
});
