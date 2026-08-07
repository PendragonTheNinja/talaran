import db from '../db';
import { logger } from '../lib/logger';
import { levelFromXp } from './xp';
import { husbandryTallyEntries } from './husbandry';

// The Tally Board (see 20260726060000_tally_board for the design rationale).
//
// Reports every piece of passive work you have running, read while standing at
// the board. Traps are deliberately absent: a trapline sits in a forest with
// nobody watching it, and trapping's scavenger penalty is a designed mechanic
// rather than an inconvenience to be engineered away.

const CARPENTRY_REQ = 5;
const BUILD_SECONDS = 60;

/**
 * How many boards a player may keep: the first, plus one per ten Carpentry
 * levels. 5 (the build requirement) allows 1, 10 allows 2, 20 allows 3.
 */
export function boardCapForLevel(level: number): number {
    return 1 + Math.floor(level / 10);
}

// Modest against the farmstead's 500/500/1000. This is a noticeboard, not a barn.
const BUILD_COST = [
    { itemName: 'Lanai Planks', qty: 50 },
    { itemName: 'Ambren Nails', qty: 100 },
];

export interface TallyEntry {
    kind: 'field' | 'vat' | 'kiln' | 'pen';
    what: string;
    where: string;
    island: string;
    /** 'ready' | 'working' | 'idle' */
    status: 'ready' | 'working' | 'idle';
    readyAt: string | null;
    detail: string;
}

export interface TallyReport {
    hasBoard: boolean;
    /** The board being read right now, when standing at one. */
    boardLocationId: number | null;
    boardLocationName: string | null;
    atBoard: boolean;
    /** Every board this player keeps, for the "your boards" list. */
    boards: { locationId: number; locationName: string; island: string; here: boolean }[];
    boardCap: number;
    entries: TallyEntry[];
    readyCount: number;
    /** Present when the player has no board yet. */
    build?: {
        carpentryRequired: number;
        seconds: number;
        cost: { itemName: string; qty: number }[];
        missing: { itemName: string; qty: number; have: number }[];
        canBuild: boolean;
        /** True when at capacity: building here moves an existing board instead. */
        wouldRelocate: boolean;
        atCapacity: boolean;
    };
}

async function inventoryQty(playerId: number, itemName: string): Promise<number> {
    const row = await db('player_inventory')
        .join('items', 'player_inventory.item_id', 'items.id')
        .where({ 'player_inventory.player_id': playerId, 'items.name': itemName })
        .select('player_inventory.quantity')
        .first();
    return row ? Number(row.quantity) : 0;
}

async function carpentryLevel(playerId: number): Promise<number> {
    const skill = await db('skills').where({ name: 'Carpentry' }).first();
    if (!skill) return 1;
    const row = await db('player_skills')
        .where({ player_id: playerId, skill_id: skill.id })
        .first();
    return row ? levelFromXp(parseInt(row.xp)) : 1;
}

/**
 * Everything passive the player has running, newest deadline first.
 *
 * Three sources, all keyed differently, which is why this lives in one place:
 * kilns and vats are per-location jobs, fields hang off a property.
 */
