import db from '../db';
import { logger } from '../lib/logger';
import { levelFromXp } from './xp';
import { getGold, debitGoldWithin } from './gold';
import { husbandryTallyEntries } from './husbandry';
import { takeItemsWithin, addItemToInventoryWithin } from './inventory';
import { listWords } from '../lib/listWords';
import { islandHere, TAIAR } from './islands';

// The Tally Board (see 20260726060000_tally_board for the design rationale).
//
// Reports every piece of passive work you have running, read while standing at
// the board. Traps are deliberately absent: a trapline sits in a forest with
// nobody watching it, and trapping's scavenger penalty is a designed mechanic
// rather than an inconvenience to be engineered away.

export const CARPENTRY_REQ = 5;
const BUILD_SECONDS = 60;

/**
 * Licences, not Carpentry levels.
 *
 * The cap used to be 1 + floor(carpentry / 10), which meant ten levels of an
 * unrelated trade per board of pure information. It is now bought: gold for the
 * licence, total level for the right to buy it.
 *
 * Total level is the gate because breadth is what a tally board serves. Someone
 * with a coop at Novita, crops at their homestead and a kiln at Emberra has
 * something to watch; someone who has spent three hundred hours on one skill in
 * one place does not. Spreading evenly across the twelve skills reaches total 60
 * in roughly sixty hours, while one skill at 50 takes three hundred and sixty
 * hours to reach total 61, so the two playstyles separate sharply.
 *
 *   board 2:  total  40,    250g
 *   board 3:  total  75,  1,000g
 *   board 4:  total 120,  2,250g
 *   board 5:  total 175,  4,000g
 *   board 6:  total 240,  6,250g
 *
 * Both curves are quadratic, so the second board is nearly free and arrives in
 * an evening, and the tenth is a genuine undertaking. The level gate self-caps
 * at fourteen boards when total level maxes at 1,200, so no ceiling is needed.
 */
export function licenceTotalLevel(boardNumber: number): number {
    return 5 * boardNumber * boardNumber + 10 * boardNumber;
}

export function licenceCost(boardNumber: number): number {
    return 250 * Math.pow(boardNumber - 1, 2);
}

/** The board a purchase would grant, given how many are already licensed. */
export function nextBoardNumber(licences: number): number {
    return licences + 1;
}

/**
 * Boards, licences, and what a board shows are per island (Nathan, 2026-11-19).
 * A place with no region is counted as Taiar's, as everywhere else does.
 */
export function islandOfRegion(region: string | null | undefined): string {
    return region || TAIAR.name;
}

/** How many boards the player may keep on `island`. No row is one. */
export async function boardCapFor(playerId: number, island: string, x: any = db): Promise<number> {
    const row = await x('player_tally_licences').where({ player_id: playerId, island }).first('licences');
    return Math.max(1, Number(row?.licences ?? 1));
}

/**
 * Sum of every non-combat skill level. The breadth measure the licence gate
 * reads. Combat is left out on purpose (docs/combat-spec.md §2): a kill pays
 * three skills at once, so counting them would make fighting the shortcut to
 * tally boards.
 */
export async function totalLevel(playerId: number): Promise<number> {
    const rows = await db('player_skills as ps')
        .join('skills as s', 's.id', 'ps.skill_id')
        .where('ps.player_id', playerId)
        .andWhere('s.is_implemented', true)
        .andWhereNot('s.type', 'combat')
        .select('ps.xp');
    return rows.reduce((sum: number, r: { xp: string | number }) => sum + levelFromXp(Number(r.xp || 0)), 0);
}

export interface LicenceOffer {
    island: string;
    boardNumber: number;
    cost: number;
    totalLevelRequired: number;
    totalLevel: number;
    gold: number;
    canBuy: boolean;
    reason?: string;
}

