import db from '../db';
import { logger } from '../lib/logger';
import { levelFromXp, levelTaper } from './xp';
import { incrementStats } from './stats';
import { updateQuestObjectiveProgress } from '../routes/quests';
import { missingBuildTool, BUILD_MALLET, BUILD_SAW } from './construction';
import { awardXp as awardSkillXp } from './xp';

// Farming M1 (docs/homestead-farming-spec.md). A player builds a farmstead at
// Novita, encloses fields, then works them: till → sow → (passive grow) → harvest.
//
// Every player-driven step is a TIMED action resolved by the game tick, not an
// instant call: raising the farmstead is a long Carpentry job, and tilling, sowing,
// and harvesting are real Farming work. Growth itself stays passive and real-time
// (ready_at, checked on read — the tanning-job pattern).
//
// XP: the timed steps pay the ACTIVE rate for the seconds spent. Harvesting pays
// that on top of the crop's per-seed XP, which is where the bulk of the skill's
// experience lands — see harvestSeedXp below for the two rules that keep it in
// check: a level taper, and perennials paying in full only on the first harvest.

// The only town where a farmstead may be raised (see startEstablish). Exported
// so the manual's training-path can name the town rather than guessing, and so
// a second farming town later means changing one line.
export const FARMSTEAD_TOWN = 'Novita';
const NOVITA = FARMSTEAD_TOWN;
export const PLOT_CAPACITY = 10;          // seeds per plot
const PLOT_MAX = 20;                      // hard ceiling (end-game)
const CARPENTRY_REQ = 1;
// Building is joinery. Tools are held, not consumed. The mallet is the tool in
// your hands, so it must be EQUIPPED (mainhand) like the hoe on tilling; the saw
// is bench kit and only needs to be carried.
const BUILD_TOOLS = [BUILD_MALLET.itemName, BUILD_SAW.itemName];

export const FARM_ESTABLISH_COST = [
    { itemName: 'Lanai Planks', qty: 500 },
    { itemName: 'Granite Block', qty: 500 },
    { itemName: 'Ambren Nails', qty: 1000 },
];

// ── timers (seconds) ────────────────────────────────────────────────────────
const ESTABLISH_SECONDS = 600;            // raising a farmstead is a day's work
const ESTABLISH_XP_BONUS = 1.25;          // pays a little over normal carpentry
const BUILD_PLOT_SECONDS = 180;           // fencing a field
const TILL_SECONDS = 90;                  // rare, but real work
const SOW_SECONDS_PER_SEED = 6;           // 60s for a full 10-seed plot
export const HARVEST_SECONDS_PER_SEED = 8; // 80s for a full plot

// ── soil (M2) ───────────────────────────────────────────────────────────────
// Three states. A hungry crop drops the soil a step when harvested; legumes lift
// it; a field left to rest lifts slowly; manure lifts it at once. Soil scales the
// HARVEST YIELD only — never XP, since the work was the same either way.
const SOIL_ORDER = ['depleted', 'normal', 'rich'];
const SOIL_YIELD: Record<string, number> = { depleted: 0.6, normal: 1.0, rich: 1.25 };
const FALLOW_SECONDS = 18 * 3600;   // one step of recovery per 18h at rest
const MANURE_SECONDS = 60;
const TEND_SECONDS_PER_PLOT = 15;
const TEND_SPEEDUP = 0.10;          // trims 10% off each plot's REMAINING grow time
const MANURE_COST = 5;

function shiftSoil(state: string, dir: number): string {
    const i = SOIL_ORDER.indexOf(state);
    const next = Math.max(0, Math.min(SOIL_ORDER.length - 1, (i < 0 ? 1 : i) + dir));
    return SOIL_ORDER[next];
}

// Fallow recovery, applied on read the same way growth is.
async function refreshFallow(propertyId: number): Promise<void> {
    const plots = await db('farm_plots')
        .where({ property_id: propertyId })
        .whereNull('crop_id')
        .whereNotNull('rested_since');
    const now = Date.now();
    for (const p of plots) {
        if (p.soil_state === 'rich') continue;
        const elapsed = (now - new Date(p.rested_since).getTime()) / 1000;
        const steps = Math.floor(elapsed / FALLOW_SECONDS);
        if (steps < 1) continue;
        const idx = SOIL_ORDER.indexOf(p.soil_state);
        const room = (SOIL_ORDER.length - 1) - (idx < 0 ? 1 : idx);
        const applied = Math.min(steps, room);
        if (applied < 1) continue;
        await db('farm_plots').where({ id: p.id }).update({
            soil_state: shiftSoil(p.soil_state, applied),
            rested_since: new Date(new Date(p.rested_since).getTime() + applied * FALLOW_SECONDS * 1000),
        });
    }
}

// XP band (matches the balance calculator): active rate = 1.10 x 2000 x 1.33^((L-1)/12)
const XP_REF_BASE = 2000;
const XP_GROWTH = Math.pow(1.33, 1 / 12);
const UNLOCK_DIP = 1.10;
export function activeXpForSeconds(level: number, seconds: number): number {
    const ratePerHour = UNLOCK_DIP * XP_REF_BASE * Math.pow(XP_GROWTH, Math.max(0, level - 1));
    return Math.max(1, Math.round((ratePerHour * seconds) / 3600));
}

// Plots are built one at a time and capped by Farming level: 1 at level 1,
// +1 every 3 levels, hitting the 20 ceiling around level 57.
export function plotCapForLevel(level: number): number {
    return Math.min(PLOT_MAX, 1 + Math.floor(level / 3));
}

// Enclosing a field: fencing plus a stone border. Escalates per plot.
export function plotCost(plotNumber: number): { itemName: string; qty: number }[] {
    const step = plotNumber - 1;
    return [
        { itemName: 'Fence Panel', qty: 10 + step * 5 },
        { itemName: 'Granite Block', qty: 15 + step * 10 },
    ];
}

export interface FarmActionResult {
    success: boolean;
    error?: string;
    xp?: number;
    skillName?: string;
    itemName?: string;
    quantity?: number;
    message?: string;
    /**
     * The XP each unit of work should price a gold find from: one entry per
     * field harvested. It is the ACTIVE part only — the seconds of digging —
     * because a harvest's total is mostly per-seed XP for the growing wait, and
     * gold is priced from attention, never elapsed time (services/goldFinds.ts).
     */
    goldBasisXp?: number[];
}

