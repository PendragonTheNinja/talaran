import type { Knex } from 'knex';
import db from '../db';
import { logger } from '../index';
import { levelFromXp } from './xp';
import { incrementStats } from './stats';
import { notifyInventoryChanged } from './inventory';
import { activeXpForSeconds } from './farming';
import { updateQuestObjectiveProgress } from '../routes/quests';
import { isLiquid, canFill, addLiquid, liquidState } from './liquids';

// Husbandry (docs/husbandry-design.md). Pens are raised on the Novita farmstead
// beside the fields, then stocked with animals found in the wild: feed → collect
// → muck → and eventually slaughter, or halter, if the animal is a mount.
//
// THE ONE IDEA WORTH KNOWING: animal clocks are PAUSE-AWARE. An animal ages and
// makes product only while its pen is fed. We store accrued fed-seconds and fold
// in elapsed time on read, so an unfed pen simply stops rather than starving.
// Nothing here can die — there is no death path, by design.
//
// Farming is a transaction (sow, wait, harvest, gone). Husbandry is a standing
// relationship: the animal persists, needs feeding, and yields again and again.
// That is why growth is not a ready_at stamp but an accrued total.

const H = 3600;

export const HUSBANDRY_TOWN = 'Novita';
const PEN_MAX = 12;                       // hard ceiling (reached around level 33)
const COOP_CAPACITY = 6;                  // small stock
const PADDOCK_CAPACITY = 3;               // large stock

// Feeding fills a pen for this long; every animal inside accrues while it lasts.
const FED_SECONDS = 12 * H;
// Mucking falls due on WALL-CLOCK time, not fed time: a neglected pen still
// wants shovelling out. An overdue pen accrues nothing until it is cleaned.
const MUCK_INTERVAL = 24 * H;

const BUILD_PEN_SECONDS = 180;
const FEED_SECONDS_PER_HEAD = 8;
const MUCK_SECONDS = 60;
const COLLECT_SECONDS = 20;
const SLAUGHTER_SECONDS = 45;
const TAME_SECONDS = 30;

// Tools, by the slot each must be EQUIPPED in (the foraging TOOL_SLOT_COLUMN
// pattern — carrying one is not enough).
// Raising a pen is Carpentry work, so it carries the same tool requirement every
// other structure does (services/farming.ts BUILD_MALLET / BUILD_HELD): the mallet
// must be EQUIPPED, and the saw is consumed-by-presence in the pack.
// Mucking out lays FRESH BEDDING, so it costs straw and returns manure. That
// gives Farming's straw a sink and Farming's soil restore its only faucet, which
// is the loop this skill was meant to close.
const BEDDING = { itemName: 'Straw', perHead: 1 };

const BUILD_MALLET = { subtype: 'mallet', itemName: 'Lanai Mallet' };
const BUILD_SAW = { subtype: 'saw', itemName: 'Ambren Saw' };

const TOOL_SLOT_COLUMN: Record<string, string> = {
    mallet: 'mainhand_item_id',
    saw: 'offhand_item_id',
    pail: 'offhand_item_id',
    fork: 'mainhand_item_id',
    halter: 'hands_item_id',
    butcher_knife: 'mainhand_item_id',
};

// Milk (and any future liquid) is poured into buckets rather than handed over as
// a loose item — services/liquids.ts owns that. Everything else is an ordinary
// item and goes straight to the pack.

const PEN_COST: Record<string, (n: number) => { itemName: string; qty: number }[]> = {
    coop: (n) => [
        { itemName: 'Lanai Planks', qty: 20 + (n - 1) * 8 },
        { itemName: 'Ambren Nails', qty: 30 + (n - 1) * 10 },
    ],
    paddock: (n) => [
        { itemName: 'Fence Panel', qty: 12 + (n - 1) * 6 },
        { itemName: 'Lanai Planks', qty: 15 + (n - 1) * 6 },
        { itemName: 'Ambren Nails', qty: 20 + (n - 1) * 8 },
    ],
};

/**
 * Randomised at placement, renameable forever after. The pool lives on the
 * species row (animal_species.name_pool, comma separated) so names can be added
 * by editing the database, without a code change or a deploy.
 */
function randomName(species: { name: string; name_pool?: string | null }): string {
    const pool = (species.name_pool || '')
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);
    if (!pool.length) return species.name;
    return pool[Math.floor(Math.random() * pool.length)];
}

export interface HusbandryActionResult {
    success: boolean;
    error?: string;
    xp?: number;
    skillName?: string;
    itemName?: string;
    quantity?: number;
    message?: string;
    /** Every item yielded, for the result card and the fly-to-pack animation. */
    drops?: { name: string; quantity: number }[];
}

// ── helpers ────────────────────────────────────────────────────────────────
// Every helper takes an executor so the same code runs inside a transaction or
// outside one. `Ex` is the knex instance or an open trx.
type Ex = Knex | Knex.Transaction;

async function itemByName(name: string, x: Ex = db) {
    return x('items').where({ name }).first();
}

async function skillLevel(playerId: number, skillName: string, x: Ex = db): Promise<number> {
    const skill = await x('skills').where({ name: skillName }).first();
    if (!skill) return 1;
    const ps = await x('player_skills').where({ player_id: playerId, skill_id: skill.id }).first();
    return ps ? levelFromXp(ps.xp) : 1;
}

async function inventoryQty(playerId: number, itemName: string, x: Ex = db): Promise<number> {
    const item = await itemByName(itemName, x);
    if (!item) return 0;
    const inv = await x('player_inventory').where({ player_id: playerId, item_id: item.id }).first();
    return inv?.quantity ?? 0;
}

async function hasMaterials(playerId: number, cost: { itemName: string; qty: number }[], x: Ex = db) {
    const missing: { itemName: string; need: number; have: number }[] = [];
    for (const c of cost) {
        const have = await inventoryQty(playerId, c.itemName, x);
        if (have < c.qty) missing.push({ itemName: c.itemName, need: c.qty, have });
    }
    return { ok: missing.length === 0, missing };
}

/**
 * Adds an item without touching the first-discovery ledger. gameTick calls
 * recordItemFirstByName on the reported itemName and uses the result to fire the
 * sparkle, so recording it here first would make that check return false and the
 * sparkle would never show.
 */
async function giveItem(playerId: number, itemName: string, qty: number, x: Ex = db) {
    const item = await itemByName(itemName, x);
    if (!item) throw new Error(`giveItem: missing item ${itemName}`);
    const inv = await x('player_inventory')
        .where({ player_id: playerId, item_id: item.id }).forUpdate().first();
    if (inv) await x('player_inventory').where({ id: inv.id }).increment('quantity', qty);
    else await x('player_inventory').insert({ player_id: playerId, item_id: item.id, quantity: qty });
}

async function consumeMaterials(playerId: number, cost: { itemName: string; qty: number }[], x: Ex = db) {
    for (const c of cost) {
        const item = await itemByName(c.itemName, x);
        if (!item) throw new Error(`consumeMaterials: missing item ${c.itemName}`);
        const inv = await x('player_inventory')
            .where({ player_id: playerId, item_id: item.id }).forUpdate().first();
        if (!inv || inv.quantity < c.qty) throw new Error('SHORT_MATERIALS');
        if (inv.quantity === c.qty) await x('player_inventory').where({ id: inv.id }).delete();
        else await x('player_inventory').where({ id: inv.id }).update({ quantity: inv.quantity - c.qty });
    }
}

async function equippedTool(playerId: number, subtype: string, x: Ex = db) {
    const column = TOOL_SLOT_COLUMN[subtype];
    if (!column) return null;
    const equipment = await x('player_equipment').where({ player_id: playerId }).first();
    const id = equipment?.[column];
    if (!id) return null;
    return x('items').where({ id, subtype }).first();
}

async function awardXp(playerId: number, skillName: string, xp: number, x: Ex = db): Promise<void> {
    const skill = await x('skills').where({ name: skillName }).first();
    if (!skill) return;
    const existing = await x('player_skills').where({ player_id: playerId, skill_id: skill.id }).first();
    if (existing) await x('player_skills').where({ player_id: playerId, skill_id: skill.id }).increment('xp', xp);
    else await x('player_skills').insert({ player_id: playerId, skill_id: skill.id, xp });
}

/** First unmet build-tool requirement, or null when properly kitted. */
async function missingBuildTool(playerId: number, x: Ex = db): Promise<string | null> {
    if (!(await equippedTool(playerId, BUILD_MALLET.subtype, x))) {
        return `You need a ${BUILD_MALLET.itemName} equipped to build.`;
    }
    if (!(await equippedTool(playerId, BUILD_SAW.subtype, x))) {
        return `You need a ${BUILD_SAW.itemName} equipped to build.`;
    }
    return null;
}

async function playerProperty(playerId: number, x: Ex = db) {
    const novita = await x('locations').where({ name: HUSBANDRY_TOWN }).first();
    if (!novita) return { novita: null, property: null };
    const property = await x('player_properties')
        .where({ player_id: playerId, location_id: novita.id, type: 'farmstead' }).first();
    return { novita, property };
}

async function ownedPen(playerId: number, penId: number, x: Ex = db) {
    return x('player_pens')
        .join('player_properties', 'player_pens.property_id', 'player_properties.id')
        .where('player_pens.id', penId)
        .where('player_properties.player_id', playerId)
        .select('player_pens.*')
        .first();
}

async function busy(playerId: number): Promise<boolean> {
    const a = await db('player_actions').where({ player_id: playerId }).first();
    return !!a;
}

async function startAction(playerId: number, type: string, seconds: number, data: string | null, locationId: number | null) {
    const now = new Date();
    await db('player_actions').insert({
        player_id: playerId,
        action_type: type,
        action_data: data,
        location_id: locationId,
        started_at: now,
        completes_at: new Date(now.getTime() + seconds * 1000),
        // Checklist item 1: set on the INITIAL insert, not only on restarts, or
        // the client has no timer length to render after a refresh.
        last_timer_seconds: seconds,
        auto_restart: false,
        last_bot_check: now,
        bot_check_pending: false,
    });
    return seconds;
}