export async function licenceOffer(playerId: number, island: string): Promise<LicenceOffer> {
    const licences = await boardCapFor(playerId, island);
    const boardNumber = nextBoardNumber(licences);
    const cost = licenceCost(boardNumber);
    const need = licenceTotalLevel(boardNumber);
    const [have, gold] = await Promise.all([totalLevel(playerId), getGold(playerId)]);

    let reason: string | undefined;
    // Combat skills are left out of this total (see totalLevel), so it is named
    // as such: a player comparing it with the Skills page saw two numbers.
    if (have < need) reason = `A licence for a ${ordinal(boardNumber)} board on ${island} wants a total level of ${need} outside combat. Yours is ${have}.`;
    else if (gold < cost) reason = `That licence costs ${cost} gold. You have ${gold}.`;

    return {
        island, boardNumber, cost, totalLevelRequired: need,
        totalLevel: have, gold, canBuy: !reason, reason,
    };
}

export function ordinal(n: number): string {
    const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th'
        : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
    return `${n}${suffix}`;
}

/**
 * Buys the right to keep one more board on the island the player stands on.
 * The licence is permanent and the board still has to be built with
 * materials afterwards.
 */
export async function buyLicence(playerId: number): Promise<{ success: boolean; error?: string; licences?: number; gold?: number }> {
    const island = (await islandHere(db, playerId)).name;
    const offer = await licenceOffer(playerId, island);
    if (!offer.canBuy) return { success: false, error: offer.reason };

    // Re-checked inside the transaction: the offer above was read outside it,
    // and gold can move between the two.
    let licences = 0;
    let gold = 0;
    try {
        await db.transaction(async (trx) => {
            await trx('players').where({ id: playerId }).forNoKeyUpdate().first('id');
            // The first licence on an island has no row yet: make it, then lock it.
            await trx.raw(
                'INSERT INTO player_tally_licences (player_id, island, licences) VALUES (?, ?, 1) ON CONFLICT (player_id, island) DO NOTHING',
                [playerId, island]);
            const row = await trx('player_tally_licences').where({ player_id: playerId, island }).forUpdate().first('licences');
            const current = Math.max(1, Number(row?.licences ?? 1));
            if (current !== offer.boardNumber - 1) throw new Error('RACE');

            const paid = await debitGoldWithin(trx, {
                playerId,
                amount: offer.cost,
                reason: 'tally_licence',
                refType: 'tally',
                refId: offer.boardNumber,
            });
            if (!paid.ok) throw new Error('SHORT_GOLD');

            licences = current + 1;
            gold = paid.balance;
            await trx('player_tally_licences').where({ player_id: playerId, island }).update({ licences });
        });
    } catch (err) {
        const msg = String(err);
        if (msg.includes('SHORT_GOLD')) return { success: false, error: 'You cannot afford that licence.' };
        if (msg.includes('RACE')) return { success: false, error: 'Try that again.' };
        throw err;
    }

    return { success: true, licences, gold };
}

// Modest against the farmstead's 500/500/1000. This is a noticeboard, not a barn.
// Each island's board is built from that island's planks and nails (Nathan,
// 2026-11-19), so a tier brings new ones only where it has a new wood or metal:
// Antura keeps Lanai and nails with Serph.
export const TALLY_COST_BY_TIER: Record<number, { itemName: string; qty: number }[]> = {
    1: [{ itemName: 'Lanai Planks', qty: 50 }, { itemName: 'Ambren Nails', qty: 100 }],
    2: [{ itemName: 'Lanai Planks', qty: 50 }, { itemName: 'Serph Nails', qty: 100 }],
};

/** Taiar's, and what every board raised before islands had their own was made of. */
export const BUILD_COST = TALLY_COST_BY_TIER[1];

/** What a board costs on an island of `tier`: the highest tier listed at or below it. */
export function tallyCostForTier(tier: number): { itemName: string; qty: number }[] {
    const tiers = Object.keys(TALLY_COST_BY_TIER).map(Number).filter(t => t <= tier).sort((a, b) => b - a);
    return TALLY_COST_BY_TIER[tiers[0] ?? 1];
}