// ── helpers ────────────────────────────────────────────────────────────────
async function itemByName(name: string) {
    return db('items').where({ name }).first();
}

/**
 * The per-seed XP a harvest pays. Farming is a processing skill.
 *
 * The seed is the input, the plot is a slow furnace, the crop is the output.
 * Every seed in the game comes from foraging — no harvest or recipe makes one —
 * so each annual harvest is paid for by a seed somebody went and found, and
 * paying per seed is the same bargain smelting makes per ore.
 *
 * That model was always right. Two things went wrong around it, and this
 * function carries one rule for each.
 *
 * PERENNIALS. A perennial is sown once and then fruits indefinitely, so paying
 * full per-seed XP on every regrowth paid, forever, for a seed nobody replaced.
 * Strawberry and Raspberry are tier 1 crops, and that is how a player reached
 * Farming 57 on tier 1 crops while their next best skill sat thirteen levels
 * back. Now the first harvest after sowing pays in full, since that one used a
 * seed, and every regrowth pays PERENNIAL_REGROWTH_SHARE of it. A perennial is
 * a low-effort trickle; an annual is the full rate for the work of re-sowing.
 *
 * THE LEVEL GAP. Plots multiply twenty-fold between Farming 1 and 57 while the
 * XP band grows about fourfold, so a per-seed model left alone lets a full farm
 * of an early crop outrun the band late on. The fix players already understand
 * from every MMO: a crop far below you teaches less. It teaches in full until
 * it is TAPER_GRACE_LEVELS (services/xp.ts) below you, then in proportion to the gap. Nothing is
 * capped and nothing is taken away — more fields are always more XP — but a
 * level 7 crop cannot carry anyone to level 57. The taper also says, plainly,
 * when a player has outgrown their crops, which is the signal for the next rung
 * of the crop ladder rather than a wall.
 *
 * Considered and rejected on the way here, so nobody has to re-derive it: a
 * band-anchored payout divided by plot count (correct maths, but it has to pay
 * "less per field as you build more" and reads as dishonest); a daily XP
 * allowance (it works, and players hate a cap); pricing the wait against work
 * seconds (makes a 20-hour crop pay less per hour waited than a 12-hour one).
 */
// The taper itself lives in services/xp.ts, shared with Husbandry.
export const PERENNIAL_REGROWTH_SHARE = 0.2;

/**
 * A new farmer learns faster, for the first few levels.
 *
 * A level 1 farm is one plot, so however fair the per-seed price, the skill
 * opens at about 0.17x the band — slow enough that a player trying it out has
 * no reason to stay. This multiplies the per-seed XP by 1 + NOVICE_BONUS at
 * level 1, fading in a straight line to nothing at NOVICE_UNTIL_LEVEL, so the
 * first harvests feel like progress and the bonus is gone well before the
 * mid-game, where the plot count carries the rate on its own.
 *
 * It fades out at 10 rather than 8 on purpose: at 8 the bonus ends while the
 * farm is still three plots, and the rate would drop from 0.9x to 0.7x for no
 * reason a player could see.
 */
export const NOVICE_BONUS = 1.5;
export const NOVICE_UNTIL_LEVEL = 10;

function noviceMultiplier(level: number): number {
    const remaining = Math.max(0, (NOVICE_UNTIL_LEVEL - level) / (NOVICE_UNTIL_LEVEL - 1));
    return 1 + NOVICE_BONUS * remaining;
}

export function harvestSeedXp(
    level: number,
    crop: { xp_per_seed: number; plant_level: number; is_perennial?: boolean },
    seedCount: number,
    harvestsSinceSow: number,
): number {
    if (seedCount < 1) return 0;

    const taper = levelTaper(crop.plant_level, level);
    const regrowth = crop.is_perennial && harvestsSinceSow > 0 ? PERENNIAL_REGROWTH_SHARE : 1;

    return Math.max(1, Math.round(
        seedCount * crop.xp_per_seed * taper * regrowth * noviceMultiplier(level),
    ));
}

async function skillLevel(playerId: number, skillName: string): Promise<number> {
    const skill = await db('skills').where({ name: skillName }).first();
    if (!skill) return 1;
    const ps = await db('player_skills').where({ player_id: playerId, skill_id: skill.id }).first();
    return ps ? levelFromXp(ps.xp) : 1;
}

async function inventoryQty(playerId: number, itemName: string): Promise<number> {
    const item = await itemByName(itemName);
    if (!item) return 0;
    const inv = await db('player_inventory').where({ player_id: playerId, item_id: item.id }).first();
    return inv?.quantity ?? 0;
}

async function hasMaterials(playerId: number, cost: { itemName: string; qty: number }[]) {
    const missing: { itemName: string; need: number; have: number }[] = [];
    for (const c of cost) {
        const have = await inventoryQty(playerId, c.itemName);
        if (have < c.qty) missing.push({ itemName: c.itemName, need: c.qty, have });
    }
    return { ok: missing.length === 0, missing };
}

async function consumeMaterials(playerId: number, cost: { itemName: string; qty: number }[]) {
    for (const c of cost) {
        const item = await itemByName(c.itemName);
        if (!item) throw new Error(`consumeMaterials: missing item ${c.itemName}`);
        const inv = await db('player_inventory').where({ player_id: playerId, item_id: item.id }).first();
        if (!inv || inv.quantity < c.qty) throw new Error(`consumeMaterials: short on ${c.itemName}`);
        if (inv.quantity === c.qty) await db('player_inventory').where({ id: inv.id }).delete();
        else await db('player_inventory').where({ id: inv.id }).update({ quantity: inv.quantity - c.qty });
    }
}

async function giveItem(playerId: number, itemName: string, qty: number) {
    const item = await itemByName(itemName);
    if (!item) throw new Error(`giveItem: missing item ${itemName}`);
    const inv = await db('player_inventory').where({ player_id: playerId, item_id: item.id }).first();
    if (inv) await db('player_inventory').where({ id: inv.id }).increment('quantity', qty);
    else await db('player_inventory').insert({ player_id: playerId, item_id: item.id, quantity: qty });
}

