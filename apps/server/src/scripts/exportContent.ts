// Export content tables to JSON snapshots in the repo.
//
//   npm run content:export        (from apps/server)
//
// Writes content-snapshots/<table>.json at the REPO ROOT plus a manifest with
// row counts and the latest applied migration. Commit the snapshot directory —
// it is the disaster-recovery and local-sync half of the DB-first content
// model. Deterministic output (rows ordered by id, pretty-printed) keeps
// git diffs readable: a one-cell panel edit shows up as a one-line diff.

import fs from 'fs';
import path from 'path';
import db from '../db';
import { SNAPSHOT_TABLES } from '../lib/contentTables';

const OUT_DIR = path.resolve(__dirname, '../../../../content-snapshots');

async function main() {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const manifest: {
        exported_at: string;
        latest_migration: string | null;
        tables: Record<string, number>;
    } = {
        exported_at: new Date().toISOString(),
        latest_migration: null,
        tables: {},
    };

    try {
        const lastMigration = await db('knex_migrations').orderBy('id', 'desc').first();
        manifest.latest_migration = lastMigration?.name ?? null;
    } catch {
        // knex_migrations missing would be strange, but don't let it block a backup
    }

    for (const table of SNAPSHOT_TABLES) {
        const rows = await db(table).select('*').orderBy('id', 'asc');
        const file = path.join(OUT_DIR, `${table}.json`);
        fs.writeFileSync(file, JSON.stringify(rows, null, 2) + '\n');
        manifest.tables[table] = rows.length;
        console.log(`  ${table}: ${rows.length} rows -> ${path.relative(process.cwd(), file)}`);
    }

    fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`\nExported ${SNAPSHOT_TABLES.length} tables at ${manifest.exported_at}`);
    console.log(`Latest migration: ${manifest.latest_migration}`);
    console.log('Commit content-snapshots/ alongside your code changes.');
}

main()
    .then(() => db.destroy())
    .catch(async (err) => {
        console.error('Export failed:', err);
        await db.destroy();
        process.exit(1);
    });
