/**
 * Race regression check (audit §5.5). Run before every deploy:
 *
 *     RACECHECK_DATABASE_URL=postgres://…/talaran_racecheck pnpm race:check
 *
 * Every dupe the audits proved had one shape: several requests for the same
 * thing land together, each passes the "have you got enough?" check before any
 * of them writes, and items or gold appear from nowhere. This fires those
 * requests at the REAL app (real routes, real middleware, real HTTP) and checks
 * that nothing was created or destroyed. A failure here is a dupe that would
 * have shipped.
 *
 * How it stays honest and safe:
 *   - It never touches your real data. It needs RACECHECK_DATABASE_URL, a
 *     separate throwaway database whose name contains "racecheck", and it
 *     refuses to run against DATABASE_URL. Create it once:
 *         createdb talaran_racecheck
 *   - Its schema is copied from DATABASE_URL on every run (structure only, no
 *     rows), so it tests the schema you actually have, migrations included.
 *     Needs `pg_dump` and `psql` on the PATH.
 *   - Every scenario starts from an empty database and seeds only what it
 *     needs, then runs several rounds, because a race that loses once in five
 *     tries is still a dupe.
 *   - Email is switched off for the run.
 *
 * Exit code 0 when every scenario holds, 1 when any fails.
 */
import 'dotenv/config';
import { execFileSync } from 'child_process';
import type { AddressInfo } from 'net';

// ── Safety, before anything connects ────────────────────────────────────────

const SOURCE_URL = process.env.DATABASE_URL;
const TARGET_URL = process.env.RACECHECK_DATABASE_URL;