// Build-tool checks live in services/construction.ts. The old local version
// treated the saw as merely CARRIED, which let a player build with it sitting
// in the pack. Do not reintroduce a copy here.

// Non-build tools (the hoe) are still checked locally. Mainhand only.
async function equippedTool(playerId: number, subtype: string) {
    const equipment = await db('player_equipment').where({ player_id: playerId }).first();
    const id = equipment?.mainhand_item_id;
    if (!id) return null;
    return db('items').where({ id, subtype }).first();
}

// Thin local name over the shared writer in services/xp.ts.
async function awardXp(playerId: number, skillName: string, xp: number): Promise<void> {
    await awardSkillXp(playerId, skillName, xp);
}

async function playerProperty(playerId: number) {
    const novita = await db('locations').where({ name: NOVITA }).first();
    if (!novita) return { novita: null, property: null };
    const property = await db('player_properties')
        .where({ player_id: playerId, location_id: novita.id, type: 'farmstead' }).first();
    return { novita, property };
}

async function ownedPlot(playerId: number, plotId: number) {
    return db('farm_plots')
        .join('player_properties', 'farm_plots.property_id', 'player_properties.id')
        .where('farm_plots.id', plotId)
        .where('player_properties.player_id', playerId)
        .select('farm_plots.*')
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
        auto_restart: false,
        last_bot_check: now,
        bot_check_pending: false,
    });
    return seconds;
}

// ── farm state ──────────────────────────────────────────────────────────────
export async function getFarmState(playerId: number) {
    const player = await db('players').where({ id: playerId }).select('current_location_id').first();
    const { novita, property } = await playerProperty(playerId);
    const atNovita = !!novita && player?.current_location_id === novita.id;

    const farmingLvl = await skillLevel(playerId, 'Farming');
    const hoe = await equippedTool(playerId, 'hoe');

    // Crops, with how many seeds the player is actually holding.
    const crops = await db('crops').where({ is_active: true }).orderBy('plant_level', 'asc');
    // What each crop actually teaches THIS player, from the same functions the
    // harvest pays through. Without it the level taper is invisible: a level 40
    // farmer planting Flax just earns less and has no way to know why, which
    // reads as a bug. Shown, it reads as advice — "you've outgrown this".
    const cropList = [];
    for (const c of crops) {
        const unlocked = farmingLvl >= c.plant_level;
        cropList.push({
            id: c.id, name: c.name, seedItem: c.seed_item_name, produceItem: c.produce_item_name,
            plantLevel: c.plant_level, growSeconds: c.grow_seconds, yieldPerSeed: c.yield_per_seed,
            cropType: c.crop_type, isPerennial: !!c.is_perennial,
            unlocked,
            seedsHeld: await inventoryQty(playerId, c.seed_item_name),
            // Per seed, on a first harvest (which is every harvest of an annual).
            xpPerSeed: unlocked ? harvestSeedXp(farmingLvl, c, 1, 0) : null,
            // A perennial's rate once it is established.
            regrowthXpPerSeed: unlocked && c.is_perennial ? harvestSeedXp(farmingLvl, c, 1, 1) : null,
            teachesPercent: unlocked ? Math.round(levelTaper(c.plant_level, farmingLvl) * 100) : null,
        });
    }
    // True once every crop the player can plant is below full teaching: the
    // plain-language signal that they have outgrown what they know.
    const unlockedCrops = cropList.filter((c) => c.unlocked);
    const outgrownCrops = unlockedCrops.length > 0
        && unlockedCrops.every((c) => (c.teachesPercent ?? 100) < 100);

    if (!property) {
        const matCheck = await hasMaterials(playerId, FARM_ESTABLISH_COST);
        return {
            hasFarmstead: false,
            atNovita,
            farmingLevel: farmingLvl,
            hasHoe: !!hoe,
            build: {
                carpentryReq: CARPENTRY_REQ,
                cost: FARM_ESTABLISH_COST,
                canAfford: matCheck.ok,
                missing: matCheck.missing,
                plotsGranted: 1,
                plotCapacity: PLOT_CAPACITY,
                seconds: ESTABLISH_SECONDS,
                tools: BUILD_TOOLS,
                missingTool: (await missingBuildTool(playerId))?.itemName ?? null,
            },
            crops: cropList,
        };
    }

    await refreshFallow(property.id);

    const plots = await db('farm_plots').where({ property_id: property.id }).orderBy('slot_index', 'asc');
    const now = Date.now();
    const manureHeld = await inventoryQty(playerId, 'Manure');
    const bucketHeld = await inventoryQty(playerId, 'Lanai Bucket');
    const missingBuild = (await missingBuildTool(playerId))?.itemName ?? null;
    const plotView = plots.map(p => {
        const crop = crops.find(c => c.id === p.crop_id) || null;
        const readyAt = p.ready_at ? new Date(p.ready_at).getTime() : null;
        const isReady = p.state === 'growing' && readyAt !== null && now >= readyAt;
        return {
            id: p.id, slotIndex: p.slot_index,
            state: isReady ? 'ready' : p.state,
            soilState: p.soil_state,
            crop: crop ? { id: crop.id, name: crop.name, isPerennial: !!crop.is_perennial } : null,
            seedCount: p.seed_count,
            readyAt: p.ready_at,
            secondsRemaining: readyAt ? Math.max(0, Math.round((readyAt - now) / 1000)) : null,
            tended: !!p.tended,
            yieldModifier: SOIL_YIELD[p.soil_state] ?? 1,
            restingSecondsToNextStep: (!p.crop_id && p.rested_since && p.soil_state !== 'rich')
                ? Math.max(0, Math.round(FALLOW_SECONDS - (now - new Date(p.rested_since).getTime()) / 1000))
                : null,
        };
    });

    const cap = plotCapForLevel(farmingLvl);
    const nextPlotNumber = plots.length + 1;
    const nextCost = nextPlotNumber <= cap ? plotCost(nextPlotNumber) : null;
    const nextCheck = nextCost ? await hasMaterials(playerId, nextCost) : { ok: false, missing: [] };

    return {
        hasFarmstead: true,
        atNovita,
        farmingLevel: farmingLvl,
        hasHoe: !!hoe,
        property: { id: property.id, tier: property.tier, plotSlots: property.plot_slots },
        plotCapacity: PLOT_CAPACITY,
        plots: plotView,
        crops: cropList,
        outgrownCrops,
        plotCap: cap,
        plotMax: PLOT_MAX,
        timers: { till: TILL_SECONDS, sowPerSeed: SOW_SECONDS_PER_SEED, harvestPerSeed: HARVEST_SECONDS_PER_SEED, buildPlot: BUILD_PLOT_SECONDS, manure: MANURE_SECONDS },
        // Sent rather than repeated in the client, so the button and the server
        // can never disagree about when harvest-all unlocks.
        harvestAllMinPlots: HARVEST_ALL_MIN_PLOTS,
        manure: { held: manureHeld, cost: MANURE_COST },
        tend: {
            hasBucket: bucketHeld > 0,
            plots: plots.filter(p => p.state === 'growing' && !p.tended && p.ready_at).length,
            secondsPerPlot: TEND_SECONDS_PER_PLOT,
            speedup: TEND_SPEEDUP,
        },
        nextPlot: nextCost
            ? { number: nextPlotNumber, cost: nextCost, canAfford: nextCheck.ok, missing: nextCheck.missing, seconds: BUILD_PLOT_SECONDS, missingTool: missingBuild }
            : null,
    };
}

