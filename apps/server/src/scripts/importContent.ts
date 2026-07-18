// Import content snapshots into the connected database.
//
//   npm run content:import        (from apps/server)
//
// Reads content-snapshots/*.json (produced by content:export) and upserts
// every row BY ID in FK-dependency order, inside one transaction. After each
// table, the id sequence is bumped past max(id) so future inserts don't
// collide.
//
// Deliberately safe on a database with players in it:
//  - UPSERT ONLY. Rows that exist in the DB but not in the snapshot are NOT
//    deleted (player FKs like inventory.item_id make blind deletes a
//    catastrophe). Extras are reported loudly at the end instead — decide
//    their fate yourself.
//  - All-or-nothing: any failure rolls back the entire import.
//
// Intended direction: prod -> snapshot -> local dev DB. Importing an OLD
// snapshot into prod would resurrect old values (as one big unlogged edit),
// so the script asks for confirmation unless --yes is passed.

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import db from '../db';
import { SNAPSHOT_TABLES } from '../lib/contentTables';

const IN_DIR = path.resolve(__dirname, '../../../../content-snapshots');

async function confirm(question: string): Promise<boolean> {
    if (process.argv.includes('--yes')) return true;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(resolve => rl.question(question, resolve));
    rl.close();
    return answer.trim().toLowerCase() === 'y';
}

async function main() {
    const manifestPath = path.join(IN_DIR, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
        console.error(`No snapshot found at ${IN_DIR}. Run content:export first.`);
        process.exit(1);
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    console.log(`Snapshot from ${manifest.exported_at} (latest migration then: ${manifest.latest_migration})`);

    const lastMigration = await db('knex_migrations').orderBy('id', 'desc').first();
    if (lastMigration?.name !== manifest.latest_migration) {
        console.warn(`⚠ Schema drift: this DB's latest migration is ${lastMigration?.name ?? 'none'},`);
        console.warn(`  but the snapshot was taken at ${manifest.latest_migration}. Columns may not line up.`);
    }

    if (!await confirm('Upsert this snapshot into the connected database? [y/N] ')) {
        console.log('Aborted.');
        process.exit(0);
    }

    const extras: string[] = [];

    await db.transaction(async (trx) => {
        for (const table of SNAPSHOT_TABLES) {
            const file = path.join(IN_DIR, `${table}.json`);
            if (!fs.existsSync(file)) {
                console.warn(`  ${table}: no snapshot file, skipping`);
                continue;
            }
            const rows: Record<string, unknown>[] = JSON.parse(fs.readFileSync(file, 'utf8'));

            for (const row of rows) {
                await trx(table).insert(row).onConflict('id').merge();
            }

            // Bump the id sequence past max(id) so future inserts don't collide
            if (rows.length > 0) {
                await trx.raw(
                    `SELECT setval(pg_get_serial_sequence(?, 'id'), (SELECT COALESCE(MAX(id), 1) FROM ??))`,
                    [table, table],
                );
            }

            // Report rows present in the DB but absent from the snapshot
            const snapshotIds = new Set(rows.map(r => r.id));
            const dbIds: { id: number }[] = await trx(table).select('id');
            const extraIds = dbIds.map(r => r.id).filter(id => !snapshotIds.has(id));
            if (extraIds.length > 0) {
                extras.push(`${table}: ids ${extraIds.join(', ')} exist in the DB but not in the snapshot`);
            }

            console.log(`  ${table}: upserted ${rows.length} rows`);
        }
    });

    if (extras.length > 0) {
        console.warn('\n⚠ Rows in the DB that are NOT in the snapshot (left untouched):');
        for (const line of extras) console.warn(`  - ${line}`);
    }
    console.log('\nImport complete.');
}

main()
    .then(() => db.destroy())
    .catch(async (err) => {
        console.error('Import failed (rolled back):', err);
        await db.destroy();
        process.exit(1);
    });