function dbName(url: string): string {
    return new URL(url).pathname.replace(/^\//, '');
}

function refuse(why: string): never {
    console.error(`race:check refused: ${why}`);
    process.exit(2);
}

if (!SOURCE_URL) refuse('DATABASE_URL is not set, so there is no schema to copy.');
if (!TARGET_URL) refuse('set RACECHECK_DATABASE_URL to a throwaway database (e.g. createdb talaran_racecheck).');
if (TARGET_URL === SOURCE_URL || dbName(TARGET_URL) === dbName(SOURCE_URL)) {
    refuse('RACECHECK_DATABASE_URL points at the same database as DATABASE_URL.');
}
if (!/racecheck/i.test(dbName(TARGET_URL))) {
    refuse(`the target database "${dbName(TARGET_URL)}" must have "racecheck" in its name. Its contents are wiped every run.`);
}

// The app's db module reads DATABASE_URL when it is first imported, so point it
// at the throwaway database now, before the dynamic imports below.
process.env.DATABASE_URL = TARGET_URL;
delete process.env.RESEND_API_KEY;

// ── Schema: copy the structure of the real database ─────────────────────────

function copySchema(): void {
    execFileSync('psql', ['-q', '-v', 'ON_ERROR_STOP=1', TARGET_URL!, '-c',
        'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'], { stdio: 'pipe' });
    const ddl = execFileSync('pg_dump', ['--schema-only', '--no-owner', '--no-privileges', SOURCE_URL!],
        { maxBuffer: 64 * 1024 * 1024 });
    execFileSync('psql', ['-q', '-v', 'ON_ERROR_STOP=1', TARGET_URL!], { input: ddl, stdio: ['pipe', 'pipe', 'pipe'] });
}

// ── The run ─────────────────────────────────────────────────────────────────

type Db = typeof import('../db').default;

interface Ctx {
    db: Db;
    seed: Seeder;
    post: (playerId: number, path: string, body: unknown) => Promise<number>;
    /** Issue the player's token and warm their session cache, so a later burst arrives together. */
    warm: (playerId: number) => Promise<void>;
    /**
     * Fire n requests together for one player. The token is issued and the
     * session cache warmed FIRST, so every request reaches the route at the
     * same moment. Without that, each request logs in on the way and they
     * arrive staggered, which hides exactly the races this looks for.
     */
    burst: (playerId: number, n: number, fn: (i: number) => Promise<number>) => Promise<number[]>;
    itemTotal: (itemId: number) => Promise<number>;
}

interface Scenario {
    /** Audit id, e.g. "C1". */
    id: string;
    name: string;
    rounds: number;
    /** Returns null when the round held, or a description of what broke. */
    run: (ctx: Ctx, round: number) => Promise<string | null>;
}

/**
 * Inserts rows while filling any NOT NULL column that has no default and was
 * not given, so fixtures survive new required columns without edits. A
 * required foreign key cannot be guessed and must be passed explicitly.
 */
class Seeder {
    private columns = new Map<string, { name: string; type: string; maxLen: number | null; required: boolean }[]>();
    private foreignKeys = new Map<string, Set<string>>();

    constructor(private db: Db) {}

    async load(): Promise<void> {
        const { rows: cols } = await this.db.raw(`
            SELECT table_name, column_name, data_type, character_maximum_length,
                   (is_nullable = 'NO' AND column_default IS NULL AND is_identity = 'NO') AS required
            FROM information_schema.columns WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position`);
        for (const c of cols) {
            if (!this.columns.has(c.table_name)) this.columns.set(c.table_name, []);
            this.columns.get(c.table_name)!.push({
                name: c.column_name, type: c.data_type, maxLen: c.character_maximum_length, required: c.required,
            });
        }
        const { rows: fks } = await this.db.raw(`
            SELECT kcu.table_name, kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`);
        for (const f of fks) {
            if (!this.foreignKeys.has(f.table_name)) this.foreignKeys.set(f.table_name, new Set());
            this.foreignKeys.get(f.table_name)!.add(f.column_name);
        }
    }

    async row(table: string, given: Record<string, unknown>): Promise<any> {
        const cols = this.columns.get(table);
        if (!cols) throw new Error(`race:check seed: no table "${table}" in the copied schema`);
        const values: Record<string, unknown> = { ...given };
        for (const c of cols) {
            if (!c.required || c.name in values) continue;
            if (this.foreignKeys.get(table)?.has(c.name)) {
                throw new Error(`race:check seed: ${table}.${c.name} is a required foreign key; pass it explicitly`);
            }
            values[c.name] = placeholder(table, c);
        }
        const [inserted] = await this.db(table).insert(values).returning('*');
        return inserted;
    }
}

function placeholder(table: string, c: { name: string; type: string; maxLen: number | null }): unknown {
    switch (c.type) {
        case 'integer': case 'bigint': case 'smallint': case 'numeric': case 'real': case 'double precision':
            return 0;
        case 'boolean':
            return false;
        case 'timestamp with time zone': case 'timestamp without time zone': case 'date':
            return new Date();
        case 'json': case 'jsonb':
            return JSON.stringify({});
        case 'ARRAY':
            return [];
        default: {
            const text = `${table}_${c.name}`;
            return c.maxLen ? text.slice(0, c.maxLen) : text;
        }
    }
}

async function main(): Promise<void> {
    const started = Date.now();
    console.log(`race:check: copying the schema of "${dbName(SOURCE_URL!)}" into "${dbName(TARGET_URL!)}"`);
    copySchema();

    const { default: db } = await import('../db');
    const { app, server } = await import('../index');
    const { issueSession } = await import('../lib/sessions');
    void app;

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    const seed = new Seeder(db);
    await seed.load();

    const tokens = new Map<number, string>();
    const ctx: Ctx = {
        db,
        seed,
        post: async (playerId, path, body) => {
            if (!tokens.has(playerId)) tokens.set(playerId, await issueSession(playerId));
            const r = await fetch(`http://127.0.0.1:${port}/api${path}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.get(playerId)}` },
                body: JSON.stringify(body),
            });
            // Several services catch an unexpected failure and return
            // { error: 'Server error' }, which their route sends as a 400. It is
            // still a server error, and in a burst it usually means a race hit
            // the database's CHECK backstop, so it is reported as one.
            const answer = await r.json().catch(() => null) as { error?: string } | null;
            return answer?.error === 'Server error' ? 500 : r.status;
        },
        warm: async (playerId) => {
            if (!tokens.has(playerId)) tokens.set(playerId, await issueSession(playerId));
            await fetch(`http://127.0.0.1:${port}/api/equipment`, {
                headers: { Authorization: `Bearer ${tokens.get(playerId)}` },
            }).then((r) => r.arrayBuffer());
        },
        burst: async (playerId, n, fn) => {
            await ctx.warm(playerId);
            return Promise.all(Array.from({ length: n }, (_, i) => fn(i)));
        },
        itemTotal: (itemId) => itemTotal(db, itemId),
    };

    // Between rounds, clear only the tables that have rows, with DELETE in
    // foreign-key order (children before the rows they point at). TRUNCATE
    // was most of the run time: TRUNCATE players CASCADE also truncates every
    // table that references players, empty or not, and each one is rebuilt on
    // disk, which is slow on WSL. A round only fills a handful of tables, so
    // deleting those few rows is near free. If the order cannot be settled (a
    // cycle of foreign keys among the filled tables), it falls back to TRUNCATE.
    const { rows: tables } = await db.raw(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'
        AND tablename NOT LIKE 'knex_migrations%'`);
    const whichHaveRows = tables
        .map((t: any) => `SELECT '${t.tablename}' AS t WHERE EXISTS (SELECT 1 FROM "${t.tablename}")`)
        .join(' UNION ALL ');
    const { rows: fkRows } = await db.raw(`
        SELECT DISTINCT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent
        FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.contype = 'f' AND n.nspname = 'public' AND c.conrelid <> c.confrelid`);
    const parentsOf = new Map<string, Set<string>>();
    for (const r of fkRows) {
        const child = String(r.child).replace(/^public\./, '').replace(/"/g, '');
        const parent = String(r.parent).replace(/^public\./, '').replace(/"/g, '');
        if (!parentsOf.has(child)) parentsOf.set(child, new Set());
        parentsOf.get(child)!.add(parent);
    }
    /** Children before parents, or null if the filled tables reference each other in a loop. */
    const deleteOrder = (used: string[]): string[] | null => {
        const left = new Set(used);
        const order: string[] = [];
        while (left.size) {
            // A table can go once nothing still waiting to be cleared points at it.
            const next = [...left].find((t) => ![...left].some((o) => o !== t && parentsOf.get(o)?.has(t)));
            if (!next) return null;
            order.push(next);
            left.delete(next);
        }
        return order;
    };
    const truncateAll = `TRUNCATE ${tables.map((t: any) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`;
    const wipe = async () => {
        const { rows } = await db.raw(whichHaveRows);
        const used = rows.map((r: any) => r.t as string);
        if (!used.length) return;
        const order = deleteOrder(used);
        if (!order) { await db.raw(truncateAll); return; }
        try {
            await db.transaction(async (trx) => {
                for (const t of order) await trx.raw(`DELETE FROM "${t}"`);
            });
        } catch {
            await db.raw(truncateAll);
        }
    };

    // `pnpm race:check H6 C1` runs only those ids; no arguments runs them all.
    const only = process.argv.slice(2).map((a) => a.toLowerCase());
    const chosen = only.length ? SCENARIOS.filter((s) => only.includes(s.id.toLowerCase())) : SCENARIOS;
    if (!chosen.length) refuse(`no scenario has the id ${only.join(' or ')}.`);

    let failed = 0;
    for (const s of chosen) {
        const problems: string[] = [];
        for (let round = 1; round <= s.rounds; round++) {
            await wipe();
            tokens.clear();
            try {
                const broke = await s.run(ctx, round);
                if (broke) problems.push(`round ${round}: ${broke}`);
            } catch (err) {
                problems.push(`round ${round}: threw ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        if (problems.length) failed++;
        const verdict = problems.length ? 'FAIL' : 'ok  ';
        console.log(`${verdict} ${s.id.padEnd(4)} ${s.name} (${s.rounds} rounds)`);
        for (const p of problems.slice(0, 5)) console.log(`       ${p}`);
    }

    console.log(failed
        ? `race:check: ${failed} of ${chosen.length} scenario${chosen.length === 1 ? '' : 's'} FAILED (${Date.now() - started} ms)`
        : `race:check: ${chosen.length === 1 ? 'the scenario' : `all ${chosen.length} scenarios`} held (${Date.now() - started} ms)`);

    const { io } = await import('../index');
    io.close();
    server.close();
    await db.destroy();
    process.exit(failed ? 1 : 0);
}

// ── Where an item can be ───────────────────────────────────────────────────

const SLOT_COLUMNS = [
    'head_item_id', 'neck_item_id', 'back_item_id', 'chest_item_id', 'mainhand_item_id', 'offhand_item_id',
    'legs_item_id', 'hands_item_id', 'feet_item_id', 'finger_item_id', 'mount_item_id', 'trophy_item_id',
];

/** Every copy of an item that exists anywhere: packs, stores, the ground, shop shelves, and worn. */
async function itemTotal(db: Db, itemId: number): Promise<number> {
    const worn = SLOT_COLUMNS.map((c) => `(SELECT count(*) FROM player_equipment WHERE ${c} = $1)`).join(' + ');
    const { rows } = await db.raw(`
        SELECT (SELECT coalesce(sum(quantity), 0) FROM player_inventory WHERE item_id = $1)
             + (SELECT coalesce(sum(quantity), 0) FROM property_storage WHERE item_id = $1)
             + (SELECT coalesce(sum(quantity), 0) FROM ground_items    WHERE item_id = $1)
             + (SELECT coalesce(sum(quantity), 0) FROM shop_listings   WHERE item_id = $1)
             + ${worn} AS total`.replace(/\$1/g, '?'), Array(4 + SLOT_COLUMNS.length).fill(itemId));
    return Number(rows[0].total);
}

// ── A small world ───────────────────────────────────────────────────────────

/** Talador, the in-game test account "Pendragon", a plain item and three wearable ones. */
async function world(ctx: Ctx) {
    const town = await ctx.seed.row('locations', { name: 'Talador' });
    const player = await ctx.seed.row('players', { username: 'Pendragon', email: 'pendragon@racecheck.test', current_location_id: town.id });
    const plank = await ctx.seed.row('items', { name: 'Oak Plank', type: 'material' });
    const hatchet = await ctx.seed.row('items', { name: 'Ambren Hatchet', type: 'tool', slot: 'mainhand', level_required: 1 });
    const axeA = await ctx.seed.row('items', { name: 'Crude Axe', type: 'tool', slot: 'mainhand', level_required: 1 });
    const axeB = await ctx.seed.row('items', { name: 'Chipped Axe', type: 'tool', slot: 'mainhand', level_required: 1 });
    return { town, player, plank, hatchet, axeA, axeB };
}

async function inPack(ctx: Ctx, playerId: number, itemId: number, quantity: number) {
    await ctx.seed.row('player_inventory', { player_id: playerId, item_id: itemId, quantity });
}

async function wearing(ctx: Ctx, playerId: number, column: string, itemId: number) {
    await ctx.seed.row('player_equipment', { player_id: playerId, [column]: itemId });
}

async function homestead(ctx: Ctx, playerId: number, locationId: number, slots = 20) {
    return ctx.seed.row('player_properties', {
        player_id: playerId, location_id: locationId, type: 'homestead', storage_slots: slots,
    });
}

/** A shop in Talador owned by someone other than Pendragon, with the given storage room. */
async function shopWorld(ctx: Ctx, w: Awaited<ReturnType<typeof world>>, storageSlots = 20) {
    const owner = await ctx.seed.row('players', { username: 'Shopkeeper', email: 'keeper@racecheck.test', current_location_id: w.town.id });
    const property = await ctx.seed.row('player_properties', {
        player_id: owner.id, location_id: w.town.id, type: 'shop', storage_slots: storageSlots,
    });
    const shop = await ctx.seed.row('player_shops', { property_id: property.id, name: 'Racecheck Goods', is_open: true });
    return { owner, property, shop };
}

async function storedIn(ctx: Ctx, propertyId: number, itemId: number): Promise<number> {
    const row = await ctx.db('property_storage').where({ property_id: propertyId, item_id: itemId }).first();
    return Number(row?.quantity ?? 0);
}

/**
 * An active trade in Talador: Pendragon offers 10 planks, a second player
 * ("Trader", holding 100 gold) offers 100 gold. Neither has accepted yet and
 * both are looking at offer version 1.
 */
async function tradeWorld(ctx: Ctx, w: Awaited<ReturnType<typeof world>>) {
    const buyer = await ctx.seed.row('players', { username: 'Trader', email: 'trader@racecheck.test', current_location_id: w.town.id });
    await fund(ctx, buyer.id, 100);
    await inPack(ctx, w.player.id, w.plank.id, 10);
    const trade = await ctx.seed.row('trades', {
        player1_id: w.player.id, player2_id: buyer.id, location_id: w.town.id,
        status: 'active', offer_version: 1, player1_accepted: false, player2_accepted: false,
    });
    await ctx.seed.row('trade_offers', { trade_id: trade.id, player_id: w.player.id, item_id: w.plank.id, quantity: 10 });
    await ctx.seed.row('trade_gold', { trade_id: trade.id, player_id: buyer.id, gold_amount: 100 });
    return { buyer, trade };
}

/** A burst where the number of successes legitimately varies: only server errors fail it. */
function noServerErrors(statuses: number[]): string | null {
    const errors = statuses.filter((s) => s >= 500).length;
    return errors ? `${errors} request(s) hit a server error (statuses ${statuses.join(',')}): a race reached the database backstop` : null;
}

function changed(what: string, before: number, after: number): string | null {
    return before === after ? null : `${what} went ${before} -> ${after}`;
}

/** Gold is in two places that must agree: players.gold and the sum of each player's ledger rows. */
async function ledgerProblem(ctx: Ctx): Promise<string | null> {
    const { rows } = await ctx.db.raw(`
        SELECT p.username, p.gold, coalesce(sum(l.delta), 0) AS ledger
        FROM players p LEFT JOIN gold_ledger l ON l.player_id = p.id
        GROUP BY p.id HAVING p.gold <> coalesce(sum(l.delta), 0)`);
    return rows.length ? `gold and ledger disagree for ${rows[0].username}: ${rows[0].gold} vs ${rows[0].ledger}` : null;
}

async function goldOf(ctx: Ctx, playerId: number): Promise<number> {
    return Number((await ctx.db('players').where({ id: playerId }).first()).gold);
}

/** Give a player gold through the ledger, the way the game does, so reconciliation holds. */
async function fund(ctx: Ctx, playerId: number, amount: number) {
    await ctx.db('players').where({ id: playerId }).update({ gold: amount });
    await ctx.seed.row('gold_ledger', { player_id: playerId, delta: amount, balance_after: amount, reason: 'racecheck_seed' });
}

/**
 * How many of a burst must have succeeded. Without this a scenario whose
 * requests were all refused for some unrelated reason (a seeding mistake, a
 * missing requirement) would "hold" while testing nothing.
 */
function succeeded(statuses: number[], expected: number): string | null {
    // A server error is a failure even when every total balances. With the
    // non-negative CHECK constraints in place, a missing lock usually shows up
    // as exactly this: the database refuses the write that would have minted
    // items, and the player gets a 500 instead of a clean refusal.
    const errors = statuses.filter((s) => s >= 500).length;
    if (errors) return `${errors} request(s) hit a server error (statuses ${statuses.join(',')}): a race reached the database backstop`;
    const ok = statuses.filter((s) => s >= 200 && s < 300).length;
    return ok === expected ? null : `expected ${expected} to succeed, ${ok} did (statuses ${statuses.join(',')})`;
}

// ── Scenarios ───────────────────────────────────────────────────────────────

const SCENARIOS: Scenario[] = [
    {
        id: 'C1', name: 'unequip the same worn item five times at once', rounds: 10,
        run: async (ctx) => {
            const w = await world(ctx);
            await wearing(ctx, w.player.id, 'mainhand_item_id', w.hatchet.id);
            const st = await ctx.burst(w.player.id, 5, () => ctx.post(w.player.id, '/equipment/unequip', { slot: 'mainhand' }));
            return changed('hatchets', 1, await ctx.itemTotal(w.hatchet.id)) ?? succeeded(st, 1);
        },
    },
    {
        id: 'C2', name: 'equip two different items over a worn one at once', rounds: 10,
        run: async (ctx) => {
            // Wearing a hatchet and equipping two cheap axes together: both
            // requests used to see the hatchet worn and both returned it to the
            // pack, so one hatchet became two.
            const w = await world(ctx);
            await wearing(ctx, w.player.id, 'mainhand_item_id', w.hatchet.id);
            await inPack(ctx, w.player.id, w.axeA.id, 1);
            await inPack(ctx, w.player.id, w.axeB.id, 1);
            const st = await ctx.burst(w.player.id, 2, (i) =>
                ctx.post(w.player.id, '/equipment/equip', { itemId: i === 0 ? w.axeA.id : w.axeB.id }));
            return changed('hatchets', 1, await ctx.itemTotal(w.hatchet.id))
                ?? changed('crude axes', 1, await ctx.itemTotal(w.axeA.id))
                ?? changed('chipped axes', 1, await ctx.itemTotal(w.axeB.id))
                ?? succeeded(st, 2);
        },
    },
    {
        id: 'C3', name: 'withdraw a full stored stack five times at once', rounds: 10,
        run: async (ctx) => {
            const w = await world(ctx);
            const home = await homestead(ctx, w.player.id, w.town.id);
            await ctx.seed.row('property_storage', { property_id: home.id, item_id: w.plank.id, quantity: 100 });
            const st = await ctx.burst(w.player.id, 5, () => ctx.post(w.player.id, '/property/storage/withdraw', { itemId: w.plank.id, quantity: 100 }));
            return changed('planks', 100, await ctx.itemTotal(w.plank.id)) ?? succeeded(st, 1);
        },
    },
    {
        id: 'C3', name: 'deposit a full pack stack onto a stored stack five times at once', rounds: 10,
        run: async (ctx) => {
            // The store already holds some. The old deposit topped the stored
            // stack up once per request; with an empty store the unique stack
            // rule happened to turn the extras away, which hid the bug.
            const w = await world(ctx);
            const home = await homestead(ctx, w.player.id, w.town.id);
            await ctx.seed.row('property_storage', { property_id: home.id, item_id: w.plank.id, quantity: 5 });
            await inPack(ctx, w.player.id, w.plank.id, 100);
            const st = await ctx.burst(w.player.id, 5, () => ctx.post(w.player.id, '/property/storage/deposit', { itemId: w.plank.id, quantity: 100 }));
            return changed('planks', 105, await ctx.itemTotal(w.plank.id)) ?? succeeded(st, 1);
        },
    },
    {
        id: 'C4', name: 'drop a full stack five times at once', rounds: 10,
        run: async (ctx) => {
            const w = await world(ctx);
            await inPack(ctx, w.player.id, w.plank.id, 100);
            const st = await ctx.burst(w.player.id, 5, () => ctx.post(w.player.id, '/ground-items/drop', { itemId: w.plank.id, quantity: 100 }));
            return changed('planks', 100, await ctx.itemTotal(w.plank.id)) ?? succeeded(st, 1);
        },
    },
    {
        id: 'C4', name: 'drop 30 of 100 five times at once', rounds: 10,
        run: async (ctx) => {
            const w = await world(ctx);
            await inPack(ctx, w.player.id, w.plank.id, 100);
            const st = await ctx.burst(w.player.id, 5, () => ctx.post(w.player.id, '/ground-items/drop', { itemId: w.plank.id, quantity: 30 }));
            // 30, 30, 30, then the last 10; the fifth finds nothing left.
            return changed('planks', 100, await ctx.itemTotal(w.plank.id)) ?? succeeded(st, 4);
        },
    },
    {
        id: 'C5', name: 'load the kiln five times at once from one set of logs', rounds: 10,
        run: async (ctx) => {
            // Forty logs, a twenty-log load sent five times. Exactly one burn
            // may start, and it may take exactly twenty logs.
            const w = await world(ctx);
            const smithing = await ctx.seed.row('skills', { name: 'Smithing' });
            await ctx.seed.row('player_skills', { player_id: w.player.id, skill_id: smithing.id, xp: 0 });
            const logs = await ctx.seed.row('items', { name: 'Poor Oak Log', type: 'log', quality: 'poor', tier: 1 });
            await inPack(ctx, w.player.id, logs.id, 40);
            const st = await ctx.burst(w.player.id, 5, () =>
                ctx.post(w.player.id, '/smithing/kiln/load', { logCount: 20, quality: 'poor' }));
            const jobs = Number((await ctx.db('kiln_jobs').where({ player_id: w.player.id }).count('* as c').first())!.c);
            return (jobs === 1 ? null : `${jobs} burns started from one set of logs`)
                ?? changed('logs', 20, await ctx.itemTotal(logs.id))
                ?? succeeded(st, 1);
        },
    },
    {
        id: 'C5', name: 'collect one finished burn ten times at once', rounds: 20,
        run: async (ctx) => {
            // Collecting is resolved by the tick, not a route, so this calls it
            // the way two overlapping resolves would. A 60-Charc burn pays 60.
            const w = await world(ctx);
            const smithing = await ctx.seed.row('skills', { name: 'Smithing' });
            await ctx.seed.row('player_skills', { player_id: w.player.id, skill_id: smithing.id, xp: 0 });
            const charc = await ctx.seed.row('items', { name: 'Charc', type: 'material' });
            await ctx.seed.row('kiln_jobs', {
                player_id: w.player.id, location_id: w.town.id, logs_added: 20, charc_yield: 60, xp_reward: 50,
                ready_at: new Date(Date.now() - 60_000), is_collected: false,
            });
            const { collectKiln } = await import('../services/smithing');
            const results = await Promise.all(Array.from({ length: 10 }, () => collectKiln(w.player.id, w.town.id)));
            const paid = results.filter((r) => r.success).length;
            return changed('Charc', 60, await ctx.itemTotal(charc.id))
                ?? (paid === 1 ? null : `${paid} collects succeeded`);
        },
    },
    {
        id: 'H3', name: 'hand in one finished quest twenty times at once', rounds: 10,
        run: async (ctx) => {
            // The completion every hand-in goes through. It must flip the quest
            // once and pay 100 gold, two planks and 500 XP exactly once.
            const w = await world(ctx);
            const woodcutting = await ctx.seed.row('skills', { name: 'Woodcutting' });
            const quest = await ctx.seed.row('quests', {
                name: 'The Plank Run', description: 'Bring planks.', npc_name: 'Geonsen', location_id: w.town.id,
                skill: 'Woodcutting', reward_xp: 500, reward_gold: 100,
                reward_items: JSON.stringify([{ itemName: 'Oak Plank', qty: 2 }]),
            });
            const objective = await ctx.seed.row('quest_objectives', {
                quest_id: quest.id, description: 'Talk to Geonsen', type: 'talk', required_amount: 1,
            });
            await ctx.seed.row('player_quests', { player_id: w.player.id, quest_id: quest.id, status: 'active' });
            await ctx.seed.row('player_quest_objectives', {
                player_id: w.player.id, objective_id: objective.id, current_amount: 1, is_complete: true,
            });
            const { checkQuestCompletion } = await import('../routes/quests');
            // allSettled, not all: one hand-in throwing must not hide what the others paid.
            const results = await Promise.allSettled(Array.from({ length: 20 }, () => checkQuestCompletion(w.player.id, quest.id)));
            const paid = results.filter((r) => r.status === 'fulfilled' && r.value).length;
            const xp = await ctx.db('player_skills').where({ player_id: w.player.id, skill_id: woodcutting.id }).first();
            return (paid === 1 ? null : `${paid} hand-ins were paid`)
                ?? changed('gold', 100, await goldOf(ctx, w.player.id))
                ?? changed('reward planks', 2, await ctx.itemTotal(w.plank.id))
                ?? changed('Woodcutting XP', 500, Number(xp?.xp ?? 0))
                ?? await ledgerProblem(ctx);
        },
    },
    {
        id: 'H7', name: 'six buys against a merchant limit of two, at once', rounds: 10,
        run: async (ctx) => {
            const w = await world(ctx);
            await ctx.db('items').where({ id: w.plank.id }).update({ value: 10, is_active: true });
            const merchant = await ctx.seed.row('merchants', { key: 'rc_timber', name: 'Timber Merchant', location_id: w.town.id, sells: true });
            await ctx.seed.row('merchant_stock', { merchant_id: merchant.id, item_id: w.plank.id, is_core: true, min_qty: 2, max_qty: 2 });
            await fund(ctx, w.player.id, 10_000);
            const st = await ctx.burst(w.player.id, 6, () =>
                ctx.post(w.player.id, '/marketplace/buy', { merchantId: merchant.id, itemId: w.plank.id, quantity: 1 }));
            const spent = 10_000 - await goldOf(ctx, w.player.id);
            const bought = await ctx.itemTotal(w.plank.id);
            return changed('planks bought', 2, bought)
                ?? (spent > 0 && spent % 2 === 0 ? null : `charged ${spent}g for ${bought} planks`)
                ?? await ledgerProblem(ctx)
                ?? succeeded(st, 2);
        },
    },
    {
        id: 'shop', name: 'five buyers take three each from a shelf of five, at once', rounds: 10,
        run: async (ctx) => {
            // One shelf, five buyers. Exactly one purchase fits. Goods and gold
            // must both balance: what buyers paid is what the till and the
            // tithe received.
            const w = await world(ctx);
            const s = await shopWorld(ctx, w);
            const listing = await ctx.seed.row('shop_listings', { shop_id: s.shop.id, item_id: w.plank.id, quantity: 5, unit_price: 10 });
            const buyers = [];
            for (let i = 0; i < 5; i++) {
                const b = await ctx.seed.row('players', { username: `Buyer${i}`, email: `buyer${i}@racecheck.test`, current_location_id: w.town.id });
                await fund(ctx, b.id, 1_000);
                buyers.push(b);
            }
            await Promise.all(buyers.map((b) => ctx.warm(b.id)));
            const st = await Promise.all(buyers.map((b) =>
                ctx.post(b.id, '/shops/buy', { listingId: listing.id, quantity: 3, expectedUnitPrice: 10 })));
            const paid = (await Promise.all(buyers.map((b) => goldOf(ctx, b.id)))).reduce((a, g) => a + (1_000 - g), 0);
            const shop = await ctx.db('player_shops').where({ id: s.shop.id }).first();
            const tax = Number((await ctx.db('shop_transactions').sum('tax as t').first())?.t ?? 0);
            return changed('planks', 5, await ctx.itemTotal(w.plank.id))
                ?? (paid === Number(shop.till_gold) + tax ? null : `buyers paid ${paid}g, till got ${shop.till_gold}g and tithe ${tax}g`)
                ?? await ledgerProblem(ctx)
                ?? succeeded(st, 1);
        },
    },
    {
        id: 'H6', name: 'five sells of ten into an order wanting twenty, at once', rounds: 10,
        run: async (ctx) => {
            // Partial fills are normal: the first two fill it, the rest are told
            // it is filled. Nothing may be lost or made on either side.
            const w = await world(ctx);
            const s = await shopWorld(ctx, w);
            await ctx.db('player_shops').where({ id: s.shop.id }).update({ buy_fund_gold: 1_000 });
            const buyOrder = await ctx.seed.row('shop_buy_orders', { shop_id: s.shop.id, item_id: w.plank.id, quantity_wanted: 20, quantity_filled: 0, unit_price: 10 });
            await inPack(ctx, w.player.id, w.plank.id, 50);
            const st = await ctx.burst(w.player.id, 5, () =>
                ctx.post(w.player.id, '/shops/sell', { orderId: buyOrder.id, quantity: 10, expectedUnitPrice: 10 }));
            const order = await ctx.db('shop_buy_orders').where({ id: buyOrder.id }).first();
            const shop = await ctx.db('player_shops').where({ id: s.shop.id }).first();
            const earned = await goldOf(ctx, w.player.id);
            const tax = Number((await ctx.db('shop_transactions').sum('tax as t').first())?.t ?? 0);
            return changed('planks', 50, await ctx.itemTotal(w.plank.id))
                ?? changed('planks in shop storage', 20, await storedIn(ctx, s.property.id, w.plank.id))
                ?? changed('planks filled', 20, Number(order.quantity_filled))
                ?? (1_000 - Number(shop.buy_fund_gold) === earned + tax ? null : `fund paid ${1_000 - Number(shop.buy_fund_gold)}g, seller got ${earned}g, tithe ${tax}g`)
                ?? await ledgerProblem(ctx)
                ?? succeeded(st, 2);
        },
    },
    {
        id: 'H6', name: 'five sells into a shop with no room to store them, at once', rounds: 10,
        run: async (ctx) => {
            // The shop cannot take the goods. Every sale is refused and the
            // seller keeps all of them (this once kept the goods and paid nothing).
            const w = await world(ctx);
            const s = await shopWorld(ctx, w, 0);
            await ctx.db('player_shops').where({ id: s.shop.id }).update({ buy_fund_gold: 1_000 });
            const buyOrder = await ctx.seed.row('shop_buy_orders', { shop_id: s.shop.id, item_id: w.plank.id, quantity_wanted: 20, quantity_filled: 0, unit_price: 10 });
            await inPack(ctx, w.player.id, w.plank.id, 50);
            const st = await ctx.burst(w.player.id, 5, () =>
                ctx.post(w.player.id, '/shops/sell', { orderId: buyOrder.id, quantity: 10, expectedUnitPrice: 10 }));
            const pack = await ctx.db('player_inventory').where({ player_id: w.player.id, item_id: w.plank.id }).first();
            return changed('planks in the seller\'s pack', 50, Number(pack?.quantity ?? 0))
                ?? changed('seller gold', 0, await goldOf(ctx, w.player.id))
                ?? succeeded(st, 0);
        },
    },
    {
        id: 'H4', name: 'offer impossible quantities in a trade, at once', rounds: 5,
        run: async (ctx) => {
            // -50 once reversed the move at accept: the offerer GAINED fifty and
            // the partner lost them. Every one of these must be refused and the
            // table left exactly as it was.
            const w = await world(ctx);
            const t = await tradeWorld(ctx, w);
            const bad: unknown[] = [-50, 0, 'abc', -1.5, '', null];
            const st = await ctx.burst(w.player.id, bad.length, (i) =>
                ctx.post(w.player.id, '/trades/offer/item', { tradeId: t.trade.id, itemId: w.plank.id, quantity: bad[i] }));
            const offers = await ctx.db('trade_offers').where({ trade_id: t.trade.id });
            const trade = await ctx.db('trades').where({ id: t.trade.id }).first();
            return (offers.length === 1 && Number(offers[0].quantity) === 10 ? null : `the table changed: ${JSON.stringify(offers.map((o: any) => o.quantity))}`)
                ?? changed('offer version', 1, Number(trade.offer_version))
                ?? changed('planks', 10, await ctx.itemTotal(w.plank.id))
                ?? succeeded(st, 0);
        },
    },
    {
        id: 'H5', name: 'both sides press accept five times each, at once', rounds: 10,
        run: async (ctx) => {
            // The trade must complete once: ten planks one way, a hundred gold
            // the other, nothing made or lost.
            const w = await world(ctx);
            const t = await tradeWorld(ctx, w);
            await Promise.all([ctx.warm(w.player.id), ctx.warm(t.buyer.id)]);
            const st = await Promise.all(Array.from({ length: 10 }, (_, i) => {
                const who = i % 2 === 0 ? w.player.id : t.buyer.id;
                return ctx.post(who, '/trades/accept', { tradeId: t.trade.id, offerVersion: 1 });
            }));
            const trade = await ctx.db('trades').where({ id: t.trade.id }).first();
            const buyerPlanks = await ctx.db('player_inventory').where({ player_id: t.buyer.id, item_id: w.plank.id }).first();
            return (trade.status === 'completed' ? null : `trade ended ${trade.status}`)
                ?? changed('planks', 10, await ctx.itemTotal(w.plank.id))
                ?? changed('planks received', 10, Number(buyerPlanks?.quantity ?? 0))
                ?? changed('seller gold', 100, await goldOf(ctx, w.player.id))
                ?? changed('buyer gold', 0, await goldOf(ctx, t.buyer.id))
                ?? await ledgerProblem(ctx)
                ?? noServerErrors(st);
        },
    },
    {
        id: 'H5', name: 'the seller pulls the goods as the buyer accepts', rounds: 20,
        run: async (ctx) => {
            // The seller has accepted. The buyer accepts what they see (ten
            // planks for a hundred gold) at the same moment the seller takes the
            // planks off the table. Either the trade completes as the buyer saw
            // it, or nothing moves. It must never take the gold for nothing.
            const w = await world(ctx);
            const t = await tradeWorld(ctx, w);
            await ctx.db('trades').where({ id: t.trade.id }).update({ player1_accepted: true });
            await Promise.all([ctx.warm(w.player.id), ctx.warm(t.buyer.id)]);
            const st = await Promise.all([
                ctx.post(t.buyer.id, '/trades/accept', { tradeId: t.trade.id, offerVersion: 1 }),
                ctx.post(w.player.id, '/trades/offer/item/remove', { tradeId: t.trade.id, itemId: w.plank.id }),
            ]);
            const trade = await ctx.db('trades').where({ id: t.trade.id }).first();
            const buyerGold = await goldOf(ctx, t.buyer.id);
            const buyerPlanks = Number((await ctx.db('player_inventory').where({ player_id: t.buyer.id, item_id: w.plank.id }).first())?.quantity ?? 0);
            const asSeen = trade.status === 'completed'
                ? (buyerGold === 0 && buyerPlanks === 10 ? null : `completed, but the buyer has ${buyerPlanks} planks and ${buyerGold}g`)
                : (buyerGold === 100 && buyerPlanks === 0 ? null : `not completed, but the buyer has ${buyerPlanks} planks and ${buyerGold}g`);
            return asSeen
                ?? changed('planks', 10, await ctx.itemTotal(w.plank.id))
                ?? changed('gold in the world', 100, buyerGold + await goldOf(ctx, w.player.id))
                ?? await ledgerProblem(ctx)
                ?? noServerErrors(st);
        },
    },
    {
        id: 'M3', name: 'resolve a two-input craft ten times with inputs for one', rounds: 10,
        run: async (ctx) => {
            // A box is two planks and a nail. With ten planks and one nail,
            // exactly one box may be made and exactly two planks spent. The old
            // craft consumed the planks, then found the nail gone and returned,
            // destroying them; and once made two boxes from one nail.
            const w = await world(ctx);
            const nail = await ctx.seed.row('items', { name: 'Iron Nail', type: 'material' });
            const box = await ctx.seed.row('items', { name: 'Wooden Box', type: 'material' });
            const recipe = await ctx.seed.row('recipes', {
                skill: 'Carpentry', name: 'Wooden Box', output_item_name: 'Wooden Box', output_qty: 1,
                inputs: JSON.stringify([{ itemName: 'Oak Plank', qty: 2 }, { itemName: 'Iron Nail', qty: 1 }]),
                required_level: 1, timer_seconds: 30, xp: 10, mode: 'active', is_active: true,
            });
            await inPack(ctx, w.player.id, w.plank.id, 10);
            await inPack(ctx, w.player.id, nail.id, 1);
            const { resolveRecipe } = await import('../services/recipes');
            const results = await Promise.allSettled(Array.from({ length: 10 }, () => resolveRecipe(w.player.id, recipe.id)));
            const made = results.filter((r) => r.status === 'fulfilled' && r.value.success).length;
            const crashed = results.filter((r) => r.status === 'rejected'
                || (r.status === 'fulfilled' && !r.value.success && r.value.error === 'Server error')).length;
            return changed('boxes', 1, await ctx.itemTotal(box.id))
                ?? changed('planks', 8, await ctx.itemTotal(w.plank.id))
                ?? changed('nails', 0, await ctx.itemTotal(nail.id))
                ?? (made === 1 ? null : `${made} crafts reported success`)
                ?? (crashed ? `${crashed} craft(s) hit a server error` : null);
        },
    },
];

main().catch((err) => {
    console.error('race:check crashed:', err);
    process.exit(1);
});