// Pens are built one at a time and capped by Husbandry level: 1 at level 1,
// +1 every 3 levels, hitting the 12 ceiling around level 33. Mirrors plots.
export function penCapForLevel(level: number): number {
    return Math.min(PEN_MAX, 1 + Math.floor(level / 3));
}

export function penCost(penType: string, penNumber: number): { itemName: string; qty: number }[] {
    return (PEN_COST[penType] ?? PEN_COST.paddock)(penNumber);
}

// ── the clock ───────────────────────────────────────────────────────────────
// Everything about an animal's state is derived from two accrued totals, folded
// forward on read. A pen contributes time only while it is BOTH fed and clean.

function penRunningUntil(pen: any, now: number): number {
    const fed = pen.fed_until ? new Date(pen.fed_until).getTime() : 0;
    const muckDue = pen.muck_due_at ? new Date(pen.muck_due_at).getTime() : Infinity;
    return Math.min(fed, muckDue, now);
}

/**
 * Folds elapsed time into an animal's accrued clocks and persists the result.
 * Safe to call as often as we like; it is the only writer of accrued_at.
 */
async function accrue(animal: any, pen: any, now = Date.now(), x: Ex = db) {
    const from = new Date(animal.accrued_at).getTime();
    const until = penRunningUntil(pen, now);
    const gained = Math.max(0, Math.floor((until - from) / 1000));

    const grow = animal.grow_seconds_accrued + gained;
    const product = animal.product_seconds_accrued + gained;

    if (gained > 0) {
        await x('player_animals').where({ id: animal.id }).update({
            grow_seconds_accrued: grow,
            product_seconds_accrued: product,
            accrued_at: new Date(until),
        });
    }

    return { ...animal, grow_seconds_accrued: grow, product_seconds_accrued: product };
}

function stageOf(animal: any, species: any): 'juvenile' | 'adult' | 'elder' {
    const g = animal.grow_seconds_accrued;
    if (g < species.grow_seconds) return 'juvenile';
    if (g < species.grow_seconds + species.elder_seconds) return 'adult';
    return 'elder';
}

// Elders take longer between products. They do NOT butcher out any smaller —
// only the repeating yield slows with age.
function productInterval(species: any, stage: string): number {
    if (!species.product_seconds) return Infinity;
    return stage === 'elder'
        ? Math.round(species.product_seconds * Number(species.elder_time_multiplier))
        : species.product_seconds;
}

/**
 * How many finished products an animal is holding, capped by the species.
 * An animal at its cap stops accruing usefully — the surplus is simply lost when
 * collected, which is what makes a neglected farm wasteful without punishing it.
 */
function productUnits(animal: any, species: any, stage: string): number {
    if (!species.product_item_name || stage === 'juvenile') return 0;
    const interval = productInterval(species, stage);
    if (!isFinite(interval) || interval <= 0) return 0;
    const cap = species.product_max_stored ?? 4;
    return Math.min(cap, Math.floor(animal.product_seconds_accrued / interval));
}

function productReady(animal: any, species: any, stage: string): boolean {
    return productUnits(animal, species, stage) >= 1;
}

/**
 * Seconds left on the clock after collecting `units`. At the cap the remainder is
 * discarded rather than carried, so a full animal genuinely wasted the time.
 */
function accruedAfterCollect(animal: any, species: any, stage: string, units: number): number {
    const cap = species.product_max_stored ?? 4;
    if (units >= cap) return 0;
    return animal.product_seconds_accrued - units * productInterval(species, stage);
}

/**
 * The share of a full life an animal has lived, capped at 1.0 from elderhood on.
 * Slaughter XP is paid at this fraction: without it, butchering the moment an
 * animal matured paid up to 6.4x the intended rate, because the milestones all
 * land at or before adulthood and only the product XP requires waiting.
 */
function lifeFraction(animal: any, species: any): number {
    const full = species.grow_seconds + species.elder_seconds;
    return Math.min(1, animal.grow_seconds_accrued / Math.max(1, full));
}

async function accrueAllInPen(pen: any, x: Ex = db) {
    const animals = await x('player_animals').where({ pen_id: pen.id });
    const now = Date.now();
    const out = [];
    for (const a of animals) out.push(await accrue(a, pen, now, x));
    return out;
}

/**
 * Pays the one-off maturity XP the first time we observe an animal as an adult.
 * Kept idempotent by a flag, since the clock is folded forward on every read.
 */
async function payMaturityXp(playerId: number, animal: any, species: any): Promise<number> {
    if (animal.mature_xp_paid) return 0;
    if (stageOf(animal, species) === 'juvenile') return 0;
    await db('player_animals').where({ id: animal.id }).update({ mature_xp_paid: true });
    if (species.xp_mature > 0) {
        await awardXp(playerId, 'Husbandry', species.xp_mature);
        await incrementStats(playerId, { total_xp_earned: species.xp_mature });
    }
    return species.xp_mature;
}

/**
 * Pens, summarised for the Tally Board. Lives here rather than in tally.ts so
 * the pause-aware clock logic has exactly one implementation: a pen only counts
 * as working while it is fed and clean, and that rule is easy to get subtly
 * wrong a second time.
 *
 * Shares the accrual side-effect with getHusbandryState — reading folds elapsed
 * time forward, which is idempotent and is how every other read here behaves.
 */
export async function husbandryTallyEntries(playerId: number): Promise<{
    what: string; where: string; island: string;
    status: 'ready' | 'working' | 'idle'; readyAt: string | null; detail: string;
}[]> {
    const pens = await db('player_pens')
        .join('player_properties', 'player_pens.property_id', 'player_properties.id')
        .leftJoin('locations', 'player_properties.location_id', 'locations.id')
        .where('player_properties.player_id', playerId)
        .select(
            'player_pens.*',
            'locations.name as location_name',
            'locations.region as island',
        );

    const now = Date.now();
    const out = [];

    for (const pen of pens) {
        const label = `${pen.pen_type === 'coop' ? 'Coop' : 'Paddock'} ${pen.slot_index + 1}`;
        const base = {
            what: label,
            where: pen.location_name || 'Unknown',
            island: pen.island || '',
        };

        const animals = await accrueAllInPen(pen);
        if (!animals.length) {
            out.push({ ...base, status: 'idle' as const, readyAt: null, detail: 'Empty' });
            continue;
        }

        const species = await db('animal_species').where({ id: pen.species_id }).first();
        const fed = pen.fed_until && new Date(pen.fed_until).getTime() > now;
        const needsMuck = pen.muck_due_at && new Date(pen.muck_due_at).getTime() <= now;
        const head = `${animals.length} ${species.name}${animals.length === 1 ? '' : 's'}`;

        // A halted pen is idle, not working: nothing accrues until it is fixed,
        // and telling the player which of the two is wrong saves a journey.
        if (!fed || needsMuck) {
            out.push({
                ...base,
                status: 'idle' as const,
                readyAt: null,
                detail: `${head} — ${!fed ? 'hungry' : 'needs mucking'}, nothing growing`,
            });
            continue;
        }

        let units = 0;
        let grown = 0;
        let soonest: number | null = null;

        for (const a of animals) {
            const stage = stageOf(a, species);
            units += productUnits(a, species, stage);
            if (stage !== 'juvenile') grown++;
            if (stage === 'juvenile') {
                const left = Math.max(0, species.grow_seconds - a.grow_seconds_accrued);
                const at = now + left * 1000;
                if (soonest === null || at < soonest) soonest = at;
            } else if (species.product_item_name) {
                const interval = productInterval(species, stage);
                const left = Math.max(0, interval - a.product_seconds_accrued);
                const at = now + left * 1000;
                if (soonest === null || at < soonest) soonest = at;
            }
        }

        if (units > 0) {
            out.push({
                ...base,
                status: 'ready' as const,
                readyAt: new Date(now).toISOString(),
                detail: `${head} — ${units} ${species.product_item_name?.toLowerCase() ?? 'product'} ready`,
            });
            continue;
        }

        out.push({
            ...base,
            status: 'working' as const,
            readyAt: soonest ? new Date(soonest).toISOString() : null,
            detail: grown < animals.length
                ? `${head} — ${animals.length - grown} still growing`
                : `${head} — fed and working`,
        });
    }

    return out;
}

