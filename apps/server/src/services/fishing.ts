import db from '../db';
import { logger } from '../index';
import { levelFromXp } from './xp';
import { incrementStats } from './stats';
import { getTimeWindow, getSeason, nextWindowChange, TimeWindow, Season } from '../lib/gameTime';

// Fishing (docs/fishing-spec.md). Closest sibling is services/foraging.ts: a
// weighted pick over a pool, with per-player "??? until caught" discovery. The
// differences are what make the skill its own thing:
//
//   1. A WATER IS A LOCATION, not a habitat row. One pool per location, no
//      sub-zones. So the timer cannot key off "levels above the species", the
//      way foraging does, because a cast has no species until it resolves. It
//      keys off the player's absolute Fishing level instead.
//   2. THREE FORCES RE-WEIGHT THE POOL: bait (the player's lever), the time of
//      day, and the season. None of them gate a cast. Baitless always works.
//   3. EVERY CATCH IS WEIGHED, in integer centipounds, and the heaviest and
//      lightest per species are kept forever.
//
// Weight is a CATCH-TIME EVENT, never item state: all fish of a species stack
// like any other item. Attaching the rolled weight to the inventory row would
// give every Perch its own stack and blow out the pack inside one session.

// --- Tuning ---------------------------------------------------------------
// Anything Nathan is likely to retune lives in fish_species / bait_values rows.
// These are the shape of the system, not its content.

const ROD_BASE_TIMER = 70;              // seconds at Fishing 1
const ROD_MIN_TIMER = 20;               // hard floor: no action in Talaran goes below 20s
const ROD_SECONDS_PER_LEVEL = 0.5;      // 1s shaved every 2 levels
const NET_BASE_TIMER = 150;
const NET_MIN_TIMER = 40;
const NET_SECONDS_PER_LEVEL = 1;        // 1s shaved every level
const NET_MAX_SPECIES_LEVEL = 4;        // nets never reach the top of the pool
const NET_MIN_CATCH = 4;
const NET_MAX_CATCH = 6;
const NET_XP_FACTOR = 0.34;             // see the note above resolveNetHaul
const CUT_BAIT_TIMER = 20;
const CUT_BAIT_FISHING_PCT = 0.20;      // of the fish's own catch XP
const CUT_BAIT_CRAFTING_PCT = 0.10;
const BAIT_TIMER_BONUS = 0.10;          // baited casts are 10% faster
const BAIT_WEIGHT_MULT = 2.5;
const WINDOW_WEIGHT_MULT = 2.0;
const SEASON_WEIGHT_MULT = 2.0;
const SNAP_CHANCE_PCT = 5;
// Salvage: caught INSTEAD of a fish, never as well as. Bait suppresses it,
// which is bait's third benefit after the faster timer and the weighted odds.
const SALVAGE_CHANCE_PCT = 6;
const SALVAGE_CHANCE_BAITED_PCT = 2;
const SALVAGE_XP_FRACTION = 0.5;
const TIER_BONUS_PER_TIER = 0.05;       // (tier - 1) x 5%: the island's own rod is the baseline
const TIER_BONUS_CAP = 0.5;
const DISCOVERY_EXPLORATION_XP = 10;    // matches foraging's first-find bonus

export const BAIT_CATEGORIES = ['grain', 'cheese', 'egg', 'spawn', 'meat'] as const;
export type BaitCategory = typeof BAIT_CATEGORIES[number];

// Rod and net both occupy the mainhand, as does the butchering knife. Cutting
// bait therefore means putting the rod down, which is fine: cutting is a batch
// job, not something done between casts.
const TOOL_SLOT_COLUMN: Record<string, string> = {
    fishing_rod: 'mainhand_item_id',
    fishing_net: 'mainhand_item_id',
    butcher_knife: 'mainhand_item_id',
};

export interface FishSpeciesRow {
    id: number;
    name: string;
    item_name: string;
    location_id: number;
    water: string;
    required_level: number;
    base_weight: number;
    bait_category: string | null;
    time_window: string | null;
    window_exclusive: boolean;
    seasons: string | null;
    season_exclusive: boolean;
    min_weight_cw: number;
    max_weight_cw: number;
    xp: number;
    bait_value: number;
    display_order: number;
    is_active: boolean;
    kind: string;                 // 'fish' | 'salvage'
}

export interface FishingCatch {
    species: string;
    weightCw: number;
    weightLb: number;
    xp: number;
    newHeaviest: boolean;
    newLightest: boolean;
    firstDiscovery: boolean;
}