/** What went into a board, read from its row; older boards are Taiar's. */
function boardMaterials(raw: unknown): { itemName: string; qty: number }[] {
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(list) && list.length ? list : BUILD_COST;
}

export interface TallyEntry {
    kind: 'field' | 'vat' | 'kiln' | 'pen' | 'fire' | 'cask';
    what: string;
    where: string;
    island: string;
    /** 'ready' | 'working' | 'idle' */
    status: 'ready' | 'working' | 'idle';
    readyAt: string | null;
    detail: string;
}

export interface TallyReport {
    /** The island the player stands on: the boards, licences, and report here are its own. */
    island: string;
    hasBoard: boolean;
    /** The board being read right now, when standing at one. */
    boardLocationId: number | null;
    boardLocationName: string | null;
    atBoard: boolean;
    /** Every board this player keeps on this island, first raised first, for the "your boards" list. */
    boards: { locationId: number; locationName: string; island: string; here: boolean; movesNext: boolean }[];
    boardCap: number;
    licence: LicenceOffer;
    entries: TallyEntry[];
    readyCount: number;
    /** Boards the player keeps on other islands, which show nothing here. */
    elsewhere: { island: string; count: number }[];
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
export async function passiveWork(playerId: number, island?: string): Promise<TallyEntry[]> {
    let entries: TallyEntry[] = [];
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

    // ── Casks ───────────────────────────────────────────────────────────────
    const casks = await db('brew_jobs')
        .leftJoin('locations', 'brew_jobs.location_id', 'locations.id')
        .where({ 'brew_jobs.player_id': playerId, 'brew_jobs.is_collected': false })
        .select('brew_jobs.ale_yield', 'brew_jobs.ready_at', 'locations.name as location_name', 'locations.region as island');
    for (const c of casks) {
        entries.push({
            kind: 'cask',
            what: 'Cask',
            where: c.location_name || 'Unknown',
            island: c.island || '',
            status: status(c.ready_at),
            readyAt: c.ready_at ? new Date(c.ready_at).toISOString() : null,
            detail: `${c.ale_yield} Ale`,
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

    // ── Fires ───────────────────────────────────────────────────────────────
    // A cookhouse hearth burns its fuel down (fuel_until) and a campfire goes
    // out (expires_at); either is worth knowing before you walk to it.
    const fires = await db('workstations')
        .leftJoin('locations', 'workstations.location_id', 'locations.id')
        .where('workstations.player_id', playerId)
        .where(q => q.where('workstations.fuel_until', '>', new Date(now)).orWhere('workstations.expires_at', '>', new Date(now)))
        .select('workstations.type', 'workstations.fuel_until', 'workstations.expires_at', 'locations.name as location_name', 'locations.region as island');
    for (const f of fires) {
        const campfire = !!f.expires_at;
        const outAt = campfire ? f.expires_at : f.fuel_until;
        entries.push({
            kind: 'fire',
            what: campfire ? 'Campfire' : 'Hearth fire',
            where: f.location_name || 'Unknown',
            island: f.island || '',
            status: 'working',
            readyAt: new Date(outAt).toISOString(),
            detail: 'Burning; the time is when it goes out',
        });
    }

    // ── Pens ────────────────────────────────────────────────────────────────
    // Summarised by services/husbandry, which owns the pause-aware clocks.
    for (const pen of await husbandryTallyEntries(playerId)) {
        entries.push({ kind: 'pen', ...pen });
    }

    // A board shows only its own island's work (Nathan, 2026-11-19).
    if (island) entries = entries.filter(e => islandOfRegion(e.island) === island);

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
    const islandRow = await islandHere(db, playerId);
    const island = islandRow.name;

    const allBoards = await db('tally_boards')
        .leftJoin('locations', 'tally_boards.location_id', 'locations.id')
        .where({ 'tally_boards.player_id': playerId })
        .select(
            'tally_boards.location_id',
            'locations.name as location_name',
            'locations.region as island',
        )
        // First raised first: the oldest is the one a new board would move.
        .orderBy('tally_boards.id');
    const boardRows = allBoards.filter((b: any) => islandOfRegion(b.island) === island);
    const elsewhere = new Map<string, number>();
    for (const b of allBoards) {
        const name = islandOfRegion(b.island);
        if (name !== island) elsewhere.set(name, (elsewhere.get(name) ?? 0) + 1);
    }

    const capForOrder = await boardCapFor(playerId, island);
    const boards = boardRows.map((b, i) => ({
        locationId: b.location_id,
        locationName: b.location_name ?? 'Unknown',
        island: islandOfRegion(b.island),
        here: b.location_id === player?.current_location_id,
        movesNext: i === 0 && boardRows.length >= capForOrder,
    }));

    const boardHere = boards.find((b) => b.here) ?? null;
    const atBoard = !!boardHere;

    // Only compute the report when it can actually be read. Standing at the board
    // is the cost that keeps this a place rather than a menu.
    const entries = atBoard ? await passiveWork(playerId, island) : [];

    const level = await carpentryLevel(playerId);
    const cost = tallyCostForTier(islandRow.tier);
    const missing: { itemName: string; qty: number; have: number }[] = [];
    for (const c of cost) {
        const have = await inventoryQty(playerId, c.itemName);
        if (have < c.qty) missing.push({ itemName: c.itemName, qty: c.qty, have });
    }

    const cap = capForOrder;
    const atCapacity = boards.length >= cap;

    return {
        island,
        hasBoard: boards.length > 0,
        boardLocationId: boardHere?.locationId ?? boards[0]?.locationId ?? null,
        boardLocationName: boardHere?.locationName ?? boards[0]?.locationName ?? null,
        atBoard,
        boards,
        boardCap: cap,
        licence: await licenceOffer(playerId, island),
        elsewhere: [...elsewhere].map(([name, count]) => ({ island: name, count })),
        entries,
        readyCount: entries.filter((e) => e.status === 'ready').length,
        build: {
            carpentryRequired: CARPENTRY_REQ,
            seconds: BUILD_SECONDS,
            cost,
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

    // Never on an islet: a landing is brief and nobody can walk back to a board
    // there (Nathan, 2026-11-26). buildTallyBoard refuses one there too.
    const at = await db('locations').where({ id: player.current_location_id }).first('islet_kind');
    if (at?.islet_kind) return false;

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
        // Never on an islet (Nathan, 2026-11-26): a landing is brief, and
        // nobody can walk back to a board left there.
        const site = await db('locations').where({ id: player.current_location_id }).first('islet_kind');
        if (site?.islet_kind) {
            return { success: false, error: 'There is nowhere on an islet to raise a tally board. Build it ashore.' };
        }

        const islandRow = await islandHere(db, playerId);
        const island = islandRow.name;
        const cost = tallyCostForTier(islandRow.tier);
        const onIsland = (x: any) => x('tally_boards as tb').leftJoin('locations as l', 'l.id', 'tb.location_id')
            .where('tb.player_id', playerId).orderBy('tb.id', 'asc').select('tb.id', 'tb.location_id', 'l.region')
            .then((rows: any[]) => rows.filter(r => islandOfRegion(r.region) === island));
        const boards = await onIsland(db);
        if (boards.some((b: any) => b.location_id === player.current_location_id)) {
            return { success: false, error: 'Your tally board already stands here.' };
        }

        const level = await carpentryLevel(playerId);
        if (level < CARPENTRY_REQ) {
            return { success: false, error: `Raising a tally board wants Carpentry ${CARPENTRY_REQ}.` };
        }

        // Under the cap this is a new board; at the cap the oldest one on this
        // island comes down to pay for it, which is the original one-board
        // behaviour preserved.
        const cap = await boardCapFor(playerId, island);
        const relocating = boards.length >= cap;
        const displaced = relocating ? boards[0] : null;

        for (const c of cost) {
            const have = await inventoryQty(playerId, c.itemName);
            if (have < c.qty) {
                return { success: false, error: `You need ${c.qty} ${c.itemName}. You have ${have}.` };
            }
        }

        // Materials and placement together, with the player's row locked so two
        // builds at once cannot both pass the cap or both spend the planks.
        await db.transaction(async (trx) => {
            await trx('players').where({ id: playerId }).forNoKeyUpdate().first('id');
            const now = await onIsland(trx);
            if (now.some((b: any) => b.location_id === player.current_location_id)) throw new Error('ALREADY_HERE');
            if (now.length !== boards.length) throw new Error('RACE');

            const taken = await takeItemsWithin(trx, playerId, cost.map(c => ({ name: c.itemName, quantity: c.qty })));
            if (!taken.ok) throw new Error(`insufficient materials`);

            if (displaced) {
                await trx('tally_boards').where({ id: displaced.id }).delete();
            }
            await trx('tally_boards')
                .insert({ player_id: playerId, location_id: player.current_location_id, materials: JSON.stringify(cost) });
        });

        logger.info(
            `Player ${playerId} ${relocating ? 'moved' : 'raised'} a tally board on ${island} at location ${player.current_location_id}`
            + ` (${relocating ? boards.length : boards.length + 1}/${cap})`,
        );
        return { success: true, relocated: relocating };
    } catch (err) {
        const m = String(err);
        if (m.includes('ALREADY_HERE')) return { success: false, error: 'Your tally board already stands here.' };
        if (m.includes('RACE')) return { success: false, error: 'Try that again.' };
        if (m.includes('insufficient')) return { success: false, error: 'You no longer have the materials.' };
        logger.error(`Tally board build error: ${err}`);
        return { success: false, error: 'The board could not be raised.' };
    }
}

/**
 * Take down the board where the player stands (Nathan, 2026-10-30, from the
 * forum). Everything that went into it comes back and it pays no XP, as with
 * pulling down a pen, so raising and razing boards is never a way to train.
 * The DELETE is the claim: two take-downs at once refund once.
 */
export async function tearDownTallyBoard(playerId: number): Promise<{ success: boolean; error?: string; message?: string }> {
    try {
        let back: { itemName: string; qty: number }[] = BUILD_COST;
        const done = await db.transaction(async (trx) => {
            const player = await trx('players').where({ id: playerId }).forNoKeyUpdate().first('current_location_id');
            const removed = await trx('tally_boards')
                .where({ player_id: playerId, location_id: player?.current_location_id ?? null })
                .delete()
                .returning(['id', 'materials']);
            if (!removed.length) return false;
            back = boardMaterials(removed[0].materials);
            for (const c of back) {
                const item = await trx('items').where({ name: c.itemName }).first('id');
                if (!item) throw new Error(`no item ${c.itemName}`);
                await addItemToInventoryWithin(trx, playerId, item.id, c.qty);
            }
            return true;
        });
        if (!done) return { success: false, error: 'You have no tally board here.' };
        logger.info(`Player ${playerId} took down a tally board`);
        return {
            success: true,
            message: `You draw the nails and stack the planks. ${listWords(back.map(c => `${c.qty} ${c.itemName}`))} come back to you.`,
        };
    } catch (err) {
        logger.error(`Tally board teardown error: ${err}`);
        return { success: false, error: 'The board would not come down.' };
    }
}

export { BUILD_COST as TALLY_BUILD_COST, CARPENTRY_REQ as TALLY_CARPENTRY_REQ, BUILD_SECONDS as TALLY_BUILD_SECONDS };