// ── state ───────────────────────────────────────────────────────────────────
export async function getHusbandryState(playerId: number) {
    const player = await db('players').where({ id: playerId }).select('current_location_id').first();
    const { novita, property } = await playerProperty(playerId);
    const atNovita = !!novita && player?.current_location_id === novita.id;

    const husbandryLvl = await skillLevel(playerId, 'Husbandry');
    const speciesRows = await db('animal_species').where({ is_active: true }).orderBy('husbandry_level', 'asc');

    const speciesList = [];
    for (const s of speciesRows) {
        speciesList.push({
            id: s.id, name: s.name, penType: s.pen_type, level: s.husbandry_level,
            babyItem: s.baby_item_name, feedItem: s.feed_item_name, feedQty: s.feed_qty,
            productItem: s.product_item_name, productSeconds: s.product_seconds,
            productChance: s.product_chance, growSeconds: s.grow_seconds,
            elderSeconds: s.elder_seconds, isMount: !!s.mount_item_name,
            description: s.description,
            unlocked: husbandryLvl >= s.husbandry_level,
            babiesHeld: await inventoryQty(playerId, s.baby_item_name),
        });
    }

    const base = {
        atNovita, town: HUSBANDRY_TOWN, husbandryLevel: husbandryLvl,
        penCap: penCapForLevel(husbandryLvl), penMax: PEN_MAX,
        coopCapacity: COOP_CAPACITY, paddockCapacity: PADDOCK_CAPACITY,
        fedHours: FED_SECONDS / H, muckHours: MUCK_INTERVAL / H,
        species: speciesList,
        hasPail: !!(await equippedTool(playerId, 'pail')),
        hasFork: !!(await equippedTool(playerId, 'fork')),
        hasHalter: !!(await equippedTool(playerId, 'halter')),
        hasKnife: !!(await equippedTool(playerId, 'butcher_knife')),
        missingBuildTool: await missingBuildTool(playerId),
        milk: await liquidState(playerId, 'Milk'),
        // Counts for the farm-wide buttons, so the client can label and disable
        // them without working it out from the pen list.
        ...(await (async () => {
            const feedPens = await pensNeedingFeed(playerId);
            const muckPens = await pensNeedingMuck(playerId);
            const feed = await roundCost(feedPens, 'feed');
            const muck = await roundCost(muckPens, 'muck');
            return {
                pensToFeed: feedPens.length,
                pensToMuck: muckPens.length,
                // What a full round would take, and whether it is affordable, so
                // the button can say so instead of failing when pressed.
                feedRoundCost: feed.cost,
                muckRoundCost: muck.cost,
                canFeedRound: (await hasMaterials(playerId, feed.cost)).ok,
                canMuckRound: (await hasMaterials(playerId, muck.cost)).ok,
            };
        })()),
    };

    if (!property) {
        return { ...base, hasFarmstead: false, pens: [], nextPenCost: null };
    }

    const penRows = await db('player_pens').where({ property_id: property.id }).orderBy('slot_index', 'asc');
    const now = Date.now();
    const pens = [];

    for (const pen of penRows) {
        const animals = await accrueAllInPen(pen);
        const species = pen.species_id
            ? await db('animal_species').where({ id: pen.species_id }).first()
            : null;

        const animalList = [];
        for (const a of animals) {
            const sp = species ?? await db('animal_species').where({ id: a.species_id }).first();
            const stage = stageOf(a, sp);
            await payMaturityXp(playerId, a, sp);
            const interval = productInterval(sp, stage);
            animalList.push({
                id: a.id, name: a.name, species: sp.name, stage,
                // The client picks a juvenile's picture from the item it came
                // from, so a Chick looks the same in the coop as in the pack.
                babyItem: sp.baby_item_name,
                isMount: !!sp.mount_item_name,
                productItem: sp.product_item_name,
                productReady: productReady(a, sp, stage),
                productUnits: productUnits(a, sp, stage),
                productMax: sp.product_max_stored ?? 4,
                productProgress: sp.product_seconds && stage !== 'juvenile'
                    ? Math.min(1, a.product_seconds_accrued / interval) : 0,
                growProgress: stage === 'juvenile'
                    ? Math.min(1, a.grow_seconds_accrued / sp.grow_seconds) : 1,
                // Remaining fed-seconds to the next stage, so the client can show
                // "grown in about 3h" rather than a bare bar.
                secondsToAdult: Math.max(0, sp.grow_seconds - a.grow_seconds_accrued),
                secondsToElder: Math.max(0, (sp.grow_seconds + sp.elder_seconds) - a.grow_seconds_accrued),
                canSlaughter: stage !== 'juvenile' && !sp.mount_item_name,
                canTame: stage !== 'juvenile' && !!sp.mount_item_name,
            });
        }

        const fedUntil = pen.fed_until ? new Date(pen.fed_until).getTime() : 0;
        const muckDue = pen.muck_due_at ? new Date(pen.muck_due_at).getTime() : 0;
        pens.push({
            id: pen.id, slotIndex: pen.slot_index, penType: pen.pen_type,
            species: species?.name ?? null, speciesId: pen.species_id,
            capacity: pen.capacity, headCount: animals.length,
            fed: fedUntil > now, fedUntil: pen.fed_until,
            canFeed: fedUntil <= now && animals.length > 0,
            needsMucking: muckDue > 0 && muckDue <= now, muckDueAt: pen.muck_due_at,
            canMuck: animals.length > 0 && (muckDue === 0 || muckDue <= now),
            beddingCost: animals.length * BEDDING.perHead,
            beddingItem: BEDDING.itemName,
            readyUnits: animalList.reduce((n, a) => n + (a.productUnits ?? 0), 0),
            slaughterable: animalList.filter((a) => a.canSlaughter).length,
            feedItem: species?.feed_item_name ?? null,
            feedCost: species ? species.feed_qty * animals.length : 0,
            animals: animalList,
        });
    }

    const nextPen = pens.length + 1;
    return {
        ...base,
        hasFarmstead: true,
        pens,
        canBuildPen: pens.length < penCapForLevel(husbandryLvl),
        nextPenCost: {
            coop: penCost('coop', nextPen),
            paddock: penCost('paddock', nextPen),
        },
    };
}

// ── build a pen ─────────────────────────────────────────────────────────────
export async function startBuildPen(playerId: number, penType: string): Promise<{ ok: boolean; error?: string; timerSeconds?: number }> {
    if (penType !== 'coop' && penType !== 'paddock') return { ok: false, error: 'Unknown pen type.' };

    const { novita, property } = await playerProperty(playerId);
    if (!property) return { ok: false, error: 'You need a farmstead before you can keep animals.' };

    const player = await db('players').where({ id: playerId }).select('current_location_id').first();
    if (player?.current_location_id !== novita?.id) return { ok: false, error: `You must be at your farmstead in ${HUSBANDRY_TOWN}.` };

    const existing = await db('player_pens').where({ property_id: property.id }).count({ c: '*' }).first();
    const count = Number(existing?.c ?? 0);
    const lvl = await skillLevel(playerId, 'Husbandry');
    if (count >= penCapForLevel(lvl)) {
        return { ok: false, error: count >= PEN_MAX ? 'Your farmstead has no room for another pen.' : `Husbandry level ${(count) * 3} is needed for another pen.` };
    }

    const toolProblem = await missingBuildTool(playerId);
    if (toolProblem) return { ok: false, error: toolProblem };

    const cost = penCost(penType, count + 1);
    const matCheck = await hasMaterials(playerId, cost);
    if (!matCheck.ok) {
        const m = matCheck.missing[0];
        return { ok: false, error: `You need ${m.need}x ${m.itemName} (you have ${m.have}).` };
    }
    if (await busy(playerId)) return { ok: false, error: 'You are already performing an action.' };

    await startAction(playerId, 'husbandry_build_pen', BUILD_PEN_SECONDS, penType, novita?.id ?? null);
    return { ok: true, timerSeconds: BUILD_PEN_SECONDS };
}