// ── starts (validate, then create a timed action) ───────────────────────────
export async function startEstablish(playerId: number): Promise<{ ok: boolean; error?: string; timerSeconds?: number }> {
    const { novita, property } = await playerProperty(playerId);
    if (!novita) return { ok: false, error: 'Novita not found.' };
    const player = await db('players').where({ id: playerId }).select('current_location_id').first();
    if (!player || player.current_location_id !== novita.id) return { ok: false, error: 'You must be in Novita to raise a farmstead.' };
    if (property) return { ok: false, error: 'You already have a farmstead here.' };
    if (await busy(playerId)) return { ok: false, error: 'You are already performing an action.' };

    const carp = await skillLevel(playerId, 'Carpentry');
    if (carp < CARPENTRY_REQ) return { ok: false, error: `Requires Carpentry level ${CARPENTRY_REQ}.` };

    const missingTool = await missingBuildTool(playerId);
    if (missingTool) return { ok: false, error: missingTool.message };

    const matCheck = await hasMaterials(playerId, FARM_ESTABLISH_COST);
    if (!matCheck.ok) {
        const m = matCheck.missing.map(x => `${x.need}x ${x.itemName} (have ${x.have})`).join(', ');
        return { ok: false, error: `You need: ${m}.` };
    }

    await startAction(playerId, 'farm_establish', ESTABLISH_SECONDS, null, novita.id);
    return { ok: true, timerSeconds: ESTABLISH_SECONDS };
}

export async function startBuildPlot(playerId: number): Promise<{ ok: boolean; error?: string; timerSeconds?: number }> {
    const { novita, property } = await playerProperty(playerId);
    if (!novita || !property) return { ok: false, error: 'You have no farmstead here.' };
    const player = await db('players').where({ id: playerId }).select('current_location_id').first();
    if (!player || player.current_location_id !== novita.id) return { ok: false, error: 'You must be at your farmstead to enclose a field.' };
    if (await busy(playerId)) return { ok: false, error: 'You are already performing an action.' };

    const missingTool = await missingBuildTool(playerId);
    if (missingTool) return { ok: false, error: missingTool.message };

    const plots = await db('farm_plots').where({ property_id: property.id });
    const farmingLvl = await skillLevel(playerId, 'Farming');
    const cap = plotCapForLevel(farmingLvl);
    if (plots.length >= cap) {
        return {
            ok: false,
            error: plots.length >= PLOT_MAX
                ? 'Your farm is as large as any in Talaran.'
                : `You can work ${cap} fields at Farming level ${farmingLvl}. Level up to enclose more.`,
        };
    }

    const cost = plotCost(plots.length + 1);
    const matCheck = await hasMaterials(playerId, cost);
    if (!matCheck.ok) {
        const m = matCheck.missing.map(x => `${x.need}x ${x.itemName} (have ${x.have})`).join(', ');
        return { ok: false, error: `You need: ${m}.` };
    }

    await startAction(playerId, 'farm_build_plot', BUILD_PLOT_SECONDS, null, novita.id);
    return { ok: true, timerSeconds: BUILD_PLOT_SECONDS };
}

export async function startTill(playerId: number, plotId: number): Promise<{ ok: boolean; error?: string; timerSeconds?: number }> {
    const plot = await ownedPlot(playerId, plotId);
    if (!plot) return { ok: false, error: 'That is not your plot.' };
    if (plot.state !== 'empty') return { ok: false, error: 'That plot is already worked.' };
    if (!(await equippedTool(playerId, 'hoe'))) return { ok: false, error: 'You need a hoe equipped to till the soil.' };
    if (await busy(playerId)) return { ok: false, error: 'You are already performing an action.' };

    const { novita } = await playerProperty(playerId);
    await startAction(playerId, 'farm_till', TILL_SECONDS, String(plotId), novita?.id ?? null);
    return { ok: true, timerSeconds: TILL_SECONDS };
}

export async function startSow(playerId: number, plotId: number, cropId: number, seedCount: number): Promise<{ ok: boolean; error?: string; timerSeconds?: number }> {
    const plot = await ownedPlot(playerId, plotId);
    if (!plot) return { ok: false, error: 'That is not your plot.' };
    if (plot.state !== 'tilled') return { ok: false, error: 'That plot must be tilled first.' };

    const crop = await db('crops').where({ id: cropId, is_active: true }).first();
    if (!crop) return { ok: false, error: 'Unknown crop.' };

    const farmingLvl = await skillLevel(playerId, 'Farming');
    if (farmingLvl < crop.plant_level) return { ok: false, error: `Requires Farming level ${crop.plant_level}.` };

    if (crop.region && !crop.grows_anywhere) {
        const property = await db('player_properties').where({ id: plot.property_id }).first();
        const loc = property ? await db('locations').where({ id: property.location_id }).first() : null;
        if (!loc || loc.region !== crop.region) return { ok: false, error: `${crop.name} will not take root in this soil.` };
    }

    const count = Math.max(1, Math.min(PLOT_CAPACITY, Math.floor(seedCount)));
    const matCheck = await hasMaterials(playerId, [{ itemName: crop.seed_item_name, qty: count }]);
    if (!matCheck.ok) return { ok: false, error: `You need ${count}x ${crop.seed_item_name}.` };
    if (await busy(playerId)) return { ok: false, error: 'You are already performing an action.' };

    const seconds = count * SOW_SECONDS_PER_SEED;
    const { novita } = await playerProperty(playerId);
    await startAction(playerId, 'farm_sow', seconds, JSON.stringify({ p: plotId, c: cropId, n: count }), novita?.id ?? null);
    return { ok: true, timerSeconds: seconds };
}

