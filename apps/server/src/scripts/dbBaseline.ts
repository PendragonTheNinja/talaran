/**
 * The repository's way to build its own database (audit M17).
 *
 * The 220-odd migrations cannot be replayed on an empty database: many are
 * data migrations written against live content (e.g. 20260715010528 looks up
 * "Eld Grove" and throws when it is missing, as it should on live). So a fresh
 * database is built from a BASELINE instead: the schema as it stands after
 * every migration up to a cut, captured once, plus Knex's bookkeeping saying
 * those migrations are done. `migrate` then runs only what came after the cut.
 * Live never uses this; it keeps running migrations as before.
 *
 *   pnpm db:build      Build the schema into an EMPTY database (DATABASE_URL),
 *                      and record every migration up to the cut as applied.
 *                      Then: `pnpm migrate` for anything newer, then
 *                      `pnpm content:import --yes` for the game's content, then
 *                      the merchant seed alone (its own source of truth):
 *                      npx knex --knexfile knexfile.ts seed:run --specific=08_merchants.ts
 *
 *   pnpm db:baseline   Rewrite the baseline from a FULLY MIGRATED database
 *                      (DATABASE_URL), e.g. a local copy after `pnpm migrate`.
 *                      Refuses unless its latest applied migration is the
 *                      newest file in the repo. Commit both files it writes.
 *
 * Content is not in the baseline: authored content lives in content-snapshots/
 * (lib/contentTables.ts decides which tables), player data lives nowhere in
 * the repo. Needs `psql` and `pg_dump` on the PATH.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import knex from 'knex';

const MIGRATIONS_DIR = path.resolve(__dirname, '../db/migrations');
const BASELINE_DIR = path.resolve(__dirname, '../db/baseline');
const SCHEMA_FILE = path.join(BASELINE_DIR, 'schema.sql');
const META_FILE = path.join(BASELINE_DIR, 'baseline.json');

interface BaselineMeta {
    /** The newest migration whose effects the schema already contains. */
    cut: string;
    migrations: number;
    generated_at: string;
}

function fail(why: string): never {
    console.error(`db baseline: ${why}`);
    process.exit(1);
}

function migrationFiles(): string[] {
    return fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{14}_.+\.(ts|js)$/.test(f)).sort();
}

const url = process.env.DATABASE_URL ?? fail('DATABASE_URL is not set.');

async function write(): Promise<void> {
    const db = knex({ client: 'pg', connection: url });
    try {
        const files = migrationFiles();
        const newest = files[files.length - 1];
        const applied = await db('knex_migrations').orderBy('name', 'desc').first().catch(() => undefined);
        if (!applied) fail('this database has no applied migrations; point DATABASE_URL at a fully migrated one.');
        if (applied.name !== newest) {
            fail(`this database's latest migration is ${applied.name}, but the newest file is ${newest}. Run \`pnpm migrate\` first.`);
        }

        // pg_dump 16.10+ brackets the script in \restrict / \unrestrict with a
        // random key. That is a guard for restoring untrusted dumps; this file
        // is ours and committed, and the lines would churn on every rewrite.
        const dump = execFileSync('pg_dump', ['--schema-only', '--no-owner', '--no-privileges', url], { maxBuffer: 64 * 1024 * 1024 })
            .toString()
            .split('\n')
            .filter((line) => !/^\\(un)?restrict\b/.test(line))
            .join('\n');

        fs.mkdirSync(BASELINE_DIR, { recursive: true });
        fs.writeFileSync(SCHEMA_FILE, dump);
        const meta: BaselineMeta = { cut: newest, migrations: files.length, generated_at: new Date().toISOString() };
        fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2) + '\n');
        console.log(`db baseline: wrote the schema at ${newest} (${files.length} migrations). Commit src/db/baseline/.`);
    } finally {
        await db.destroy();
    }
}

async function build(): Promise<void> {
    if (!fs.existsSync(SCHEMA_FILE) || !fs.existsSync(META_FILE)) fail('no baseline in src/db/baseline/. Run `pnpm db:baseline` from a migrated database.');
    const meta: BaselineMeta = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
    const covered = migrationFiles().filter((f) => f <= meta.cut);
    if (!covered.includes(meta.cut)) fail(`the baseline's cut ${meta.cut} is not a migration file in this repo.`);

    const db = knex({ client: 'pg', connection: url });
    try {
        // Only ever onto an empty database: this is for building, never for a
        // database that holds anything.
        const { rows } = await db.raw(`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'`);
        if (rows[0].n > 0) fail(`refusing: the target database already has ${rows[0].n} tables. db:build only fills an empty database.`);

        execFileSync('psql', ['-q', '-v', 'ON_ERROR_STOP=1', url], { input: fs.readFileSync(SCHEMA_FILE), stdio: ['pipe', 'pipe', 'inherit'] });

        // Knex's own bookkeeping: every migration the schema already contains
        // is recorded as applied, so `migrate` skips them and runs only newer ones.
        const now = new Date();
        for (let i = 0; i < covered.length; i += 100) {
            await db('knex_migrations').insert(covered.slice(i, i + 100).map((name) => ({ name, batch: 1, migration_time: now })));
        }
        const lock = await db('knex_migrations_lock').first();
        if (!lock) await db('knex_migrations_lock').insert({ is_locked: 0 });

        console.log(`db build: schema at ${meta.cut}, ${covered.length} migrations recorded as applied.`);
        console.log('Next: `pnpm migrate`, then `pnpm content:import --yes`, then the merchant seed alone:');
        console.log('  npx knex --knexfile knexfile.ts seed:run --specific=08_merchants.ts');
    } finally {
        await db.destroy();
    }
}

const command = process.argv[2];
(command === 'write' ? write() : command === 'build' ? build() : Promise.reject(new Error('usage: dbBaseline.ts write|build')))
    .catch((err) => fail(err instanceof Error ? err.message : String(err)));