export async function passiveWork(playerId: number): Promise<TallyEntry[]> {
    const entries: TallyEntry[] = [];
    const now = Date.now();

    const status = (readyAt: Date | string | null): 'ready' | 'working' =>
        readyAt && new Date(readyAt).getTime() <= now ? 'ready' : 'working';

    // ── Kilns ───────────────────────────────────────────────────────────────
    const kilns = await db('kiln_jobs')
        .leftJoin('locations', 'kiln_jobs.location_id', 'locations.id')
        .where({ 'kiln_jobs.player_id': playerId, 'kiln_jobs.is_collected': false })
        .select(
            'kiln_jobs.charc_yield',
            'kiln_jobs.ready_at',
            'locations.name as location_name',
            'locations.region as island',
        );

    for (const k of kilns) {
        entries.push({
            kind: 'kiln',
            what: 'Kiln',
            where: k.location_name || 'Unknown',
            island: k.island || '',
            status: status(k.ready_at),
            readyAt: k.ready_at ? new Date(k.ready_at).toISOString() : null,
            detail: `${k.charc_yield} Charc`,
        });
    }

    // ── Tanning vats ────────────────────────────────────────────────────────
    const vats = await db('tanning_jobs')
        .leftJoin('locations', 'tanning_jobs.location_id', 'locations.id')
        .where({ 'tanning_jobs.player_id': playerId, 'tanning_jobs.is_collected': false })
        .select(
            'tanning_jobs.hide_count',
            'tanning_jobs.buckskin_yield',
            'tanning_jobs.ready_at',
            'locations.name as location_name',
            'locations.region as island',
        );

    for (const v of vats) {
        entries.push({
            kind: 'vat',
            what: 'Tanning vat',
            where: v.location_name || 'Unknown',
            island: v.island || '',
            status: status(v.ready_at),
            readyAt: v.ready_at ? new Date(v.ready_at).toISOString() : null,
            detail: `${v.hide_count} hides, ${v.buckskin_yield} out`,
        });
    }

    // ── Fields ──────────────────────────────────────────────────────────────
    const plots = await db('farm_plots')
        .join('player_properties', 'farm_plots.property_id', 'player_properties.id')
        .leftJoin('locations', 'player_properties.location_id', 'locations.id')
        .leftJoin('crops', 'farm_plots.crop_id', 'crops.id')
        .where('player_properties.player_id', playerId)
        .select(
            'farm_plots.slot_index',
            'farm_plots.state',
            'farm_plots.soil_state',
            'farm_plots.seed_count',
            'farm_plots.ready_at',
            'farm_plots.tended',
            'crops.name as crop_name',
            'locations.name as location_name',
            'locations.region as island',
        );

    for (const p of plots) {
        // A field is only "work" when something is in it. Empty and tilled ground
        // is reported as idle so a player can see what is waiting to be sown.
        const isGrowing = p.state === 'growing' || p.state === 'ready';

        entries.push({
            kind: 'field',
            what: `Field ${p.slot_index + 1}`,
            where: p.location_name || 'Unknown',
            island: p.island || '',
            status: isGrowing ? status(p.ready_at) : 'idle',
            readyAt: isGrowing && p.ready_at ? new Date(p.ready_at).toISOString() : null,
            detail: isGrowing
                ? `${p.crop_name || 'Crop'}, ${p.seed_count} sown${p.tended ? ', tended' : ''}`
                : p.state === 'tilled'
                    ? `Tilled, ${p.soil_state} soil, nothing sown`
                    : `Bare, ${p.soil_state} soil`,
        });
    }

    // ── Pens ────────────────────────────────────────────────────────────────
    // Summarised by services/husbandry, which owns the pause-aware clocks.
    for (const pen of await husbandryTallyEntries(playerId)) {
        entries.push({ kind: 'pen', ...pen });
    }

    // Ready first, then soonest, then idle last.
    const rank = (e: TallyEntry) => (e.status === 'ready' ? 0 : e.status === 'working' ? 1 : 2);
    entries.sort((a, b) => {
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        if (a.readyAt && b.readyAt) return a.readyAt.localeCompare(b.readyAt);
        return a.where.localeCompare(b.where);
    });

    return entries;
}

export async function tallyReport(playerId: number): Promise<TallyReport> {
    const player = await db('players').where({ id: playerId }).first();

    const boardRows = await db('tally_boards')
        .leftJoin('locations', 'tally_boards.location_id', 'locations.id')
        .where({ 'tally_boards.player_id': playerId })
        .select(
            'tally_boards.location_id',
            'locations.name as location_name',
            'locations.region as island',
        )
        .orderBy('locations.name');

    const boards = boardRows.map((b) => ({
        locationId: b.location_id,
        locationName: b.location_name ?? 'Unknown',
        island: b.island ?? '',
        here: b.location_id === player?.current_location_id,
    }));

    const boardHere = boards.find((b) => b.here) ?? null;
    const atBoard = !!boardHere;

    // Only compute the report when it can actually be read. Standing at the board
    // is the cost that keeps this a place rather than a menu.
    const entries = atBoard ? await passiveWork(playerId) : [];

    const level = await carpentryLevel(playerId);
    const missing: { itemName: string; qty: number; have: number }[] = [];
    for (const c of BUILD_COST) {
        const have = await inventoryQty(playerId, c.itemName);
        if (have < c.qty) missing.push({ itemName: c.itemName, qty: c.qty, have });
    }

    const cap = boardCapForLevel(level);
    const atCapacity = boards.length >= cap;

    return {
        hasBoard: boards.length > 0,
        boardLocationId: boardHere?.locationId ?? boards[0]?.locationId ?? null,
        boardLocationName: boardHere?.locationName ?? boards[0]?.locationName ?? null,
        atBoard,
        boards,
        boardCap: cap,
        entries,
        readyCount: entries.filter((e) => e.status === 'ready').length,
        build: {
            carpentryRequired: CARPENTRY_REQ,
            seconds: BUILD_SECONDS,
            cost: BUILD_COST,
            missing,
            canBuild: level >= CARPENTRY_REQ && missing.length === 0 && !atBoard,
            // At capacity a new board displaces an old one; below it, it is simply
            // an addition and nothing is torn down.
            wouldRelocate: atCapacity && !atBoard && boards.length > 0,
            atCapacity,
        },
    };
}