export async function startHarvest(playerId: number, plotId: number): Promise<{ ok: boolean; error?: string; timerSeconds?: number }> {
    const plot = await ownedPlot(playerId, plotId);
    if (!plot) return { ok: false, error: 'That is not your plot.' };
    if (plot.state !== 'growing' || !plot.crop_id) return { ok: false, error: 'Nothing to harvest here.' };
    if (!plot.ready_at || Date.now() < new Date(plot.ready_at).getTime()) return { ok: false, error: 'The crop is not ready yet.' };
    if (await busy(playerId)) return { ok: false, error: 'You are already performing an action.' };

    const seconds = Math.max(1, plot.seed_count) * HARVEST_SECONDS_PER_SEED;
    const { novita } = await playerProperty(playerId);
    await startAction(playerId, 'farm_harvest', seconds, String(plotId), novita?.id ?? null);
    return { ok: true, timerSeconds: seconds };
}

// ── uproot ──────────────────────────────────────────────────────────────────
// Any crop can be pulled up and the plot returned to tilled soil. Perennials
// made this necessary: strawberries regrow forever by design, so without an
// uproot the plot they sit in is theirs permanently and the player has one fewer
// field for the rest of the game.
//
// Nothing is refunded and no XP is paid. Sowing pays XP, so a sow/uproot/sow
// cycle would otherwise be free experience; giving the seeds back would make it
// free outright. Uprooting costs you the crop, which is the honest price of
// changing your mind.

const UPROOT_SECONDS = 20;

export async function startUproot(playerId: number, plotId: number): Promise<{ ok: boolean; error?: string; timerSeconds?: number }> {
    const plot = await ownedPlot(playerId, plotId);
    if (!plot) return { ok: false, error: 'That is not your plot.' };
    if (!plot.crop_id || plot.state === 'empty' || plot.state === 'tilled') {
        return { ok: false, error: 'There is nothing growing there.' };
    }
    if (!(await equippedTool(playerId, 'hoe'))) {
        return { ok: false, error: 'You need a hoe equipped to break the ground.' };
    }
    if (await busy(playerId)) return { ok: false, error: 'You are already performing an action.' };

    const { novita } = await playerProperty(playerId);
    await startAction(playerId, 'farm_uproot', UPROOT_SECONDS, String(plotId), novita?.id ?? null);
    return { ok: true, timerSeconds: UPROOT_SECONDS };
}

