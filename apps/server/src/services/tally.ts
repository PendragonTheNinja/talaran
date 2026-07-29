import db from '../db';
import { logger } from '../lib/logger';
import { levelFromXp } from './xp';

// The Tally Board (see 20260726060000_tally_board for the design rationale).
//
// Reports every piece of passive work you have running, read while standing at
// the board. Traps are deliberately absent: a trapline sits in a forest with
// nobody watching it, and trapping's scavenger penalty is a designed mechanic
// rather than an inconvenience to be engineered away.

const CARPENTRY_REQ = 5;
const BUILD_SECONDS = 60;

// Modest against the farmstead's 500/500/1000. This is a noticeboard, not a barn.
const BUILD_COST = [
    { itemName: 'Lanai Planks', qty: 50 },
    { itemName: 'Ambren Nails', qty: 100 },
];

export interface TallyEntry {
    kind: 'field' | 'vat' | 'kiln';
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
    boardLocationId: number | null;
    boardLocationName: string | null;
    atBoard: boolean;
    entries: TallyEntry[];
    readyCount: number;
    /** Present when the player has no board yet. */
    build?: {
        carpentryRequired: number;
        seconds: number;
        cost: { itemName: string; qty: number }[];
        missing: { itemName: string; qty: number; have: number }[];
        canBuild: boolean;
        wouldRelocate: boolean;
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
    const board = await db('tally_boards').where({ player_id: playerId }).first();

    let boardLocationName: string | null = null;
    if (board) {
        const loc = await db('locations').where({ id: board.location_id }).first();
        boardLocationName = loc?.name ?? null;
    }

    const atBoard = !!board && board.location_id === player?.current_location_id;

    // Only compute the report when it can actually be read. Standing at the board
    // is the cost that keeps this a place rather than a menu.
    const entries = atBoard ? await passiveWork(playerId) : [];

    const level = await carpentryLevel(playerId);
    const missing: { itemName: string; qty: number; have: number }[] = [];
    for (const c of BUILD_COST) {
        const have = await inventoryQty(playerId, c.itemName);
        if (have < c.qty) missing.push({ itemName: c.itemName, qty: c.qty, have });
    }

    return {
        hasBoard: !!board,
        boardLocationId: board?.location_id ?? null,
        boardLocationName,
        atBoard,
        entries,
        readyCount: entries.filter((e) => e.status === 'ready').length,
        build: {
            carpentryRequired: CARPENTRY_REQ,
            seconds: BUILD_SECONDS,
            cost: BUILD_COST,
            missing,
            canBuild: level >= CARPENTRY_REQ && missing.length === 0,
            wouldRelocate: !!board && board.location_id !== player?.current_location_id,
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

    const board = await db('tally_boards').where({ player_id: playerId }).first();
    if (!board) return true;                                   // nothing built yet
    if (board.location_id === player.current_location_id) return true;  // read it here

    const here = await db('locations').where({ id: player.current_location_id }).first();
    const there = await db('locations').where({ id: board.location_id }).first();

    // Different island: a board there is no use here, so offer to raise one.
    if (!here?.region || !there?.region) return true;
    return here.region !== there.region;
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

        const existing = await db('tally_boards').where({ player_id: playerId }).first();
        if (existing && existing.location_id === player.current_location_id) {
            return { success: false, error: 'Your tally board already stands here.' };
        }

        const level = await carpentryLevel(playerId);
        if (level < CARPENTRY_REQ) {
            return { success: false, error: `Raising a tally board wants Carpentry ${CARPENTRY_REQ}.` };
        }

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

            await trx('tally_boards')
                .insert({ player_id: playerId, location_id: player.current_location_id })
                .onConflict(['player_id'])
                .merge(['location_id', 'updated_at']);
        });

        logger.info(`Player ${playerId} ${existing ? 'moved' : 'raised'} a tally board at location ${player.current_location_id}`);
        return { success: true, relocated: !!existing };
    } catch (err) {
        logger.error(`Tally board build error: ${err}`);
        return { success: false, error: 'The board could not be raised.' };
    }
}

export { BUILD_COST as TALLY_BUILD_COST, CARPENTRY_REQ as TALLY_CARPENTRY_REQ, BUILD_SECONDS as TALLY_BUILD_SECONDS };