/**
 * Whether the location menu should offer the Tally Board here.
 *
 * Decided on the server so the client stays dumb: one request, one boolean, no
 * duplicated rules about islands and board placement.
 *
 * With the setting on, the link is hidden only where it would be pure clutter —
 * that is, on an island where a board already stands, anywhere other than the
 * board itself. It still shows AT the board (you need to read it) and on islands
 * with no board of yours (you may want to raise one).
 */
export async function shouldShowLocationLink(playerId: number): Promise<boolean> {
    const player = await db('players').where({ id: playerId }).first();
    if (!player?.current_location_id) return true;

    const settings = await db('player_settings').where({ player_id: playerId }).first();
    if (!settings?.hide_tally_when_built) return true;

    const boards = await db('tally_boards')
        .leftJoin('locations', 'tally_boards.location_id', 'locations.id')
        .where({ 'tally_boards.player_id': playerId })
        .select('tally_boards.location_id', 'locations.region');

    if (!boards.length) return true;                                          // nothing built yet
    if (boards.some((b) => b.location_id === player.current_location_id)) return true;  // read it here

    const here = await db('locations').where({ id: player.current_location_id }).first();
    if (!here?.region) return true;

    // Hide only where a board of yours already covers this island; elsewhere,
    // keep offering, since with several boards allowed the answer is often yes.
    return !boards.some((b) => b.region && b.region === here.region);
}

export interface BuildResult {
    success: boolean;
    error?: string;
    relocated?: boolean;
}

/**
 * Raise the board here, or move it here if one already stands elsewhere.
 * Materials are charged either way.
 */
export async function buildTallyBoard(playerId: number): Promise<BuildResult> {
    try {
        const player = await db('players').where({ id: playerId }).first();
        if (!player?.current_location_id) {
            return { success: false, error: 'You are nowhere in particular.' };
        }

        const boards = await db('tally_boards').where({ player_id: playerId }).orderBy('id', 'asc');
        if (boards.some((b) => b.location_id === player.current_location_id)) {
            return { success: false, error: 'Your tally board already stands here.' };
        }

        const level = await carpentryLevel(playerId);
        if (level < CARPENTRY_REQ) {
            return { success: false, error: `Raising a tally board wants Carpentry ${CARPENTRY_REQ}.` };
        }

        // Under the cap this is a new board; at the cap the oldest one comes down
        // to pay for it, which is the original one-board behaviour preserved.
        const cap = boardCapForLevel(level);
        const relocating = boards.length >= cap;
        const displaced = relocating ? boards[0] : null;

        for (const c of BUILD_COST) {
            const have = await inventoryQty(playerId, c.itemName);
            if (have < c.qty) {
                return { success: false, error: `You need ${c.qty} ${c.itemName}. You have ${have}.` };
            }
        }

        // Materials and placement together: a partial build would leave a player
        // charged for a board that does not exist.
        await db.transaction(async (trx) => {
            for (const c of BUILD_COST) {
                const row = await trx('player_inventory')
                    .join('items', 'player_inventory.item_id', 'items.id')
                    .where({ 'player_inventory.player_id': playerId, 'items.name': c.itemName })
                    .select('player_inventory.id', 'player_inventory.quantity')
                    .first();

                if (!row || Number(row.quantity) < c.qty) {
                    throw new Error(`insufficient ${c.itemName}`);
                }

                if (Number(row.quantity) === c.qty) {
                    await trx('player_inventory').where({ id: row.id }).delete();
                } else {
                    await trx('player_inventory').where({ id: row.id }).decrement('quantity', c.qty);
                }
            }

            if (displaced) {
                await trx('tally_boards').where({ id: displaced.id }).delete();
            }
            await trx('tally_boards')
                .insert({ player_id: playerId, location_id: player.current_location_id });
        });

        logger.info(
            `Player ${playerId} ${relocating ? 'moved' : 'raised'} a tally board at location ${player.current_location_id}`
            + ` (${relocating ? boards.length : boards.length + 1}/${cap})`,
        );
        return { success: true, relocated: relocating };
    } catch (err) {
        logger.error(`Tally board build error: ${err}`);
        return { success: false, error: 'The board could not be raised.' };
    }
}

export { BUILD_COST as TALLY_BUILD_COST, CARPENTRY_REQ as TALLY_CARPENTRY_REQ, BUILD_SECONDS as TALLY_BUILD_SECONDS };