export interface FishingResult {
    success: boolean;
    error?: string;
    snapped?: boolean;
    salvage?: boolean;
    message?: string;
    itemName?: string;
    quantity?: number;
    xp?: number;
    craftingXp?: number;
    xpAwards?: Array<{ skill: string; xp: number }>;
    weightLb?: number;
    newRecord?: boolean;
    newHeaviest?: boolean;
    newLightest?: boolean;
    firstDiscovery?: boolean;
    drops?: Array<{ name: string; quantity: number }>;
    baitRemaining?: number;
    baitCategory?: string | null;
}

// --- Small helpers --------------------------------------------------------

function randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function seasonList(raw: string | null): string[] {
    if (!raw) return [];
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * A catch weight, in centipounds, biased toward the middle of the range.
 *
 * The mean of two uniform rolls is a triangular distribution: the midpoint is
 * the most likely outcome and the true record is reachable but rare, which is
 * the shape a personal-best system wants. A single uniform roll would make a
 * record-breaking Conger about as common as an average one.
 */
function rollWeightCw(minCw: number, maxCw: number): number {
    if (maxCw <= minCw) return minCw;
    const span = maxCw - minCw;
    const a = minCw + Math.random() * span;
    const b = minCw + Math.random() * span;
    return Math.max(minCw, Math.min(maxCw, Math.round((a + b) / 2)));
}

export function cwToLb(cw: number): number {
    return Math.round(cw) / 100;
}

export async function playerLevelFor(playerId: number, skillName: string): Promise<number> {
    const skill = await db('skills').where({ name: skillName }).first();
    if (!skill) return 1;
    const ps = await db('player_skills').where({ player_id: playerId, skill_id: skill.id }).first();
    return ps ? levelFromXp(ps.xp) : 1;
}

/** Tier of the equipped tool of this subtype, or 0 if none is worn. */
export async function equippedToolTier(playerId: number, subtype: string): Promise<number> {
    const column = TOOL_SLOT_COLUMN[subtype];
    if (!column) return 0;
    const equipment = await db('player_equipment').where({ player_id: playerId }).first();
    const itemId = equipment?.[column];
    if (!itemId) return 0;
    const item = await db('items').where({ id: itemId, subtype }).first();
    return item?.tier ? Number(item.tier) : 0;
}

/**
 * Timer for one cast or haul.
 *
 * Keys off the player's ABSOLUTE Fishing level, not levels above a species,
 * because a cast is committed before its species is known. At 70s base and 0.5s
 * per level, Fishing 100 lands on 20.5s, which is essentially the floor: the
 * curve was chosen to arrive there.
 *
 * The tier bonus is (tier - 1), not tier: the rod that ships with an island is
 * that island's baseline and gives no discount, so bringing a higher-tier rod
 * back to easier water is a real advantage rather than the assumed default.
 * The floor is applied last, so nothing (bait, tier, level) can push an action
 * below 20 seconds.
 */
export function calculateFishingTimer(
    base: number,
    floor: number,
    secondsPerLevel: number,
    playerLevel: number,
    toolTier: number,
    baited: boolean,
): number {
    let t = base - Math.max(0, playerLevel - 1) * secondsPerLevel;
    if (toolTier > 1) {
        t = t * (1 - Math.min(TIER_BONUS_CAP, (toolTier - 1) * TIER_BONUS_PER_TIER));
    }
    if (baited) t = t * (1 - BAIT_TIMER_BONUS);
    return Math.max(floor, Math.round(t));
}

export function rodTimer(playerLevel: number, toolTier: number, baited: boolean): number {
    return calculateFishingTimer(ROD_BASE_TIMER, ROD_MIN_TIMER, ROD_SECONDS_PER_LEVEL, playerLevel, toolTier, baited);
}

export function netTimer(playerLevel: number, toolTier: number): number {
    return calculateFishingTimer(NET_BASE_TIMER, NET_MIN_TIMER, NET_SECONDS_PER_LEVEL, playerLevel, toolTier, false);
}

export function cutBaitTimer(): number {
    return CUT_BAIT_TIMER;
}

// --- Eligibility and weighting -------------------------------------------

export type IneligibleReason = 'level' | 'window' | 'season' | null;

export function ineligibleReason(
    species: FishSpeciesRow, level: number, window: TimeWindow, season: Season,
): IneligibleReason {
    if (level < species.required_level) return 'level';
    if (species.window_exclusive && species.time_window !== window) return 'window';
    if (species.season_exclusive && !seasonList(species.seasons).includes(season)) return 'season';
    return null;
}

/**
 * Relative pick weight for one species right now.
 *
 * base_weight is the row Nathan tunes; everything else is a multiplier that the
 * player can read off the Manual and plan around. An exclusive species has
 * already passed the eligibility filter by the time it gets here, so it picks
 * up the window or season multiplier too, which is correct: the whole reason to
 * fish at dusk is that the dusk fish is common at dusk.
 */
export function pickWeightFor(
    species: FishSpeciesRow, window: TimeWindow, season: Season, activeBait: string | null,
): number {
    let w = species.base_weight;
    if (activeBait && species.bait_category === activeBait) w *= BAIT_WEIGHT_MULT;
    if (species.time_window && species.time_window === window) w *= WINDOW_WEIGHT_MULT;
    if (seasonList(species.seasons).includes(season)) w *= SEASON_WEIGHT_MULT;
    return w;
}

function weightedPick<T>(entries: Array<{ row: T; weight: number }>): T {
    const total = entries.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * total;
    for (const e of entries) { r -= e.weight; if (r <= 0) return e.row; }
    return entries[entries.length - 1].row;
}

/**
 * The FISH of a water. Salvage is deliberately excluded here rather than
 * filtered at each call site: every existing caller (eligibility, the panel,
 * net hauls, the can-I-fish check) means fish when it says pool, and one
 * forgotten filter would put a Rusted Chest in a net haul or let salvage
 * satisfy "is anything biting".
 */
export async function speciesAt(locationId: number): Promise<FishSpeciesRow[]> {
    return db('fish_species')
        .where({ location_id: locationId, is_active: true, kind: 'fish' })
        .orderBy('display_order', 'asc');
}

/** The salvage table of a water: things caught instead of a fish. */
export async function salvageAt(locationId: number): Promise<FishSpeciesRow[]> {
    return db('fish_species')
        .where({ location_id: locationId, is_active: true, kind: 'salvage' })
        .orderBy('display_order', 'asc');
}

// --- The bait pouch -------------------------------------------------------
//
// Bait must outlive the action. Break one Frogspawn worth 20, catch three fish,
// log off, and 17 has to still be there on return. That is why this is a table
// and not a field on player_actions.

export async function getBaitPouch(playerId: number): Promise<Record<string, number>> {
    const rows = await db('player_bait').where({ player_id: playerId });
    const pouch: Record<string, number> = {};
    for (const category of BAIT_CATEGORIES) pouch[category] = 0;
    for (const row of rows) pouch[row.category] = Number(row.amount);
    return pouch;
}

/** Convert bait items from the pack into pouch bait. Instant, no action, no XP. */
export async function convertBaitItem(
    playerId: number, itemName: string, quantity: number,
): Promise<{ success: boolean; error?: string; category?: string; added?: number; total?: number }> {
    try {
        const qty = Math.max(1, Math.floor(quantity));
        const bait = await db('bait_values').where({ item_name: itemName }).first();
        if (!bait) return { success: false, error: 'That is not something a fish would take.' };

        let total = 0;
        await db.transaction(async (trx) => {
            const item = await trx('items').where({ name: itemName }).first();
            if (!item) throw new Error('NO_ITEM');

            const inv = await trx('player_inventory')
                .where({ player_id: playerId, item_id: item.id }).forUpdate().first();
            if (!inv || inv.quantity < qty) throw new Error('NOT_ENOUGH');

            if (inv.quantity === qty) {
                await trx('player_inventory').where({ id: inv.id }).delete();
            } else {
                await trx('player_inventory').where({ id: inv.id }).update({ quantity: inv.quantity - qty });
            }

            const added = bait.bait_value * qty;
            const existing = await trx('player_bait')
                .where({ player_id: playerId, category: bait.category }).forUpdate().first();
            if (existing) {
                total = Number(existing.amount) + added;
                await trx('player_bait').where({ id: existing.id }).update({ amount: total });
            } else {
                total = added;
                await trx('player_bait').insert({ player_id: playerId, category: bait.category, amount: total });
            }
        });

        return { success: true, category: bait.category, added: bait.bait_value * qty, total };
    } catch (err: any) {
        if (err.message === 'NOT_ENOUGH') return { success: false, error: 'You do not have that much to spare.' };
        if (err.message === 'NO_ITEM') return { success: false, error: 'That item does not exist.' };
        logger.error(`convertBaitItem error for player ${playerId}: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

/**
 * Everything in the pack that could become bait, with what it is worth.
 *
 * Exported because trapping offers the same breakdown control: one bait pouch
 * means one definition of what can go into it, or the two panels drift.
 */
export async function convertibleBait(playerId: number): Promise<Array<{
    itemName: string; quantity: number; category: string; baitValue: number;
}>> {
    const baitRows = await db('bait_values');
    const owned = await db('player_inventory')
        .join('items', 'player_inventory.item_id', 'items.id')
        .where('player_inventory.player_id', playerId)
        .whereIn('items.name', baitRows.map((b: any) => b.item_name))
        .select('items.name as name', 'player_inventory.quantity as quantity');

    const byName = new Map(baitRows.map((b: any) => [b.item_name, b]));
    return owned.map((o: any) => ({
        itemName: o.name,
        quantity: Number(o.quantity),
        category: byName.get(o.name)!.category,
        baitValue: Number(byName.get(o.name)!.bait_value),
    }));
}

/**
 * Spend one bait of a category. Returns what is left, or null if there was none.
 * Exported because trapping draws from the same pouch: one bait store, one place
 * that knows how to take from it.
 */
export async function spendBait(trx: any, playerId: number, category: string): Promise<number | null> {
    const row = await trx('player_bait')
        .where({ player_id: playerId, category }).forUpdate().first();
    if (!row || Number(row.amount) < 1) return null;
    const remaining = Number(row.amount) - 1;
    await trx('player_bait').where({ id: row.id }).update({ amount: remaining });
    return remaining;
}

// --- Records and discovery ------------------------------------------------

/**
 * Award XP, creating the player_skills row if it does not exist.
 *
 * `.where(...).increment(...)` on a missing row updates nothing and reports no
 * error, so a skill the player has never trained silently swallows the award.
 * Registration only seeds rows for skills that existed at the time, so any skill
 * added later (Crafting, and Fishing for old accounts) can be missing one.
 * Same upsert shape as services/recipes.ts.
 */
async function awardSkillXp(trx: any, playerId: number, skillName: string, xp: number): Promise<void> {
    if (xp <= 0) return;
    const skill = await trx('skills').where({ name: skillName }).first();
    if (!skill) {
        logger.error(`Fishing: no such skill "${skillName}"`);
        return;
    }
    const existing = await trx('player_skills')
        .where({ player_id: playerId, skill_id: skill.id }).first();
    if (existing) {
        await trx('player_skills')
            .where({ player_id: playerId, skill_id: skill.id }).increment('xp', xp);
    } else {
        await trx('player_skills').insert({ player_id: playerId, skill_id: skill.id, xp });
    }
}

async function recordCatch(
    trx: any, playerId: number, species: string, weightCw: number,
): Promise<{ newHeaviest: boolean; newLightest: boolean }> {
    const existing = await trx('player_fishing_records')
        .where({ player_id: playerId, species }).forUpdate().first();

    if (!existing) {
        await trx('player_fishing_records').insert({
            player_id: playerId, species,
            heaviest_cw: weightCw, lightest_cw: weightCw, catches: 1,
        });
        // The first of a species is not a record worth announcing; it is just
        // the first. Discovery already carries that moment.
        return { newHeaviest: false, newLightest: false };
    }

    const newHeaviest = weightCw > Number(existing.heaviest_cw);
    const newLightest = weightCw < Number(existing.lightest_cw);
    await trx('player_fishing_records').where({ id: existing.id }).update({
        heaviest_cw: newHeaviest ? weightCw : existing.heaviest_cw,
        lightest_cw: newLightest ? weightCw : existing.lightest_cw,
        catches: Number(existing.catches) + 1,
    });
    return { newHeaviest, newLightest };
}

async function recordDiscovery(trx: any, playerId: number, species: string): Promise<boolean> {
    const already = await trx('player_fishing_discoveries')
        .where({ player_id: playerId, species }).first();
    if (already) return false;
    await trx('player_fishing_discoveries').insert({ player_id: playerId, species });
    await awardSkillXp(trx, playerId, 'Exploration', DISCOVERY_EXPLORATION_XP);
    return true;
}

async function addToInventory(trx: any, playerId: number, itemName: string, qty: number): Promise<void> {
    const item = await trx('items').where({ name: itemName }).first();
    if (!item) throw new Error(`NO_ITEM:${itemName}`);
    const existing = await trx('player_inventory')
        .where({ player_id: playerId, item_id: item.id }).first();
    if (existing) {
        await trx('player_inventory').where({ id: existing.id }).increment('quantity', qty);
    } else {
        await trx('player_inventory').insert({ player_id: playerId, item_id: item.id, quantity: qty });
    }
}

// --- Preconditions --------------------------------------------------------

export async function canFishHere(
    playerId: number, locationId: number, mode: 'rod' | 'net',
): Promise<{ allowed: boolean; reason?: string }> {
    const pool = await speciesAt(locationId);
    if (pool.length === 0) return { allowed: false, reason: 'There is nothing to fish for here.' };

    const subtype = mode === 'rod' ? 'fishing_rod' : 'fishing_net';
    if ((await equippedToolTier(playerId, subtype)) === 0) {
        return {
            allowed: false,
            reason: mode === 'rod'
                ? 'You need a fishing rod equipped to cast.'
                : 'You need a fishing net equipped to haul.',
        };
    }

    const level = await playerLevelFor(playerId, 'Fishing');
    const window = getTimeWindow();
    const season = getSeason();
    const eligible = pool.filter((s) => ineligibleReason(s, level, window, season) === null);
    if (eligible.length === 0) {
        return { allowed: false, reason: 'Nothing is biting here just now.' };
    }
    if (mode === 'net' && !eligible.some((s) => s.required_level <= NET_MAX_SPECIES_LEVEL)) {
        return { allowed: false, reason: 'The net finds nothing worth hauling in these waters.' };
    }
    return { allowed: true };
}

// --- The panel payload ----------------------------------------------------

const found_has = (set: Set<string>, name: string) => set.has(name);

export async function getFishingOverview(playerId: number, locationId: number) {
    const location = await db('locations').where({ id: locationId }).first();
    const pool = await speciesAt(locationId);
    const level = await playerLevelFor(playerId, 'Fishing');
    const window = getTimeWindow();
    const season = getSeason();

    const discoveries = await db('player_fishing_discoveries').where({ player_id: playerId });
    const found = new Set(discoveries.map((d) => d.species));
    const records = await db('player_fishing_records').where({ player_id: playerId });
    const recordBySpecies = new Map(records.map((r) => [r.species, r]));

    const species = pool.map((s) => {
        const discovered = found.has(s.name);
        const reason = ineligibleReason(s, level, window, season);
        const record = recordBySpecies.get(s.name);
        return {
            // null renders as "???" client-side, exactly like foraging.
            name: discovered ? s.name : null,
            discovered,
            requiredLevel: s.required_level,
            unlocked: level >= s.required_level,
            eligibleNow: reason === null,
            blockedBy: reason,
            // Withheld until caught, so the bait puzzle is something the player
            // solves rather than something the panel hands over.
            baitCategory: discovered ? s.bait_category : null,
            window: discovered ? s.time_window : null,
            windowExclusive: discovered ? s.window_exclusive : false,
            seasons: discovered ? seasonList(s.seasons) : [],
            seasonExclusive: discovered ? s.season_exclusive : false,
            record: record
                ? {
                    heaviestLb: cwToLb(Number(record.heaviest_cw)),
                    lightestLb: cwToLb(Number(record.lightest_cw)),
                    catches: Number(record.catches),
                }
                : null,
        };
    });

    // What the player could turn into bait right now, for the start dialog.
    const convertible = await convertibleBait(playerId);

    // Salvage listed separately: it is not a fish, has no window or season, and
    // showing it inside the fish list would imply it can be targeted.
    const salvageRows = await salvageAt(locationId);
    const salvage = salvageRows.map((s) => ({
        name: found_has(found, s.name) ? s.name : null,
        discovered: found_has(found, s.name),
    }));

    const rodTier = await equippedToolTier(playerId, 'fishing_rod');
    const netTier = await equippedToolTier(playerId, 'fishing_net');
    const knifeTier = await equippedToolTier(playerId, 'butcher_knife');

    // Fish currently in the pack, for the Cut Bait picker. Every fish in the
    // game is cuttable, not just the ones from this water, so a Dawncrest haul
    // can be cut at Luxmere.
    // kind: 'fish' matters here. Salvage rows live in this same table, so
    // without it a River Mussel or a Locked Rusty Chest offers itself up to be
    // cut into bait. Only fish are fish.
    const allSpecies = await db('fish_species').where({ is_active: true, kind: 'fish' });
    const heldFish = await db('player_inventory')
        .join('items', 'player_inventory.item_id', 'items.id')
        .where('player_inventory.player_id', playerId)
        .whereIn('items.name', allSpecies.map((s) => s.item_name))
        .select('items.name as name', 'player_inventory.quantity as quantity');
    const speciesByItem = new Map(allSpecies.map((s) => [s.item_name, s]));
    const cuttable = heldFish.map((f) => ({
        species: speciesByItem.get(f.name)!.name,
        itemName: f.name,
        quantity: Number(f.quantity),
        baitValue: Number(speciesByItem.get(f.name)!.bait_value),
    }));

    return {
        locationName: location?.name ?? '',
        water: pool[0]?.water ?? null,
        playerLevel: level,
        window,
        season,
        windowEndsAt: nextWindowChange(),
        species,
        discoveredCount: species.filter((s) => s.discovered).length,
        totalCount: species.length,
        pouch: await getBaitPouch(playerId),
        salvage,
        convertible,
        cuttable,
        tools: {
            hasRod: rodTier > 0,
            rodTier,
            hasNet: netTier > 0,
            hasKnife: knifeTier > 0,
        },
        timers: {
            rod: rodTier > 0 ? rodTimer(level, rodTier, false) : rodTimer(level, 1, false),
            rodBaited: rodTier > 0 ? rodTimer(level, rodTier, true) : rodTimer(level, 1, true),
            net: netTier > 0 ? netTimer(level, netTier) : netTimer(level, 1),
        },
    };
}

// --- Rod fishing ----------------------------------------------------------

/**
 * One cast.
 *
 * Order matters. The snap roll happens BEFORE the pick, so a snap costs bait
 * and produces nothing, and it can only happen where there is something above
 * the player's level to blame it on. It pays no XP at all: a snap that paid
 * would make standing under-levelled beside big fish a farming strategy, which
 * is the same shape as the Husbandry slaughter exploit.
 */
export async function processFishingCast(
    playerId: number, locationId: number, baitCategoryRaw: string | null,
): Promise<FishingResult> {
    try {
        const baitCategory = baitCategoryRaw && (BAIT_CATEGORIES as readonly string[]).includes(baitCategoryRaw)
            ? baitCategoryRaw
            : null;

        const pool = await speciesAt(locationId);
        if (pool.length === 0) return { success: false, error: 'There is nothing to fish for here.' };

        if ((await equippedToolTier(playerId, 'fishing_rod')) === 0) {
            return { success: false, error: 'You need a fishing rod equipped to cast.' };
        }

        const level = await playerLevelFor(playerId, 'Fishing');
        const window = getTimeWindow();
        const season = getSeason();

        const eligible = pool.filter((s) => ineligibleReason(s, level, window, season) === null);
        if (eligible.length === 0) return { success: false, error: 'Nothing is biting here just now.' };

        const salvage = await salvageAt(locationId);

        // Something out there is beyond you. That is what can take the line.
        const hasBiggerFish = pool.some((s) => s.required_level > level);

        let out: FishingResult = { success: false };

        await db.transaction(async (trx) => {
            // Bait is spent on a snap as well as a catch, so it is resolved first.
            let baitRemaining: number | null = null;
            let baited = false;
            if (baitCategory) {
                const remaining = await spendBait(trx, playerId, baitCategory);
                if (remaining !== null) {
                    baited = true;
                    baitRemaining = remaining;
                }
            }

            if (hasBiggerFish && Math.random() * 100 < SNAP_CHANCE_PCT) {
                out = {
                    success: true,
                    snapped: true,
                    message: 'Something enormous takes the line, and the line does not survive the argument.',
                    xp: 0,
                    baitRemaining: baitRemaining ?? undefined,
                    baitCategory: baited ? baitCategory : null,
                    drops: [],
                };
                return;
            }

            // Salvage comes up INSTEAD of a fish, so it is rolled before the
            // pick and returns early. It pays half XP and, being no fish, rolls
            // no weight and touches no personal best. Bait having already been
            // spent is correct: the cast happened either way.
            const salvageChance = baited ? SALVAGE_CHANCE_BAITED_PCT : SALVAGE_CHANCE_PCT;
            if (salvage.length > 0 && Math.random() * 100 < salvageChance) {
                const found = weightedPick(
                    salvage.map((row) => ({ row, weight: row.base_weight })),
                );
                const salvageXp = Math.max(1, Math.round(found.xp * SALVAGE_XP_FRACTION));
                await addToInventory(trx, playerId, found.item_name, 1);
                await awardSkillXp(trx, playerId, 'Fishing', salvageXp);
                const firstFind = await recordDiscovery(trx, playerId, found.name);

                out = {
                    success: true,
                    snapped: false,
                    salvage: true,
                    itemName: found.item_name,
                    quantity: 1,
                    xp: salvageXp,
                    message: `No fish this time. Your line brings up ${found.item_name}.`,
                    firstDiscovery: firstFind,
                    baitRemaining: baitRemaining ?? undefined,
                    baitCategory: baited ? baitCategory : null,
                    drops: [{ name: found.item_name, quantity: 1 }],
                };
                return;
            }

            const picked = weightedPick(
                eligible.map((row) => ({ row, weight: pickWeightFor(row, window, season, baited ? baitCategory : null) })),
            );

            const weightCw = rollWeightCw(picked.min_weight_cw, picked.max_weight_cw);
            await addToInventory(trx, playerId, picked.item_name, 1);
            await awardSkillXp(trx, playerId, 'Fishing', picked.xp);

            const firstDiscovery = await recordDiscovery(trx, playerId, picked.name);
            const { newHeaviest, newLightest } = await recordCatch(trx, playerId, picked.name, weightCw);

            out = {
                success: true,
                snapped: false,
                itemName: picked.item_name,
                quantity: 1,
                xp: picked.xp,
                weightLb: cwToLb(weightCw),
                newRecord: newHeaviest || newLightest,
                newHeaviest,
                newLightest,
                firstDiscovery,
                baitRemaining: baitRemaining ?? undefined,
                baitCategory: baited ? baitCategory : null,
                drops: [{ name: picked.item_name, quantity: 1 }],
            };
        });

        if (out.success && !out.snapped) {
            await incrementStats(playerId, {
                total_fish_caught: 1,
                total_actions_completed: 1,
                total_xp_earned: out.xp || 0,
            });
        } else if (out.success) {
            await incrementStats(playerId, { total_actions_completed: 1 });
        }

        return out;
    } catch (err: any) {
        if (typeof err?.message === 'string' && err.message.startsWith('NO_ITEM:')) {
            logger.error(`Fishing: missing item row ${err.message}`);
            return { success: false, error: 'That fish has no item row. Tell an admin.' };
        }
        logger.error(`Fishing cast error for player ${playerId}: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

// --- Net fishing ----------------------------------------------------------

/**
 * One haul: 4 to 6 fish, but only from the bottom of the pool.
 *
 * Nets pay a FRACTION of each species' catch XP (NET_XP_FACTOR), not the full
 * amount. Five fish at full price would be roughly 5,300 xp/hr against the rod's
 * 2,200. At 0.34 an average haul lands near 1,820 xp/hr, which is the intended
 * 15-20% below rod: volume is the reward, not rate.
 *
 * Exclusive species are still respected, so a dawn haul can bring up Dawn Sprat.
 */
export async function processNetHaul(playerId: number, locationId: number): Promise<FishingResult> {
    try {
        const pool = await speciesAt(locationId);
        if (pool.length === 0) return { success: false, error: 'There is nothing to fish for here.' };

        if ((await equippedToolTier(playerId, 'fishing_net')) === 0) {
            return { success: false, error: 'You need a fishing net equipped to haul.' };
        }

        const level = await playerLevelFor(playerId, 'Fishing');
        const window = getTimeWindow();
        const season = getSeason();

        const eligible = pool.filter(
            (s) => s.required_level <= NET_MAX_SPECIES_LEVEL
                && ineligibleReason(s, level, window, season) === null,
        );
        if (eligible.length === 0) {
            return { success: false, error: 'The net finds nothing worth hauling in these waters.' };
        }

        let out: FishingResult = { success: false };

        await db.transaction(async (trx) => {
            const count = randInt(NET_MIN_CATCH, NET_MAX_CATCH);
            const tally = new Map<string, number>();
            let totalXp = 0;
            let anyDiscovery = false;
            let anyRecord = false;
            let anyHeaviest = false;
            let anyLightest = false;

            for (let i = 0; i < count; i++) {
                // No bait influence: a net does not care what you would rather catch.
                const picked = weightedPick(
                    eligible.map((row) => ({ row, weight: pickWeightFor(row, window, season, null) })),
                );
                const weightCw = rollWeightCw(picked.min_weight_cw, picked.max_weight_cw);

                await addToInventory(trx, playerId, picked.item_name, 1);
                tally.set(picked.item_name, (tally.get(picked.item_name) || 0) + 1);
                totalXp += Math.max(1, Math.round(picked.xp * NET_XP_FACTOR));

                if (await recordDiscovery(trx, playerId, picked.name)) anyDiscovery = true;
                const rec = await recordCatch(trx, playerId, picked.name, weightCw);
                if (rec.newHeaviest) { anyHeaviest = true; anyRecord = true; }
                if (rec.newLightest) { anyLightest = true; anyRecord = true; }
            }

            const fishingSkill = await trx('skills').where({ name: 'Fishing' }).first();
            if (!fishingSkill) throw new Error('NO_SKILL');
            await awardSkillXp(trx, playerId, 'Fishing', totalXp);

            const drops = Array.from(tally.entries()).map(([name, quantity]) => ({ name, quantity }));
            out = {
                success: true,
                snapped: false,
                // The card's generic branch keys off itemName, so lead with the
                // largest stack and let drops carry the rest.
                itemName: drops[0]?.name,
                quantity: drops[0]?.quantity,
                xp: totalXp,
                message: `You haul the net in and pick out ${count} fish.`,
                firstDiscovery: anyDiscovery,
                newRecord: anyRecord,
                newHeaviest: anyHeaviest,
                newLightest: anyLightest,
                drops,
            };
        });

        if (out.success) {
            const hauled = (out.drops || []).reduce((s, d) => s + d.quantity, 0);
            await incrementStats(playerId, {
                total_fish_caught: hauled,
                total_actions_completed: 1,
                total_xp_earned: out.xp || 0,
            });
        }

        return out;
    } catch (err: any) {
        if (typeof err?.message === 'string' && err.message.startsWith('NO_ITEM:')) {
            logger.error(`Net fishing: missing item row ${err.message}`);
            return { success: false, error: 'That fish has no item row. Tell an admin.' };
        }
        logger.error(`Net haul error for player ${playerId}: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

// --- Cut bait -------------------------------------------------------------

/**
 * Cut one fish into bait.
 *
 * Pays 20% of the fish's catch XP as Fishing and 10% as Crafting. The Fishing
 * share is deliberately below the break-even point: at 20s against a 70s cast,
 * paying the neutral ~30% would make "cut everything you catch" free, and much
 * above that it becomes the dominant strategy and no fish ever survives to
 * reach Cooking. At 20% the catch-and-cut loop sits a few percent under pure
 * rod fishing, so cutting is a choice with a small cost, which is what it
 * should be. Crafting XP is free upside; it feeds a different ladder.
 *
 * Cutting with a blade pays Crafting because that is what the codebase already
 * does: Cut Buckskin Strips and all three tanning recipes are Crafting.
 */
export async function processCutBait(playerId: number, speciesName: string): Promise<FishingResult> {
    try {
        if ((await equippedToolTier(playerId, 'butcher_knife')) === 0) {
            return { success: false, error: 'You need a butchering knife equipped to cut bait.' };
        }

        // Third and last place kind is checked: the picker, the endpoint that
        // starts the action, and the resolver that finishes it. An action queued
        // before this fix will now fail cleanly instead of turning a Locked
        // Rusty Chest into bait.
        const species = await db('fish_species').where({ name: speciesName, kind: 'fish' }).first();
        if (!species) return { success: false, error: 'That is not a fish you can cut for bait.' };

        let out: FishingResult = { success: false };

        await db.transaction(async (trx) => {
            const item = await trx('items').where({ name: species.item_name }).first();
            if (!item) throw new Error(`NO_ITEM:${species.item_name}`);

            const inv = await trx('player_inventory')
                .where({ player_id: playerId, item_id: item.id }).forUpdate().first();
            if (!inv || inv.quantity < 1) throw new Error('NONE_LEFT');

            if (inv.quantity === 1) {
                await trx('player_inventory').where({ id: inv.id }).delete();
            } else {
                await trx('player_inventory').where({ id: inv.id }).update({ quantity: inv.quantity - 1 });
            }

            const added = Number(species.bait_value);
            const existing = await trx('player_bait')
                .where({ player_id: playerId, category: 'meat' }).forUpdate().first();
            let total = added;
            if (existing) {
                total = Number(existing.amount) + added;
                await trx('player_bait').where({ id: existing.id }).update({ amount: total });
            } else {
                await trx('player_bait').insert({ player_id: playerId, category: 'meat', amount: total });
            }

            const fishingXp = Math.max(1, Math.round(Number(species.xp) * CUT_BAIT_FISHING_PCT));
            const craftingXp = Math.max(1, Math.round(Number(species.xp) * CUT_BAIT_CRAFTING_PCT));

            await awardSkillXp(trx, playerId, 'Fishing', fishingXp);
            await awardSkillXp(trx, playerId, 'Crafting', craftingXp);

            out = {
                success: true,
                xp: fishingXp,
                craftingXp,
                // Canonical multi-skill shape. Without this the loot log records
                // only the Fishing share, because the legacy skillName/xpAwarded
                // pair can express exactly one skill per action.
                xpAwards: [
                    { skill: 'Fishing', xp: fishingXp },
                    { skill: 'Crafting', xp: craftingXp },
                ],
                message: `You cut the ${species.name} down for bait. ${added} bait added to your pouch.`,
                baitCategory: 'meat',
                baitRemaining: total,
                drops: [],
            };
        });

        if (out.success) {
            await incrementStats(playerId, {
                total_actions_completed: 1,
                total_xp_earned: (out.xp || 0) + (out.craftingXp || 0),
            });
        }

        return out;
    } catch (err: any) {
        if (err.message === 'NONE_LEFT') return { success: false, error: 'You have none of those left to cut.' };
        if (typeof err?.message === 'string' && err.message.startsWith('NO_ITEM:')) {
            logger.error(`Cut bait: missing item row ${err.message}`);
            return { success: false, error: 'That fish has no item row. Tell an admin.' };
        }
        logger.error(`Cut bait error for player ${playerId}: ${err}`);
        return { success: false, error: 'Server error' };
    }
}