export async function resolveBuildPen(playerId: number, penTypeRaw: string | null): Promise<HusbandryActionResult> {
    try {
        const penType = penTypeRaw === 'coop' ? 'coop' : 'paddock';
        let xp = 0;

        await db.transaction(async (trx) => {
            const { property } = await playerProperty(playerId, trx);
            if (!property) throw new Error('NO_FARMSTEAD');

            const toolProblem = await missingBuildTool(playerId, trx);
            if (toolProblem) throw new Error(`NO_TOOL:${toolProblem}`);

            const rows = await trx('player_pens').where({ property_id: property.id }).forUpdate();
            const cost = penCost(penType, rows.length + 1);
            const matCheck = await hasMaterials(playerId, cost, trx);
            if (!matCheck.ok) throw new Error('SHORT_MATERIALS');
            await consumeMaterials(playerId, cost, trx);

            const nextIndex = rows.length ? Math.max(...rows.map((r: any) => r.slot_index)) + 1 : 0;
            await trx('player_pens').insert({
                property_id: property.id,
                slot_index: nextIndex,
                pen_type: penType,
                species_id: null,
                capacity: penType === 'coop' ? COOP_CAPACITY : PADDOCK_CAPACITY,
                fed_until: null,
                muck_due_at: null,
            });

            // Raising a pen is Carpentry work — posts, panels and nails — so it
            // pays Carpentry, at the Carpentry rate. Farming does the same for the
            // farmstead and for fencing a field; Husbandry should never have
            // differed. Husbandry is earned by keeping animals, not by building.
            const carpLvl = await skillLevel(playerId, 'Carpentry', trx);
            xp = activeXpForSeconds(carpLvl, BUILD_PEN_SECONDS);
            await awardXp(playerId, 'Carpentry', xp, trx);
            // Target is the pen kind, so a quest can ask for a coop specifically
            // (Geothro's lesson does) rather than any pen at all.
            await updateQuestObjectiveProgress(playerId, 'build', penType === 'coop' ? 'Coop' : 'Paddock', 1);
        });

        await incrementStats(playerId, { total_actions_completed: 1, total_xp_earned: xp });
        return {
            success: true, xp, skillName: 'Carpentry',
            message: penType === 'coop'
                ? 'The coop is finished \u2014 boarded tight, with a door that latches. Something ought to live in it.'
                : 'Posts sunk, panels hung, gate swinging true. The paddock stands empty and waiting.',
        };
    } catch (err: any) {
        if (err?.message === 'NO_FARMSTEAD') return { success: false, error: 'No farmstead.' };
        if (err?.message?.startsWith('NO_TOOL:')) return { success: false, error: err.message.slice('NO_TOOL:'.length) };
        if (err?.message === 'SHORT_MATERIALS') return { success: false, error: 'You no longer have the materials.' };
        logger.error(`resolveBuildPen error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

// ── demolish a pen ──────────────────────────────────────────────────────────
// A pen you regret should come down. Without this, a player who builds the wrong
// kind in their only slot is stuck: a paddock cannot hold chickens, and the level
// needed for a second pen cannot be earned without animals to earn it from.
//
// Materials refund in full, and the action pays NO XP. That combination is what
// keeps it honest: build (180s, XP) plus demolish (90s, nothing) yields about 67%
// of the normal Carpentry rate, so cycling pens is strictly worse than simply
// crafting. Paying XP for demolition would invert that and make it a loop.

const DEMOLISH_SECONDS = Math.round(BUILD_PEN_SECONDS / 2);

export async function startDemolishPen(playerId: number, penId: number): Promise<{ ok: boolean; error?: string; timerSeconds?: number }> {
    const pen = await ownedPen(playerId, penId);
    if (!pen) return { ok: false, error: 'That is not your pen.' };

    const head = await db('player_animals').where({ pen_id: pen.id }).count({ c: '*' }).first();
    if (Number(head?.c ?? 0) > 0) {
        return { ok: false, error: 'Move the animals out before you pull it down.' };
    }

    const toolProblem = await missingBuildTool(playerId);
    if (toolProblem) return { ok: false, error: toolProblem };
    if (await busy(playerId)) return { ok: false, error: 'You are already performing an action.' };

    const { novita } = await playerProperty(playerId);
    await startAction(playerId, 'husbandry_demolish_pen', DEMOLISH_SECONDS, String(penId), novita?.id ?? null);
    return { ok: true, timerSeconds: DEMOLISH_SECONDS };
}

export async function resolveDemolishPen(playerId: number, penIdRaw: string | null): Promise<HusbandryActionResult> {
    try {
        let refund: { itemName: string; qty: number }[] = [];
        let penLabel = 'pen';

        await db.transaction(async (trx) => {
            const pen = await ownedPen(playerId, penIdRaw ? parseInt(penIdRaw) : 0, trx);
            if (!pen) throw new Error('NOT_YOURS');
            await trx('player_pens').where({ id: pen.id }).forUpdate().first();

            const head = await trx('player_animals').where({ pen_id: pen.id }).count({ c: '*' }).first();
            if (Number(head?.c ?? 0) > 0) throw new Error('OCCUPIED');

            penLabel = pen.pen_type === 'coop' ? 'coop' : 'paddock';

            // Refund what the pen at THIS position cost. Pen cost scales with how
            // many you have, and slot_index is not the same as position once
            // something has been demolished before, so count what is actually
            // standing and price the last one.
            const rows = await trx('player_pens')
                .where({ property_id: pen.property_id })
                .orderBy('slot_index', 'asc');
            refund = penCost(pen.pen_type, rows.length);

            for (const r of refund) await giveItem(playerId, r.itemName, r.qty, trx);
            await trx('player_pens').where({ id: pen.id }).delete();
        });

        await incrementStats(playerId, { total_actions_completed: 1 });
        return {
            success: true,
            xp: 0,
            skillName: 'Carpentry',
            itemName: refund[0]?.itemName,
            quantity: refund[0]?.qty,
            drops: refund.map((r) => ({ name: r.itemName, quantity: r.qty })),
            message: `You draw the nails and stack the timber. The ${penLabel} comes down, and everything that went into it comes back.`,
        };
    } catch (err: any) {
        const m: string = err?.message ?? '';
        if (m === 'NOT_YOURS') return { success: false, error: 'That is not your pen.' };
        if (m === 'OCCUPIED') return { success: false, error: 'Move the animals out before you pull it down.' };
        logger.error(`resolveDemolishPen error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

// ── stock a pen ─────────────────────────────────────────────────────────────
// Instant, not timed: setting a chick down is not work. The animal's clock does
// not start until the pen is fed.
export async function placeAnimal(playerId: number, penId: number, speciesId: number): Promise<HusbandryActionResult> {
    try {
        let name = '';
        let babyItem = '';

        await db.transaction(async (trx) => {
            const pen = await ownedPen(playerId, penId, trx);
            if (!pen) throw new Error('NOT_YOURS');
            // Lock the pen so two simultaneous placements cannot both see a free slot.
            await trx('player_pens').where({ id: pen.id }).forUpdate().first();

            const species = await trx('animal_species').where({ id: speciesId, is_active: true }).first();
            if (!species) throw new Error('UNKNOWN_SPECIES');

            const lvl = await skillLevel(playerId, 'Husbandry', trx);
            if (lvl < species.husbandry_level) throw new Error(`LEVEL:${species.husbandry_level}`);
            if (species.pen_type !== pen.pen_type) throw new Error(`WRONG_PEN:${species.pen_type}:${species.name}`);
            if (pen.species_id && pen.species_id !== species.id) {
                const held = await trx('animal_species').where({ id: pen.species_id }).first();
                throw new Error(`PEN_TAKEN:${held?.name?.toLowerCase() ?? 'other stock'}`);
            }

            const head = await trx('player_animals').where({ pen_id: pen.id }).count({ c: '*' }).first();
            if (Number(head?.c ?? 0) >= pen.capacity) throw new Error('PEN_FULL');

            const matCheck = await hasMaterials(playerId, [{ itemName: species.baby_item_name, qty: 1 }], trx);
            if (!matCheck.ok) throw new Error(`NO_BABY:${species.baby_item_name}`);
            await consumeMaterials(playerId, [{ itemName: species.baby_item_name, qty: 1 }], trx);

            name = randomName(species);
            babyItem = species.baby_item_name;
            await trx('player_animals').insert({
                player_id: playerId,
                pen_id: pen.id,
                species_id: species.id,
                name,
                grow_seconds_accrued: 0,
                product_seconds_accrued: 0,
                accrued_at: new Date(),
                mature_xp_paid: false,
                born_at: new Date(),
            });

            const patch: any = {};
            if (!pen.species_id) patch.species_id = species.id;
            // First head in an unmucked pen starts the muck clock.
            if (!pen.muck_due_at) patch.muck_due_at = new Date(Date.now() + MUCK_INTERVAL * 1000);
            if (Object.keys(patch).length) await trx('player_pens').where({ id: pen.id }).update(patch);

            await updateQuestObjectiveProgress(playerId, 'place_animal', species.name, 1);
        });

        return {
            success: true, skillName: 'Husbandry',
            message: `You set the ${babyItem.toLowerCase()} down in the pen. You decide to call it ${name}.`,
        };
    } catch (err: any) {
        const m: string = err?.message ?? '';
        if (m === 'NOT_YOURS') return { success: false, error: 'That is not your pen.' };
        if (m === 'UNKNOWN_SPECIES') return { success: false, error: 'Unknown animal.' };
        if (m.startsWith('LEVEL:')) return { success: false, error: `Requires Husbandry level ${m.split(':')[1]}.` };
        if (m.startsWith('WRONG_PEN:')) {
            const [, penType, sp] = m.split(':');
            return {
                success: false,
                error: penType === 'coop'
                    ? `A ${sp.toLowerCase()} belongs in a coop.`
                    : `A ${sp.toLowerCase()} needs a paddock.`,
            };
        }
        if (m.startsWith('PEN_TAKEN:')) return { success: false, error: `That pen is given over to ${m.slice('PEN_TAKEN:'.length)}.` };
        if (m === 'PEN_FULL') return { success: false, error: 'That pen is full.' };
        if (m.startsWith('NO_BABY:')) return { success: false, error: `You have no ${m.slice('NO_BABY:'.length)}.` };
        if (m === 'SHORT_MATERIALS') return { success: false, error: 'You no longer have that animal.' };
        logger.error(`placeAnimal error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

export async function renameAnimal(playerId: number, animalId: number, name: string): Promise<HusbandryActionResult> {
    const clean = (name ?? '').trim().slice(0, 40);
    if (clean.length < 1) return { success: false, error: 'That name is too short.' };
    if (!/^[A-Za-z0-9 '\-]+$/.test(clean)) return { success: false, error: 'Names may use letters, numbers, spaces, apostrophes and hyphens.' };

    const animal = await db('player_animals').where({ id: animalId, player_id: playerId }).first();
    if (!animal) return { success: false, error: 'That is not your animal.' };

    await db('player_animals').where({ id: animal.id }).update({ name: clean });
    return { success: true, message: `Renamed to ${clean}.` };
}

// ── feed ────────────────────────────────────────────────────────────────────
export async function startFeed(playerId: number, penId: number): Promise<{ ok: boolean; error?: string; timerSeconds?: number }> {
    const pen = await ownedPen(playerId, penId);
    if (!pen) return { ok: false, error: 'That is not your pen.' };
    if (!pen.species_id) return { ok: false, error: 'There is nothing in that pen to feed.' };
    if (!(await equippedTool(playerId, 'pail'))) return { ok: false, error: 'You need a Feed Pail equipped to carry feed.' };

    const animals = await db('player_animals').where({ pen_id: pen.id });
    if (!animals.length) return { ok: false, error: 'There is nothing in that pen to feed.' };

    // A fed pen cannot be fed again. Topping up early would let a player stack
    // fed time indefinitely and take the feeding XP every time they did it.
    if (pen.fed_until && new Date(pen.fed_until).getTime() > Date.now()) {
        return { ok: false, error: 'They have been fed. They will want more when the trough runs dry.' };
    }

    const species = await db('animal_species').where({ id: pen.species_id }).first();
    const cost = [{ itemName: species.feed_item_name, qty: species.feed_qty * animals.length }];
    const matCheck = await hasMaterials(playerId, cost);
    if (!matCheck.ok) {
        const m = matCheck.missing[0];
        return { ok: false, error: `You need ${m.need}x ${m.itemName} to feed them all (you have ${m.have}).` };
    }
    if (await busy(playerId)) return { ok: false, error: 'You are already performing an action.' };

    const { novita } = await playerProperty(playerId);
    const seconds = Math.max(5, animals.length * FEED_SECONDS_PER_HEAD);
    await startAction(playerId, 'husbandry_feed', seconds, String(penId), novita?.id ?? null);
    return { ok: true, timerSeconds: seconds };
}

export async function resolveFeed(playerId: number, penIdRaw: string | null): Promise<HusbandryActionResult> {
    try {
        let xp = 0;
        let head = 0;

        await db.transaction(async (trx) => {
            const pen = await ownedPen(playerId, penIdRaw ? parseInt(penIdRaw) : 0, trx);
            if (!pen || !pen.species_id) throw new Error('EMPTY_PEN');
            await trx('player_pens').where({ id: pen.id }).forUpdate().first();

            const animals = await accrueAllInPen(pen, trx);
            if (!animals.length) throw new Error('EMPTY_PEN');
            head = animals.length;

            if (pen.fed_until && new Date(pen.fed_until).getTime() > Date.now()) {
                throw new Error('ALREADY_FED');
            }

            const species = await trx('animal_species').where({ id: pen.species_id }).first();
            const cost = [{ itemName: species.feed_item_name, qty: species.feed_qty * animals.length }];
            const matCheck = await hasMaterials(playerId, cost, trx);
            if (!matCheck.ok) throw new Error(`SHORT_FEED:${species.feed_item_name}`);
            await consumeMaterials(playerId, cost, trx);

            // Always from NOW: the pen is empty by the time we get here, and
            // leaving it empty for a week costs the week rather than banking it.
            const now = Date.now();
            await trx('player_pens').where({ id: pen.id }).update({
                fed_until: new Date(now + FED_SECONDS * 1000),
            });
            await trx('player_animals').where({ pen_id: pen.id }).update({ accrued_at: new Date(now) });

            const lvl = await skillLevel(playerId, 'Husbandry', trx);
            xp = activeXpForSeconds(lvl, Math.max(5, animals.length * FEED_SECONDS_PER_HEAD));
            await awardXp(playerId, 'Husbandry', xp, trx);
            await updateQuestObjectiveProgress(playerId, 'feed', species.name, 1);
        });

        await incrementStats(playerId, { total_actions_completed: 1, total_xp_earned: xp });
        return {
            success: true, xp, skillName: 'Husbandry',
            message: `You tip out the feed and top up the water. ${head === 1 ? 'It eats' : 'They eat'} like nothing else is coming.`,
        };
    } catch (err: any) {
        const m: string = err?.message ?? '';
        if (m === 'EMPTY_PEN') return { success: false, error: 'There is nothing in that pen to feed.' };
        if (m === 'ALREADY_FED') return { success: false, error: 'They have been fed already.' };
        if (m.startsWith('SHORT_FEED:')) return { success: false, error: `You no longer have enough ${m.slice('SHORT_FEED:'.length)}.` };
        if (m === 'SHORT_MATERIALS') return { success: false, error: 'You no longer have enough feed.' };
        logger.error(`resolveFeed error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

// ── feed / muck every pen at once ───────────────────────────────────────────
// A farm at capacity is twelve pens, and walking twelve troughs one button at a
// time is bookkeeping rather than husbandry. Both round actions work through the
// pens in order and stop when the sack runs out, rather than refusing outright:
// feeding four of six pens is a better outcome than feeding none because the
// fifth was short.

/** Pens with animals that are actually hungry, in slot order. */
async function pensNeedingFeed(playerId: number, x: Ex = db) {
    const { property } = await playerProperty(playerId, x);
    if (!property) return [];
    const pens = await x('player_pens')
        .where({ property_id: property.id })
        .whereNotNull('species_id')
        .orderBy('slot_index', 'asc');
    const now = Date.now();
    const out = [];
    for (const pen of pens) {
        if (pen.fed_until && new Date(pen.fed_until).getTime() > now) continue;
        const head = await x('player_animals').where({ pen_id: pen.id }).count({ c: '*' }).first();
        if (Number(head?.c ?? 0) > 0) out.push(pen);
    }
    return out;
}

/** Pens with animals whose bedding is actually due, in slot order. */
async function pensNeedingMuck(playerId: number, x: Ex = db) {
    const { property } = await playerProperty(playerId, x);
    if (!property) return [];
    const pens = await x('player_pens')
        .where({ property_id: property.id })
        .orderBy('slot_index', 'asc');
    const now = Date.now();
    const out = [];
    for (const pen of pens) {
        if (pen.muck_due_at && new Date(pen.muck_due_at).getTime() > now) continue;
        const head = await x('player_animals').where({ pen_id: pen.id }).count({ c: '*' }).first();
        if (Number(head?.c ?? 0) > 0) out.push(pen);
    }
    return out;
}

/**
 * What a full round would cost, summed across the pens that need it. Feed is per
 * species (a cow eats 2, a chicken 1), bedding is a flat rate per head.
 */
async function roundCost(
    pens: any[], kind: 'feed' | 'muck', x: Ex = db,
): Promise<{ cost: { itemName: string; qty: number }[]; head: number }> {
    const totals = new Map<string, number>();
    let head = 0;

    for (const pen of pens) {
        const c = await x('player_animals').where({ pen_id: pen.id }).count({ c: '*' }).first();
        const n = Number(c?.c ?? 0);
        if (n < 1) continue;
        head += n;

        if (kind === 'muck') {
            totals.set(BEDDING.itemName, (totals.get(BEDDING.itemName) ?? 0) + BEDDING.perHead * n);
            continue;
        }
        const species = await x('animal_species').where({ id: pen.species_id }).first();
        if (!species) continue;
        totals.set(species.feed_item_name, (totals.get(species.feed_item_name) ?? 0) + species.feed_qty * n);
    }

    return { cost: [...totals].map(([itemName, qty]) => ({ itemName, qty })), head };
}

// Round actions take EXACTLY as long as doing the same pens one at a time.
//
// The first version was sub-linear, copying Collect All, and it was wrong on two
// counts. A round of six head came out at 18s while a single pen of three took
// 24s, so doing more work finished sooner. And since XP is band x seconds, the
// time discount quietly charged the player XP for the convenience: the same
// chores paid less because they used the better button.
//
// Collect All can afford a discount because its yield is fixed by what the
// animals produced. Feeding and mucking scale with the work, so the honest model
// is no discount at all. The button saves clicks, not labour, and a full round
// earns precisely what the individual rounds would have.
function feedRoundSeconds(head: number): number {
    return Math.max(5, head * FEED_SECONDS_PER_HEAD);
}

function muckRoundSeconds(pens: number): number {
    // Single-pen mucking is a flat cost regardless of head count, so a round is
    // simply that cost per pen.
    return Math.max(5, pens * MUCK_SECONDS);
}

export async function startFeedAll(playerId: number): Promise<{ ok: boolean; error?: string; timerSeconds?: number }> {
    if (!(await equippedTool(playerId, 'pail'))) {
        return { ok: false, error: 'You need a Feed Pail equipped to carry feed.' };
    }
    const pens = await pensNeedingFeed(playerId);
    if (!pens.length) return { ok: false, error: 'Every pen has been fed.' };

    // Check the whole round up front. The resolve loop still stops gracefully if
    // stock changes in the meantime, but nobody should sit through a timer only
    // to be told they had no grain when they pressed the button.
    const { cost, head } = await roundCost(pens, 'feed');
    const matCheck = await hasMaterials(playerId, cost);
    if (!matCheck.ok) {
        const m = matCheck.missing[0];
        return { ok: false, error: `A full round needs ${m.need}x ${m.itemName} (you have ${m.have}).` };
    }
    if (await busy(playerId)) return { ok: false, error: 'You are already performing an action.' };

    const { novita } = await playerProperty(playerId);
    const seconds = feedRoundSeconds(head);
    await startAction(playerId, 'husbandry_feed_all', seconds, null, novita?.id ?? null);
    return { ok: true, timerSeconds: seconds };
}

export async function resolveFeedAll(playerId: number): Promise<HusbandryActionResult> {
    try {
        let xp = 0;
        let fedPens = 0;
        let fedHead = 0;
        let ranShort = false;
        let shortItem = '';

        await db.transaction(async (trx) => {
            const pens = await pensNeedingFeed(playerId, trx);
            if (!pens.length) throw new Error('ALL_FED');

            const now = Date.now();
            for (const pen of pens) {
                const animals = await accrueAllInPen(pen, trx);
                if (!animals.length) continue;

                const species = await trx('animal_species').where({ id: pen.species_id }).first();
                const cost = [{ itemName: species.feed_item_name, qty: species.feed_qty * animals.length }];
                const matCheck = await hasMaterials(playerId, cost, trx);
                if (!matCheck.ok) {
                    // Out of feed: stop here and keep what has been done.
                    ranShort = true;
                    shortItem = species.feed_item_name;
                    break;
                }
                await consumeMaterials(playerId, cost, trx);

                await trx('player_pens').where({ id: pen.id }).update({
                    fed_until: new Date(now + FED_SECONDS * 1000),
                });
                await trx('player_animals').where({ pen_id: pen.id }).update({ accrued_at: new Date(now) });

                fedPens++;
                fedHead += animals.length;
                await updateQuestObjectiveProgress(playerId, 'feed', species.name, 1);
            }

            if (!fedPens) throw new Error(`NO_FEED:${shortItem}`);

            const lvl = await skillLevel(playerId, 'Husbandry', trx);
            // Priced on what was actually fed, so a round that ran short pays for
            // the pens it reached and no more.
            xp = activeXpForSeconds(lvl, feedRoundSeconds(fedHead));
            await awardXp(playerId, 'Husbandry', xp, trx);
        });

        await incrementStats(playerId, { total_actions_completed: 1, total_xp_earned: xp });
        return {
            success: true, xp, skillName: 'Husbandry',
            message: ranShort
                ? `You get round ${fedPens} ${fedPens === 1 ? 'pen' : 'pens'} before the ${shortItem.toLowerCase()} runs out. The rest go hungry.`
                : `You work along the troughs. ${fedHead} fed, ${fedPens} ${fedPens === 1 ? 'pen' : 'pens'}, nothing left wanting.`,
        };
    } catch (err: any) {
        const m: string = err?.message ?? '';
        if (m === 'ALL_FED') return { success: false, error: 'Every pen has been fed.' };
        if (m.startsWith('NO_FEED:')) {
            const item = m.slice('NO_FEED:'.length);
            return { success: false, error: item ? `You have no ${item} to feed with.` : 'You have nothing to feed them with.' };
        }
        logger.error(`resolveFeedAll error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

export async function startMuckAll(playerId: number): Promise<{ ok: boolean; error?: string; timerSeconds?: number }> {
    if (!(await equippedTool(playerId, 'fork'))) {
        return { ok: false, error: 'You need a Mucking Fork equipped.' };
    }
    const pens = await pensNeedingMuck(playerId);
    if (!pens.length) return { ok: false, error: 'No pen needs mucking out yet.' };

    const { cost, head } = await roundCost(pens, 'muck');
    const matCheck = await hasMaterials(playerId, cost);
    if (!matCheck.ok) {
        const m = matCheck.missing[0];
        return { ok: false, error: `A full round needs ${m.need}x ${m.itemName} (you have ${m.have}).` };
    }
    if (await busy(playerId)) return { ok: false, error: 'You are already performing an action.' };

    const { novita } = await playerProperty(playerId);
    const seconds = muckRoundSeconds(pens.length);
    await startAction(playerId, 'husbandry_muck_all', seconds, null, novita?.id ?? null);
    return { ok: true, timerSeconds: seconds };
}

export async function resolveMuckAll(playerId: number): Promise<HusbandryActionResult> {
    try {
        let xp = 0;
        let muckedPens = 0;
        let manure = 0;
        let ranShort = false;

        await db.transaction(async (trx) => {
            const pens = await pensNeedingMuck(playerId, trx);
            if (!pens.length) throw new Error('ALL_CLEAN');

            const now = Date.now();
            for (const pen of pens) {
                const animals = await accrueAllInPen(pen, trx);
                if (!animals.length) continue;

                const bedding = [{ itemName: BEDDING.itemName, qty: BEDDING.perHead * animals.length }];
                const beddingCheck = await hasMaterials(playerId, bedding, trx);
                if (!beddingCheck.ok) {
                    ranShort = true;
                    break;
                }
                await consumeMaterials(playerId, bedding, trx);

                manure += animals.length;
                await trx('player_pens').where({ id: pen.id }).update({
                    muck_due_at: new Date(now + MUCK_INTERVAL * 1000),
                });
                await trx('player_animals').where({ pen_id: pen.id }).update({ accrued_at: new Date(now) });

                muckedPens++;
            }

            if (!muckedPens) throw new Error('NO_BEDDING');

            await giveItem(playerId, 'Manure', manure, trx);

            const lvl = await skillLevel(playerId, 'Husbandry', trx);
            xp = activeXpForSeconds(lvl, muckRoundSeconds(muckedPens));
            await awardXp(playerId, 'Husbandry', xp, trx);
            await updateQuestObjectiveProgress(playerId, 'muck', 'Pen', muckedPens);
        });

        await incrementStats(playerId, { total_actions_completed: 1, total_xp_earned: xp });
        return {
            success: true, xp, skillName: 'Husbandry',
            itemName: 'Manure', quantity: manure,
            drops: [{ name: 'Manure', quantity: manure }],
            message: ranShort
                ? `You clear ${muckedPens} ${muckedPens === 1 ? 'pen' : 'pens'} before the straw runs out.`
                : `You fork out every pen and lay fresh straw throughout. ${muckedPens} done.`,
        };
    } catch (err: any) {
        const m: string = err?.message ?? '';
        if (m === 'ALL_CLEAN') return { success: false, error: 'No pen needs mucking out yet.' };
        if (m === 'NO_BEDDING') return { success: false, error: `You have no ${BEDDING.itemName} for fresh bedding.` };
        logger.error(`resolveMuckAll error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

// ── muck ────────────────────────────────────────────────────────────────────
export async function startMuck(playerId: number, penId: number): Promise<{ ok: boolean; error?: string; timerSeconds?: number }> {
    const pen = await ownedPen(playerId, penId);
    if (!pen) return { ok: false, error: 'That is not your pen.' };
    if (!(await equippedTool(playerId, 'fork'))) return { ok: false, error: 'You need a Mucking Fork equipped.' };

    const head = await db('player_animals').where({ pen_id: pen.id }).count({ c: '*' }).first();
    const headCount = Number(head?.c ?? 0);
    if (headCount < 1) return { ok: false, error: 'An empty pen needs no mucking.' };

    // Only when it is actually due. Without this a player could muck on repeat
    // for unlimited manure and XP off a single pen.
    if (pen.muck_due_at && new Date(pen.muck_due_at).getTime() > Date.now()) {
        return { ok: false, error: 'The bedding is still clean. Leave it a while.' };
    }

    const bedding = [{ itemName: BEDDING.itemName, qty: BEDDING.perHead * headCount }];
    const beddingCheck = await hasMaterials(playerId, bedding);
    if (!beddingCheck.ok) {
        const m = beddingCheck.missing[0];
        return { ok: false, error: `You need ${m.need}x ${m.itemName} for fresh bedding (you have ${m.have}).` };
    }

    if (await busy(playerId)) return { ok: false, error: 'You are already performing an action.' };

    const { novita } = await playerProperty(playerId);
    await startAction(playerId, 'husbandry_muck', MUCK_SECONDS, String(penId), novita?.id ?? null);
    return { ok: true, timerSeconds: MUCK_SECONDS };
}

export async function resolveMuck(playerId: number, penIdRaw: string | null): Promise<HusbandryActionResult> {
    try {
        let xp = 0;
        let qty = 0;

        await db.transaction(async (trx) => {
            const pen = await ownedPen(playerId, penIdRaw ? parseInt(penIdRaw) : 0, trx);
            if (!pen) throw new Error('NOT_YOURS');
            await trx('player_pens').where({ id: pen.id }).forUpdate().first();

            const animals = await accrueAllInPen(pen, trx);
            if (!animals.length) throw new Error('EMPTY_PEN');

            if (pen.muck_due_at && new Date(pen.muck_due_at).getTime() > Date.now()) {
                throw new Error('NOT_DUE');
            }

            // Straw in, manure out — both scale with the stock standing in there.
            // This is manure's only faucet; farm_manure has been consuming
            // something nothing in the game produced.
            const bedding = [{ itemName: BEDDING.itemName, qty: BEDDING.perHead * animals.length }];
            const beddingCheck = await hasMaterials(playerId, bedding, trx);
            if (!beddingCheck.ok) throw new Error(`NO_BEDDING:${BEDDING.itemName}`);
            await consumeMaterials(playerId, bedding, trx);

            qty = Math.max(1, animals.length);
            await giveItem(playerId, 'Manure', qty, trx);

            const now = Date.now();
            await trx('player_pens').where({ id: pen.id }).update({
                muck_due_at: new Date(now + MUCK_INTERVAL * 1000),
            });
            // An overdue pen was contributing nothing; restart its clocks now.
            await trx('player_animals').where({ pen_id: pen.id }).update({ accrued_at: new Date(now) });

            const lvl = await skillLevel(playerId, 'Husbandry', trx);
            xp = activeXpForSeconds(lvl, MUCK_SECONDS);
            await awardXp(playerId, 'Husbandry', xp, trx);
            await updateQuestObjectiveProgress(playerId, 'muck', 'Pen', 1);
        });

        await incrementStats(playerId, { total_actions_completed: 1, total_xp_earned: xp });
        return {
            success: true, xp, skillName: 'Husbandry',
            itemName: 'Manure', quantity: qty,
            message: 'You fork out the soiled bedding and lay fresh straw. The pen smells of nothing much, which is the best it ever smells.',
        };
    } catch (err: any) {
        const m: string = err?.message ?? '';
        if (m === 'NOT_YOURS') return { success: false, error: 'That is not your pen.' };
        if (m === 'EMPTY_PEN') return { success: false, error: 'An empty pen needs no mucking.' };
        if (m === 'NOT_DUE') return { success: false, error: 'The bedding is still clean.' };
        if (m.startsWith('NO_BEDDING:')) return { success: false, error: `You no longer have enough ${m.slice('NO_BEDDING:'.length)}.` };
        logger.error(`resolveMuck error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

// ── collect (eggs, milk, truffles) ──────────────────────────────────────────
export async function startCollect(playerId: number, animalId: number): Promise<{ ok: boolean; error?: string; timerSeconds?: number }> {
    const animal = await db('player_animals').where({ id: animalId, player_id: playerId }).first();
    if (!animal) return { ok: false, error: 'That is not your animal.' };

    const pen = await db('player_pens').where({ id: animal.pen_id }).first();
    const species = await db('animal_species').where({ id: animal.species_id }).first();
    if (!species?.product_item_name) return { ok: false, error: 'There is nothing to collect from it.' };

    const fresh = await accrue(animal, pen);
    const stage = stageOf(fresh, species);
    if (stage === 'juvenile') return { ok: false, error: `${fresh.name} is not grown yet.` };
    if (!productReady(fresh, species, stage)) return { ok: false, error: `${fresh.name} has nothing for you yet.` };

    // Milking wants the pail; eggs and truffles are gathered by hand.
    if (species.product_item_name === 'Milk' && !(await equippedTool(playerId, 'pail'))) {
        return { ok: false, error: 'You need a Feed Pail equipped to milk.' };
    }

    // You milk INTO the pail, but it has to end up in something.
    if (isLiquid(species.product_item_name)
        && !(await canFill(playerId, species.product_item_name, species.product_qty))) {
        return { ok: false, error: 'You have nowhere to put it — you need an empty Lanai Bucket.' };
    }
    if (await busy(playerId)) return { ok: false, error: 'You are already performing an action.' };

    const { novita } = await playerProperty(playerId);
    await startAction(playerId, 'husbandry_collect', COLLECT_SECONDS, String(animalId), novita?.id ?? null);
    return { ok: true, timerSeconds: COLLECT_SECONDS };
}

export async function resolveCollect(playerId: number, animalIdRaw: string | null): Promise<HusbandryActionResult> {
    try {
        let xp = 0;
        let found = false;
        let qty = 0;
        let productItem = '';
        let animalName = '';
        let stage = 'adult';

        await db.transaction(async (trx) => {
            const animal = await trx('player_animals')
                .where({ id: animalIdRaw ? parseInt(animalIdRaw) : 0, player_id: playerId })
                .forUpdate().first();
            if (!animal) throw new Error('NOT_YOURS');

            const pen = await trx('player_pens').where({ id: animal.pen_id }).first();
            const species = await trx('animal_species').where({ id: animal.species_id }).first();
            if (!species?.product_item_name) throw new Error('NO_PRODUCT');

            const fresh = await accrue(animal, pen, Date.now(), trx);
            stage = stageOf(fresh, species);
            animalName = fresh.name;
            if (!productReady(fresh, species, stage)) throw new Error(`NOT_READY:${fresh.name}`);

            // Take the whole backlog at once. The clock keeps its remainder unless
            // the animal was at its cap, in which case the surplus is lost.
            const units = productUnits(fresh, species, stage);
            await trx('player_animals').where({ id: fresh.id }).update({
                product_seconds_accrued: accruedAfterCollect(fresh, species, stage, units),
            });

            // Each held unit rolls separately, so a sow's truffles stay finds
            // rather than becoming a guaranteed batch.
            let hits = 0;
            for (let i = 0; i < units; i++) {
                if (Math.random() * 100 < Number(species.product_chance)) hits++;
            }


            const lvl = await skillLevel(playerId, 'Husbandry', trx);
            const activeXp = activeXpForSeconds(lvl, COLLECT_SECONDS);
            found = hits > 0;

            if (!found) {
                xp = activeXp;
                await awardXp(playerId, 'Husbandry', xp, trx);
                return;
            }

            productItem = species.product_item_name;
            qty = hits * species.product_qty;
            if (isLiquid(productItem)) {
                // Pours into buckets; comes up short only if empties ran out.
                qty = await addLiquid(playerId, productItem, qty, trx);
                if (qty < 1) throw new Error('NO_ROOM');
            } else {
                await giveItem(playerId, productItem, qty, trx);
            }
            xp = species.xp_product * hits + activeXp;
            await awardXp(playerId, 'Husbandry', xp, trx);
            await updateQuestObjectiveProgress(playerId, 'collect', productItem, qty);
        });

        await incrementStats(playerId, { total_actions_completed: 1, total_xp_earned: xp });

        if (!found) {
            return {
                success: true, xp, skillName: 'Husbandry',
                message: `${animalName} snuffles the ground over and turns up nothing today.`,
            };
        }

        const verb = productItem === 'Milk'
            ? `You settle beside ${animalName} and milk her out.`
            : productItem === 'Egg'
                ? `You lift ${animalName} aside and find what she has been sitting on.`
                : `${animalName} roots at the earth and turns up something dark and knuckled.`;

        return {
            success: true, xp, skillName: 'Husbandry',
            itemName: productItem, quantity: qty,
            message: verb + (stage === 'elder' ? ' She is slower about it than she used to be.' : ''),
        };
    } catch (err: any) {
        const m: string = err?.message ?? '';
        if (m === 'NOT_YOURS') return { success: false, error: 'That is not your animal.' };
        if (m === 'NO_PRODUCT') return { success: false, error: 'There is nothing to collect from it.' };
        if (m.startsWith('NOT_READY:')) return { success: false, error: `${m.slice('NOT_READY:'.length)} has nothing for you yet.` };
        if (m === 'NO_ROOM') return { success: false, error: 'You have nowhere to put it — you need an empty Lanai Bucket.' };
        logger.error(`resolveCollect error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

// ── collect all (whole pen) ─────────────────────────────────────────────────
// Six hens, six buttons, six timers is not husbandry, it is data entry. One
// action walks the pen and clears everything ready in it.

export async function startCollectAll(playerId: number, penId: number): Promise<{ ok: boolean; error?: string; timerSeconds?: number }> {
    const pen = await ownedPen(playerId, penId);
    if (!pen || !pen.species_id) return { ok: false, error: 'There is nothing in that pen.' };

    const species = await db('animal_species').where({ id: pen.species_id }).first();
    if (!species?.product_item_name) return { ok: false, error: 'There is nothing to collect from them.' };

    const animals = await accrueAllInPen(pen);
    let units = 0;
    for (const a of animals) units += productUnits(a, species, stageOf(a, species));
    if (units < 1) return { ok: false, error: 'Nothing is ready yet.' };

    if (species.product_item_name === 'Milk' && !(await equippedTool(playerId, 'pail'))) {
        return { ok: false, error: 'You need a Feed Pail equipped to milk.' };
    }
    if (isLiquid(species.product_item_name)
        && !(await canFill(playerId, species.product_item_name, species.product_qty))) {
        return { ok: false, error: 'You have nowhere to put it — you need an empty Lanai Bucket.' };
    }
    if (await busy(playerId)) return { ok: false, error: 'You are already performing an action.' };

    const { novita } = await playerProperty(playerId);
    const seconds = collectAllSeconds(units);
    await startAction(playerId, 'husbandry_collect_all', seconds, String(penId), novita?.id ?? null);
    return { ok: true, timerSeconds: seconds };
}

/** Scales with the work, but sub-linearly — a full pen should beat six singles. */
function collectAllSeconds(units: number): number {
    return Math.max(COLLECT_SECONDS, Math.round(COLLECT_SECONDS * 0.6 * Math.max(1, units) ** 0.7));
}

export async function resolveCollectAll(playerId: number, penIdRaw: string | null): Promise<HusbandryActionResult> {
    try {
        let xp = 0;
        let qty = 0;
        let productItem = '';
        let animalsWorked = 0;

        await db.transaction(async (trx) => {
            const pen = await ownedPen(playerId, penIdRaw ? parseInt(penIdRaw) : 0, trx);
            if (!pen || !pen.species_id) throw new Error('EMPTY_PEN');
            await trx('player_pens').where({ id: pen.id }).forUpdate().first();

            const species = await trx('animal_species').where({ id: pen.species_id }).first();
            if (!species?.product_item_name) throw new Error('NO_PRODUCT');
            productItem = species.product_item_name;

            const animals = await accrueAllInPen(pen, trx);
            const liquid = isLiquid(productItem);
            let totalUnits = 0;
            let hits = 0;

            for (const a of animals) {
                const stage = stageOf(a, species);
                const units = productUnits(a, species, stage);
                if (units < 1) continue;
                animalsWorked++;
                totalUnits += units;

                // Unit by unit: each rolls separately so truffles stay finds, and
                // we stop the moment the player runs out of room. Units not
                // reached stay on the animal rather than evaporating.
                let taken = 0;
                for (let i = 0; i < units; i++) {
                    taken++;
                    if (Math.random() * 100 < Number(species.product_chance)) hits++;
                }

                await trx('player_animals').where({ id: a.id }).update({
                    product_seconds_accrued: accruedAfterCollect(a, species, stage, taken),
                });
            }

            if (totalUnits < 1) throw new Error('NOT_READY');

            const lvl = await skillLevel(playerId, 'Husbandry', trx);
            xp = species.xp_product * hits + activeXpForSeconds(lvl, collectAllSeconds(totalUnits));

            if (hits > 0) {
                qty = hits * species.product_qty;
                if (liquid) {
                    // Short only when the empties ran out mid-pen; whatever fit
                    // is kept, and the rest of the milk is spilt rather than
                    // silently banked.
                    qty = await addLiquid(playerId, productItem, qty, trx);
                } else {
                    await giveItem(playerId, productItem, qty, trx);
                }
                if (qty > 0) await updateQuestObjectiveProgress(playerId, 'collect', productItem, qty);
            }
            await awardXp(playerId, 'Husbandry', xp, trx);
        });

        await incrementStats(playerId, { total_actions_completed: 1, total_xp_earned: xp });

        if (qty < 1) {
            return {
                success: true, xp, skillName: 'Husbandry',
                message: 'You go along the pen and come away with nothing worth carrying.',
            };
        }
        return {
            success: true, xp, skillName: 'Husbandry',
            itemName: productItem, quantity: qty,
            message: `You work along the pen and come away with ${qty} ${productItem.toLowerCase()} from ${animalsWorked} of them.`,
        };
    } catch (err: any) {
        const m: string = err?.message ?? '';
        if (m === 'EMPTY_PEN') return { success: false, error: 'There is nothing in that pen.' };
        if (m === 'NO_PRODUCT') return { success: false, error: 'There is nothing to collect from them.' };
        if (m === 'NOT_READY') return { success: false, error: 'Nothing is ready yet.' };
        logger.error(`resolveCollectAll error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

// ── slaughter ───────────────────────────────────────────────────────────────
export async function startSlaughter(playerId: number, animalId: number): Promise<{ ok: boolean; error?: string; timerSeconds?: number }> {
    const animal = await db('player_animals').where({ id: animalId, player_id: playerId }).first();
    if (!animal) return { ok: false, error: 'That is not your animal.' };

    const pen = await db('player_pens').where({ id: animal.pen_id }).first();
    const species = await db('animal_species').where({ id: animal.species_id }).first();
    if (species.mount_item_name) return { ok: false, error: 'That is a riding animal.' };

    const fresh = await accrue(animal, pen);
    if (stageOf(fresh, species) === 'juvenile') return { ok: false, error: `${fresh.name} is not grown yet.` };
    if (!(await equippedTool(playerId, 'butcher_knife'))) {
        return { ok: false, error: 'You need an Ambren Butchering Knife equipped.' };
    }
    if (await busy(playerId)) return { ok: false, error: 'You are already performing an action.' };

    const { novita } = await playerProperty(playerId);
    await startAction(playerId, 'husbandry_slaughter', SLAUGHTER_SECONDS, String(animalId), novita?.id ?? null);
    return { ok: true, timerSeconds: SLAUGHTER_SECONDS };
}

export async function resolveSlaughter(playerId: number, animalIdRaw: string | null): Promise<HusbandryActionResult> {
    try {
        let xp = 0;
        let firstItem: string | undefined;
        let firstQty = 0;
        let animalName = '';
        const drops: { name: string; quantity: number }[] = [];

        await db.transaction(async (trx) => {
            const animal = await trx('player_animals')
                .where({ id: animalIdRaw ? parseInt(animalIdRaw) : 0, player_id: playerId })
                .forUpdate().first();
            if (!animal) throw new Error('NOT_YOURS');

            const pen = await trx('player_pens').where({ id: animal.pen_id }).first();
            const species = await trx('animal_species').where({ id: animal.species_id }).first();
            if (species.mount_item_name) throw new Error('IS_MOUNT');

            const fresh = await accrue(animal, pen, Date.now(), trx);
            if (stageOf(fresh, species) === 'juvenile') throw new Error(`JUVENILE:${fresh.name}`);
            animalName = fresh.name;

            // Drops are FULL value at any adult age — a fresh adult butchers out
            // the same as an elder. Only the XP is weighted by life lived.
            const table = JSON.parse(species.slaughter_table || '[]');
            for (const drop of table) {
                if (Math.random() * 100 >= (drop.chance ?? 100)) continue;
                const q = drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1));
                if (q < 1) continue;
                await giveItem(playerId, drop.itemName, q, trx);
                drops.push({ name: drop.itemName, quantity: q });
                if (!firstItem) { firstItem = drop.itemName; firstQty = q; }
            }

            const fraction = lifeFraction(fresh, species);
            const lvl = await skillLevel(playerId, 'Husbandry', trx);
            xp = Math.max(1, Math.round(species.xp_slaughter * fraction))
                + activeXpForSeconds(lvl, SLAUGHTER_SECONDS);

            await trx('player_animals').where({ id: fresh.id }).delete();
            await clearPenIfEmpty(pen, trx);
            await awardXp(playerId, 'Husbandry', xp, trx);
            await updateQuestObjectiveProgress(playerId, 'slaughter', species.name, 1);
        });

        await incrementStats(playerId, { total_actions_completed: 1, total_xp_earned: xp });
        return {
            success: true, xp, skillName: 'Husbandry',
            itemName: firstItem, quantity: firstQty, drops,
            message: `You do the work quickly and cleanly. ${animalName} keeps the household fed a while yet.`,
        };
    } catch (err: any) {
        const m: string = err?.message ?? '';
        if (m === 'NOT_YOURS') return { success: false, error: 'That is not your animal.' };
        if (m === 'IS_MOUNT') return { success: false, error: 'That is a riding animal.' };
        if (m.startsWith('JUVENILE:')) return { success: false, error: `${m.slice('JUVENILE:'.length)} is not grown yet.` };
        logger.error(`resolveSlaughter error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

// ── slaughter all (whole pen) ───────────────────────────────────────────────
// Clearing a pen of elders to start the wheel again should not be six separate
// confirmations. Mounts are skipped: they leave the pen by halter, never by knife.

export async function startSlaughterAll(playerId: number, penId: number): Promise<{ ok: boolean; error?: string; timerSeconds?: number }> {
    const pen = await ownedPen(playerId, penId);
    if (!pen || !pen.species_id) return { ok: false, error: 'There is nothing in that pen.' };

    const species = await db('animal_species').where({ id: pen.species_id }).first();
    if (species.mount_item_name) return { ok: false, error: 'Those are riding animals.' };

    const animals = await accrueAllInPen(pen);
    const grown = animals.filter((a) => stageOf(a, species) !== 'juvenile');
    if (!grown.length) return { ok: false, error: 'None of them are grown yet.' };

    if (!(await equippedTool(playerId, 'butcher_knife'))) {
        return { ok: false, error: 'You need an Ambren Butchering Knife equipped.' };
    }
    if (await busy(playerId)) return { ok: false, error: 'You are already performing an action.' };

    const { novita } = await playerProperty(playerId);
    const seconds = slaughterAllSeconds(grown.length);
    await startAction(playerId, 'husbandry_slaughter_all', seconds, String(penId), novita?.id ?? null);
    return { ok: true, timerSeconds: seconds };
}

function slaughterAllSeconds(count: number): number {
    return Math.max(SLAUGHTER_SECONDS, Math.round(SLAUGHTER_SECONDS * 0.7 * Math.max(1, count) ** 0.75));
}

export async function resolveSlaughterAll(playerId: number, penIdRaw: string | null): Promise<HusbandryActionResult> {
    try {
        let xp = 0;
        let killed = 0;
        let firstItem: string | undefined;
        let firstQty = 0;
        const drops: { name: string; quantity: number }[] = [];

        await db.transaction(async (trx) => {
            const pen = await ownedPen(playerId, penIdRaw ? parseInt(penIdRaw) : 0, trx);
            if (!pen || !pen.species_id) throw new Error('EMPTY_PEN');
            await trx('player_pens').where({ id: pen.id }).forUpdate().first();

            const species = await trx('animal_species').where({ id: pen.species_id }).first();
            if (species.mount_item_name) throw new Error('IS_MOUNT');

            const animals = await accrueAllInPen(pen, trx);
            const table = JSON.parse(species.slaughter_table || '[]');
            const tally = new Map<string, number>();
            let speciesXp = 0;

            for (const a of animals) {
                if (stageOf(a, species) === 'juvenile') continue;   // the young are spared
                killed++;

                for (const drop of table) {
                    if (Math.random() * 100 >= (drop.chance ?? 100)) continue;
                    const q = drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1));
                    if (q < 1) continue;
                    tally.set(drop.itemName, (tally.get(drop.itemName) ?? 0) + q);
                }

                speciesXp += Math.max(1, Math.round(species.xp_slaughter * lifeFraction(a, species)));
                await trx('player_animals').where({ id: a.id }).delete();
            }

            if (!killed) throw new Error('NONE_GROWN');

            for (const [itemName, q] of tally) {
                await giveItem(playerId, itemName, q, trx);
                drops.push({ name: itemName, quantity: q });
                if (!firstItem) { firstItem = itemName; firstQty = q; }
            }

            await clearPenIfEmpty(pen, trx);

            const lvl = await skillLevel(playerId, 'Husbandry', trx);
            xp = speciesXp + activeXpForSeconds(lvl, slaughterAllSeconds(killed));
            await awardXp(playerId, 'Husbandry', xp, trx);
            await updateQuestObjectiveProgress(playerId, 'slaughter', species.name, killed);
        });

        await incrementStats(playerId, { total_actions_completed: 1, total_xp_earned: xp });
        return {
            success: true, xp, skillName: 'Husbandry',
            itemName: firstItem, quantity: firstQty, drops,
            message: `You work through the pen. ${killed} of them, done quickly, and the larder is full.`,
        };
    } catch (err: any) {
        const m: string = err?.message ?? '';
        if (m === 'EMPTY_PEN') return { success: false, error: 'There is nothing in that pen.' };
        if (m === 'IS_MOUNT') return { success: false, error: 'Those are riding animals.' };
        if (m === 'NONE_GROWN') return { success: false, error: 'None of them are grown yet.' };
        logger.error(`resolveSlaughterAll error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

// ── tame a mount ────────────────────────────────────────────────────────────
export async function startTame(playerId: number, animalId: number): Promise<{ ok: boolean; error?: string; timerSeconds?: number }> {
    const animal = await db('player_animals').where({ id: animalId, player_id: playerId }).first();
    if (!animal) return { ok: false, error: 'That is not your animal.' };

    const pen = await db('player_pens').where({ id: animal.pen_id }).first();
    const species = await db('animal_species').where({ id: animal.species_id }).first();
    if (!species.mount_item_name) return { ok: false, error: 'That animal was not raised to be ridden.' };

    const fresh = await accrue(animal, pen);
    if (stageOf(fresh, species) === 'juvenile') return { ok: false, error: `${fresh.name} is not grown yet.` };
    if (!(await equippedTool(playerId, 'halter'))) return { ok: false, error: 'You need a Halter & Lead equipped.' };
    if (await busy(playerId)) return { ok: false, error: 'You are already performing an action.' };

    const { novita } = await playerProperty(playerId);
    await startAction(playerId, 'husbandry_tame', TAME_SECONDS, String(animalId), novita?.id ?? null);
    return { ok: true, timerSeconds: TAME_SECONDS };
}

export async function resolveTame(playerId: number, animalIdRaw: string | null): Promise<HusbandryActionResult> {
    try {
        let xp = 0;
        let mountItem = '';
        let animalName = '';

        await db.transaction(async (trx) => {
            const animal = await trx('player_animals')
                .where({ id: animalIdRaw ? parseInt(animalIdRaw) : 0, player_id: playerId })
                .forUpdate().first();
            if (!animal) throw new Error('NOT_YOURS');

            const pen = await trx('player_pens').where({ id: animal.pen_id }).first();
            const species = await trx('animal_species').where({ id: animal.species_id }).first();
            if (!species.mount_item_name) throw new Error('NOT_MOUNT');

            const fresh = await accrue(animal, pen, Date.now(), trx);
            if (stageOf(fresh, species) === 'juvenile') throw new Error(`JUVENILE:${fresh.name}`);
            animalName = fresh.name;
            mountItem = species.mount_item_name;

            // A mount leaves the pen as an item, and an item does not age.
            // Collecting one the moment it matures is the intended play, so this
            // payout is flat rather than weighted by life lived.
            await giveItem(playerId, mountItem, 1, trx);
            await trx('player_animals').where({ id: fresh.id }).delete();
            await clearPenIfEmpty(pen, trx);

            const lvl = await skillLevel(playerId, 'Husbandry', trx);
            xp = species.xp_slaughter + activeXpForSeconds(lvl, TAME_SECONDS);
            await awardXp(playerId, 'Husbandry', xp, trx);
            await updateQuestObjectiveProgress(playerId, 'tame', species.name, 1);
        });

        await incrementStats(playerId, { total_actions_completed: 1, total_xp_earned: xp });
        return {
            success: true, xp, skillName: 'Husbandry',
            itemName: mountItem, quantity: 1,
            message: `${animalName} takes the halter without much fuss. Yours now, and grown enough to carry you.`,
        };
    } catch (err: any) {
        const m: string = err?.message ?? '';
        if (m === 'NOT_YOURS') return { success: false, error: 'That is not your animal.' };
        if (m === 'NOT_MOUNT') return { success: false, error: 'That animal was not raised to be ridden.' };
        if (m.startsWith('JUVENILE:')) return { success: false, error: `${m.slice('JUVENILE:'.length)} is not grown yet.` };
        logger.error(`resolveTame error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

/** An emptied pen releases its species lock, so it can be turned to other stock. */
async function clearPenIfEmpty(pen: any, x: Ex = db): Promise<void> {
    if (!pen) return;
    const left = await x('player_animals').where({ pen_id: pen.id }).count({ c: '*' }).first();
    if (Number(left?.c ?? 0) === 0) {
        await x('player_pens').where({ id: pen.id }).update({ species_id: null, muck_due_at: null });
    }
}