export async function resolveUproot(playerId: number, plotIdRaw: string | null): Promise<FarmActionResult> {
    try {
        const plotId = plotIdRaw ? parseInt(plotIdRaw) : 0;
        const plot = await ownedPlot(playerId, plotId);
        if (!plot || !plot.crop_id) return { success: false, error: 'There is nothing growing there.' };

        const crop = await db('crops').where({ id: plot.crop_id }).first();

        // Left exactly as a harvest leaves it: tilled and ready to sow again.
        // Soil is untouched, since pulling a crop early neither feeds nor drains it.
        await db('farm_plots').where({ id: plot.id }).update({
            state: 'tilled',
            crop_id: null,
            seed_count: 0,
            planted_at: null,
            ready_at: null,
            tended: false,
            rested_since: new Date(),
        });

        return {
            success: true,
            xp: 0,
            skillName: 'Farming',
            message: `You break the roots and turn the ${crop?.name?.toLowerCase() ?? 'crop'} back into the soil. The plot is bare again.`,
        };
    } catch (err) {
        logger.error(`resolveUproot error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

// Tending is the SPEED lever — soil handles yield, this handles time. One action
// covers every growing plot that hasn't been tended this cycle; each gets 10% cut
// from its REMAINING grow time, so tending early is worth far more than tending
// late. A bucket must be carried (not worn — you'd otherwise be swapping the hoe
// out every time).
async function tendablePlots(propertyId: number) {
    return db('farm_plots')
        .where({ property_id: propertyId, state: 'growing', tended: false })
        .whereNotNull('ready_at');
}

export async function startTend(playerId: number): Promise<{ ok: boolean; error?: string; timerSeconds?: number }> {
    const { novita, property } = await playerProperty(playerId);
    if (!novita || !property) return { ok: false, error: 'You have no farmstead here.' };
    const player = await db('players').where({ id: playerId }).select('current_location_id').first();
    if (!player || player.current_location_id !== novita.id) return { ok: false, error: 'You must be at your farmstead to tend it.' };
    if ((await inventoryQty(playerId, 'Lanai Bucket')) < 1) return { ok: false, error: 'You need a bucket to carry water.' };

    const plots = await tendablePlots(property.id);
    if (plots.length === 0) return { ok: false, error: 'Nothing here needs tending.' };
    if (await busy(playerId)) return { ok: false, error: 'You are already performing an action.' };

    const seconds = plots.length * TEND_SECONDS_PER_PLOT;
    await startAction(playerId, 'farm_tend', seconds, null, novita.id);
    return { ok: true, timerSeconds: seconds };
}

export async function resolveTend(playerId: number): Promise<FarmActionResult> {
    try {
        const { property } = await playerProperty(playerId);
        if (!property) return { success: false, error: 'You have no farmstead here.' };

        if ((await inventoryQty(playerId, 'Lanai Bucket')) < 1) {
            return { success: false, error: 'You need a bucket to carry water.' };
        }

        const plots = await tendablePlots(property.id);
        if (plots.length === 0) return { success: false, error: 'Nothing needed tending.' };

        const now = Date.now();
        let tended = 0;
        for (const p of plots) {
            const remaining = new Date(p.ready_at).getTime() - now;
            if (remaining <= 0) continue;                       // already ripe; nothing to hurry
            await db('farm_plots').where({ id: p.id }).update({
                ready_at: new Date(now + remaining * (1 - TEND_SPEEDUP)),
                tended: true,
            });
            tended++;
        }
        if (tended === 0) return { success: false, error: 'Nothing needed tending.' };

        const lvl = await skillLevel(playerId, 'Farming');
        const xp = activeXpForSeconds(lvl, plots.length * TEND_SECONDS_PER_PLOT);
        await awardXp(playerId, 'Farming', xp);
        await incrementStats(playerId, { total_actions_completed: 1});

        return {
            success: true, xp, skillName: 'Farming',
            message: `You water and weed ${tended} field${tended === 1 ? '' : 's'}. They will come on the sooner for it.`,
        };
    } catch (err) {
        logger.error(`resolveTend error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

export async function startManure(playerId: number, plotId: number): Promise<{ ok: boolean; error?: string; timerSeconds?: number }> {
    const plot = await ownedPlot(playerId, plotId);
    if (!plot) return { ok: false, error: 'That is not your plot.' };
    if (plot.soil_state === 'rich') return { ok: false, error: 'That ground is already in good heart.' };
    const check = await hasMaterials(playerId, [{ itemName: 'Manure', qty: MANURE_COST }]);
    if (!check.ok) return { ok: false, error: `You need ${MANURE_COST}x Manure.` };
    if (await busy(playerId)) return { ok: false, error: 'You are already performing an action.' };

    const { novita } = await playerProperty(playerId);
    await startAction(playerId, 'farm_manure', MANURE_SECONDS, String(plotId), novita?.id ?? null);
    return { ok: true, timerSeconds: MANURE_SECONDS };
}

export async function resolveManure(playerId: number, plotIdRaw: string | null): Promise<FarmActionResult> {
    try {
        const plotId = plotIdRaw ? parseInt(plotIdRaw) : 0;
        const plot = await ownedPlot(playerId, plotId);
        if (!plot) return { success: false, error: 'That is not your plot.' };
        if (plot.soil_state === 'rich') return { success: false, error: 'That ground is already in good heart.' };

        const check = await hasMaterials(playerId, [{ itemName: 'Manure', qty: MANURE_COST }]);
        if (!check.ok) return { success: false, error: 'You no longer have the manure.' };
        await consumeMaterials(playerId, [{ itemName: 'Manure', qty: MANURE_COST }]);

        await db('farm_plots').where({ id: plotId }).update({ soil_state: shiftSoil(plot.soil_state, 1) });

        const lvl = await skillLevel(playerId, 'Farming');
        const xp = activeXpForSeconds(lvl, MANURE_SECONDS);
        await awardXp(playerId, 'Farming', xp);
        await incrementStats(playerId, { total_actions_completed: 1});

        return { success: true, xp, skillName: 'Farming', message: 'You spread the muck and turn it in. The field will thank you.' };
    } catch (err) {
        logger.error(`resolveManure error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

// ── resolvers (called by the game tick when the timer completes) ────────────
export async function resolveEstablish(playerId: number): Promise<FarmActionResult> {
    try {
        const { novita, property } = await playerProperty(playerId);
        if (!novita) return { success: false, error: 'Novita not found.' };
        if (property) return { success: false, error: 'You already have a farmstead here.' };

        const missingTool = await missingBuildTool(playerId);
        if (missingTool) return { success: false, error: missingTool.message };

        const matCheck = await hasMaterials(playerId, FARM_ESTABLISH_COST);
        if (!matCheck.ok) return { success: false, error: 'You no longer have the materials.' };
        await consumeMaterials(playerId, FARM_ESTABLISH_COST);

        const [row] = await db('player_properties').insert({
            player_id: playerId, location_id: novita.id, type: 'farmstead', tier: 1, plot_slots: 1,
        }).returning('id');
        const propertyId = typeof row === 'object' ? row.id : row;

        await db('farm_plots').insert({
            property_id: propertyId, slot_index: 0, state: 'empty', soil_state: 'normal', seed_count: 0,
        });

        const carpLvl = await skillLevel(playerId, 'Carpentry');
        const xp = Math.round(activeXpForSeconds(carpLvl, ESTABLISH_SECONDS) * ESTABLISH_XP_BONUS);
        await awardXp(playerId, 'Carpentry', xp);
        await incrementStats(playerId, { total_actions_completed: 1});

        await updateQuestObjectiveProgress(playerId, 'build', 'Farmstead', 1);

        logger.info(`Player ${playerId} raised a farmstead at Novita (${propertyId})`);
        return { success: true, xp, skillName: 'Carpentry', message: 'Your farmstead stands at last. The first field is yours to work.' };
    } catch (err) {
        logger.error(`resolveEstablish error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

export async function resolveBuildPlot(playerId: number): Promise<FarmActionResult> {
    try {
        const { property } = await playerProperty(playerId);
        if (!property) return { success: false, error: 'You have no farmstead here.' };

        const missingTool = await missingBuildTool(playerId);
        if (missingTool) return { success: false, error: missingTool.message };

        const plots = await db('farm_plots').where({ property_id: property.id });
        const farmingLvl = await skillLevel(playerId, 'Farming');
        if (plots.length >= plotCapForLevel(farmingLvl)) {
            return { success: false, error: 'You cannot work another field yet.' };
        }

        const cost = plotCost(plots.length + 1);
        const matCheck = await hasMaterials(playerId, cost);
        if (!matCheck.ok) return { success: false, error: 'You no longer have the materials.' };
        await consumeMaterials(playerId, cost);

        const nextIndex = plots.length ? Math.max(...plots.map(p => p.slot_index)) + 1 : 0;
        await db('farm_plots').insert({
            property_id: property.id, slot_index: nextIndex, state: 'empty', soil_state: 'normal', seed_count: 0,
        });
        await db('player_properties').where({ id: property.id }).update({ plot_slots: plots.length + 1 });

        const carpLvl = await skillLevel(playerId, 'Carpentry');
        const xp = activeXpForSeconds(carpLvl, BUILD_PLOT_SECONDS);
        await awardXp(playerId, 'Carpentry', xp);
        await incrementStats(playerId, { total_actions_completed: 1});

        return { success: true, xp, skillName: 'Carpentry', message: 'The new field is fenced and ready to break.' };
    } catch (err) {
        logger.error(`resolveBuildPlot error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

export async function resolveTill(playerId: number, plotIdRaw: string | null): Promise<FarmActionResult> {
    try {
        const plotId = plotIdRaw ? parseInt(plotIdRaw) : 0;
        const plot = await ownedPlot(playerId, plotId);
        if (!plot || plot.state !== 'empty') return { success: false, error: 'That plot could not be tilled.' };
        if (!(await equippedTool(playerId, 'hoe'))) {
            return { success: false, error: 'You need a hoe equipped to till the soil.' };
        }

        await db('farm_plots').where({ id: plotId }).update({ state: 'tilled' });

        const lvl = await skillLevel(playerId, 'Farming');
        const xp = activeXpForSeconds(lvl, TILL_SECONDS);
        await awardXp(playerId, 'Farming', xp);
        await incrementStats(playerId, { total_actions_completed: 1, total_plots_tilled: 1});

        await updateQuestObjectiveProgress(playerId, 'till', 'Field', 1);

        return { success: true, xp, skillName: 'Farming', message: 'The soil is broken and ready for seed.' };
    } catch (err) {
        logger.error(`resolveTill error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

export async function resolveSow(playerId: number, dataRaw: string | null): Promise<FarmActionResult> {
    try {
        const data = dataRaw ? JSON.parse(dataRaw) : null;
        if (!data) return { success: false, error: 'Sowing failed.' };
        const plot = await ownedPlot(playerId, data.p);
        if (!plot || plot.state !== 'tilled') return { success: false, error: 'That plot is no longer ready for seed.' };

        const crop = await db('crops').where({ id: data.c }).first();
        if (!crop) return { success: false, error: 'Unknown crop.' };

        const count = Math.max(1, Math.min(PLOT_CAPACITY, data.n));
        const matCheck = await hasMaterials(playerId, [{ itemName: crop.seed_item_name, qty: count }]);
        if (!matCheck.ok) return { success: false, error: `You no longer have ${count}x ${crop.seed_item_name}.` };
        await consumeMaterials(playerId, [{ itemName: crop.seed_item_name, qty: count }]);

        const now = new Date();
        await db('farm_plots').where({ id: plot.id }).update({
            state: 'growing', crop_id: crop.id, seed_count: count,
            planted_at: now, ready_at: new Date(now.getTime() + crop.grow_seconds * 1000),
            rested_since: null, tended: false,
            // Fresh seed in the ground, so the next harvest pays in full.
            harvests_since_sow: 0,
        });

        const lvl = await skillLevel(playerId, 'Farming');
        const xp = activeXpForSeconds(lvl, count * SOW_SECONDS_PER_SEED);
        await awardXp(playerId, 'Farming', xp);
        await incrementStats(playerId, { total_actions_completed: 1, total_seeds_sown: 1});

        await updateQuestObjectiveProgress(playerId, 'sow', crop.name, count);

        return { success: true, xp, skillName: 'Farming', message: `${count} ${crop.name} sown. Now it needs only time.` };
    } catch (err) {
        logger.error(`resolveSow error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

/**
 * One plot's harvest: the produce, the plot's next state, and what it paid.
 *
 * The single harvest and harvest-all both come through here, so there is one
 * set of harvest rules — the per-seed XP, the perennial regrowth rule, soil,
 * quest progress — and the bulk action cannot drift from the single one. It
 * gives the produce and moves the plot on, but deliberately does NOT award XP
 * or bump stats: the caller does that once, so a harvest-all of twenty fields
 * is one award and one socket push rather than twenty.
 */
async function harvestPlot(playerId: number, plot: any, level: number): Promise<{
    xp: number;
    /** The digging alone, which is what gold is priced from. */
    activeXp: number;
    crop: any;
    yieldQty: number;
    soilChange: -1 | 0 | 1;
} | null> {
    if (plot.state !== 'growing' || !plot.crop_id) return null;
    const crop = await db('crops').where({ id: plot.crop_id }).first();
    if (!crop) return null;

    const soilBefore = plot.soil_state || 'normal';
    const yieldQty = Math.max(1, Math.round(plot.seed_count * crop.yield_per_seed * (SOIL_YIELD[soilBefore] ?? 1)));

    // Per-seed XP for the crop, plus active pay for the digging.
    const activeXp = activeXpForSeconds(level, plot.seed_count * HARVEST_SECONDS_PER_SEED);
    const xp = harvestSeedXp(level, crop, plot.seed_count, Number(plot.harvests_since_sow) || 0)
        + activeXp;

    await giveItem(playerId, crop.produce_item_name, yieldQty);

    // Hungry crops take from the soil, legumes give back, bushes are neutral.
    const dir: -1 | 0 | 1 = crop.soil_effect === 'restore' ? 1 : crop.soil_effect === 'neutral' ? 0 : -1;
    const soilAfter = dir === 0 ? soilBefore : shiftSoil(soilBefore, dir);

    if (crop.is_perennial && crop.regrow_seconds) {
        // Regrowth: the next harvest will not have used a seed.
        await db('farm_plots').where({ id: plot.id }).update({
            state: 'growing', planted_at: new Date(),
            ready_at: new Date(Date.now() + crop.regrow_seconds * 1000),
            soil_state: soilAfter, tended: false,
            harvests_since_sow: (Number(plot.harvests_since_sow) || 0) + 1,
        });
    } else {
        await db('farm_plots').where({ id: plot.id }).update({
            state: 'tilled', crop_id: null, seed_count: 0, planted_at: null, ready_at: null,
            soil_state: soilAfter, rested_since: new Date(), harvests_since_sow: 0,
        });
    }

    await updateQuestObjectiveProgress(playerId, 'harvest', crop.produce_item_name, 1);

    return { xp, activeXp, crop, yieldQty, soilChange: soilAfter === soilBefore ? 0 : dir };
}

export async function resolveHarvest(playerId: number, plotIdRaw: string | null): Promise<FarmActionResult> {
    try {
        const plotId = plotIdRaw ? parseInt(plotIdRaw) : 0;
        const plot = await ownedPlot(playerId, plotId);
        if (!plot || plot.state !== 'growing' || !plot.crop_id) return { success: false, error: 'Nothing to harvest here.' };

        const lvl = await skillLevel(playerId, 'Farming');
        const done = await harvestPlot(playerId, plot, lvl);
        if (!done) return { success: false, error: 'Crop definition missing.' };

        await awardXp(playerId, 'Farming', done.xp);
        // Count the CROPS, not the harvest. "Bring in a thousand crops" read
        // one per lift of a whole field, so a 50-sheaf harvest counted as 1 and
        // the feat silently meant a thousand harvests.
        await incrementStats(playerId, {
            total_actions_completed: 1,
            total_crops_harvested: done.yieldQty,
        });

        const { crop } = done;
        return {
            success: true, xp: done.xp, skillName: 'Farming',
            itemName: crop.produce_item_name, quantity: done.yieldQty,
            goldBasisXp: [done.activeXp],
            message: (crop.is_perennial
                ? `You strip the ${crop.name.toLowerCase()} canes clean. They will bear again.`
                : `You lift the ${crop.name.toLowerCase()} crop from the earth.`)
                + (done.soilChange > 0
                    ? ' The ground is the better for having held it.'
                    : done.soilChange < 0
                        ? ' The soil is poorer for the taking.'
                        : ''),
        };
    } catch (err) {
        logger.error(`resolveHarvest error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

// ── harvest all ─────────────────────────────────────────────────────────────
// Every ripe field in one go, once a farm is big enough that doing them one by
// one is the chore. Husbandry has had feed-all, muck-all, collect-all and
// slaughter-all from the start; farming was the odd one out, and a twenty-plot
// farmer was clicking twenty separate harvests.
//
// It saves CLICKS, not time. The timer is the sum of every field's own harvest,
// and each field pays exactly what harvesting it alone would — same per-seed XP,
// same perennial rule, same soil — because it goes through harvestPlot above.

export const HARVEST_ALL_MIN_PLOTS = 4;

/** Ripe plots on a farmstead, in slot order. */
async function ripePlots(propertyId: number) {
    const now = Date.now();
    const growing = await db('farm_plots')
        .where({ property_id: propertyId, state: 'growing' })
        .whereNotNull('crop_id')
        .orderBy('slot_index', 'asc');
    return growing.filter((p: any) => p.ready_at && new Date(p.ready_at).getTime() <= now);
}

export async function startHarvestAll(playerId: number): Promise<{ ok: boolean; error?: string; timerSeconds?: number }> {
    const { novita, property } = await playerProperty(playerId);
    if (!novita || !property) return { ok: false, error: 'You have no farmstead here.' };

    const player = await db('players').where({ id: playerId }).select('current_location_id').first();
    if (!player || player.current_location_id !== novita.id) {
        return { ok: false, error: 'You must be at your farmstead to bring in the harvest.' };
    }

    const plotCount = Number((await db('farm_plots')
        .where({ property_id: property.id }).count({ c: '*' }).first())?.c ?? 0);
    if (plotCount < HARVEST_ALL_MIN_PLOTS) {
        return { ok: false, error: `You need ${HARVEST_ALL_MIN_PLOTS} fields before you can bring them in together.` };
    }

    const ripe = await ripePlots(property.id);
    if (ripe.length === 0) return { ok: false, error: 'Nothing is ready to harvest yet.' };
    if (await busy(playerId)) return { ok: false, error: 'You are already performing an action.' };

    const seconds = ripe.reduce(
        (s: number, p: any) => s + Math.max(1, p.seed_count) * HARVEST_SECONDS_PER_SEED, 0);

    // The fields are fixed when the work BEGINS. Otherwise a crop that ripened
    // while the timer ran would be harvested at the end of it without its own
    // seconds ever having been spent — free fields for waiting inside the action.
    const plotIds = ripe.map((p: any) => p.id).join(',');
    await startAction(playerId, 'farm_harvest_all', seconds, plotIds, novita.id);
    return { ok: true, timerSeconds: seconds };
}

export async function resolveHarvestAll(playerId: number, plotIdsRaw: string | null): Promise<FarmActionResult> {
    try {
        const ids = (plotIdsRaw || '').split(',').map((s) => parseInt(s)).filter((n) => n > 0);
        if (ids.length === 0) return { success: false, error: 'There was nothing to bring in.' };

        const lvl = await skillLevel(playerId, 'Farming');
        let totalXp = 0;
        let totalYield = 0;
        const brought = new Map<string, number>();
        const goldBasisXp: number[] = [];

        for (const id of ids) {
            // Re-read each plot: it may have been uprooted, or harvested one by
            // one, while the bulk timer ran. ownedPlot also refuses a plot that
            // is no longer this player's.
            const plot = await ownedPlot(playerId, id);
            if (!plot) continue;
            const done = await harvestPlot(playerId, plot, lvl);
            if (!done) continue;
            totalXp += done.xp;
            totalYield += done.yieldQty;
            goldBasisXp.push(done.activeXp);
            const name = done.crop.produce_item_name;
            brought.set(name, (brought.get(name) ?? 0) + done.yieldQty);
        }

        if (brought.size === 0) return { success: false, error: 'The fields had nothing left to give.' };

        await awardXp(playerId, 'Farming', totalXp);
        await incrementStats(playerId, {
            total_actions_completed: 1,
            total_crops_harvested: totalYield,
        });

        // The result card shows one item; the largest haul takes it, and the
        // message names the rest.
        const sorted = [...brought.entries()].sort((a, b) => b[1] - a[1]);
        const fields = ids.length;
        return {
            success: true, xp: totalXp, skillName: 'Farming',
            itemName: sorted[0][0], quantity: sorted[0][1],
            goldBasisXp,
            message: `You bring in ${fields} field${fields === 1 ? '' : 's'}: `
                + sorted.map(([n, q]) => `${q} ${n}`).join(', ') + '.',
        };
    } catch (err) {
        logger.error(`resolveHarvestAll error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}
