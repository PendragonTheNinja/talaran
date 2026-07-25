import db from '../db';
import { logger } from '../index';
import { levelFromXp } from './xp';
import { incrementStats } from './stats';
import { updateQuestObjectiveProgress } from '../routes/quests';

// Farming M1 (docs/homestead-farming-spec.md). A player builds a farmstead at
// Novita, encloses fields, then works them: till → sow → (passive grow) → harvest.
//
// Every player-driven step is a TIMED action resolved by the game tick, not an
// instant call: raising the farmstead is a long Carpentry job, and tilling, sowing,
// and harvesting are real Farming work. Growth itself stays passive and real-time
// (ready_at, checked on read — the tanning-job pattern).
//
// XP: the timed steps pay the ACTIVE rate for the seconds spent. Harvesting pays
// that on top of the crop's passive yield (xp_per_seed), which is tuned so a plot
// produces 0.12x the active reference over its grow cycle.

const NOVITA = 'Novita';
const PLOT_CAPACITY = 10;                 // seeds per plot
const PLOT_MAX = 20;                      // hard ceiling (end-game)
const CARPENTRY_REQ = 1;
// Building is joinery. Tools are held, not consumed. The mallet is the tool in
// your hands, so it must be EQUIPPED (mainhand) like the hoe on tilling; the saw
// is bench kit and only needs to be carried.
const BUILD_MALLET = { subtype: 'mallet', itemName: 'Lanai Mallet' };
const BUILD_HELD = ['Ambren Saw'];
const BUILD_TOOLS = [BUILD_MALLET.itemName, ...BUILD_HELD];

const ESTABLISH_COST = [
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
const HARVEST_SECONDS_PER_SEED = 8;       // 80s for a full plot

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
}

// ── helpers ────────────────────────────────────────────────────────────────
async function itemByName(name: string) {
    return db('items').where({ name }).first();
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

// Returns the first unmet build-tool requirement, or null when fully kitted.
// `itemName` keeps the old API shape; `message` carries the equipped-vs-held
// distinction so the error tells the player what to actually do.
async function missingBuildTool(
    playerId: number,
): Promise<{ itemName: string; message: string } | null> {
    if (!(await equippedTool(playerId, BUILD_MALLET.subtype))) {
        return {
            itemName: BUILD_MALLET.itemName,
            message: `You need a ${BUILD_MALLET.itemName} equipped to build.`,
        };
    }

    for (const name of BUILD_HELD) {
        if ((await inventoryQty(playerId, name)) < 1) {
            return { itemName: name, message: `You need a ${name} to build.` };
        }
    }

    return null;
}

// Tools must be EQUIPPED (mainhand), same as the woodcutting hatchet.
async function equippedTool(playerId: number, subtype: string) {
    const equipment = await db('player_equipment').where({ player_id: playerId }).first();
    const id = equipment?.mainhand_item_id;
    if (!id) return null;
    return db('items').where({ id, subtype }).first();
}

async function awardXp(playerId: number, skillName: string, xp: number): Promise<void> {
    const skill = await db('skills').where({ name: skillName }).first();
    if (!skill) return;
    const existing = await db('player_skills').where({ player_id: playerId, skill_id: skill.id }).first();
    if (existing) await db('player_skills').where({ player_id: playerId, skill_id: skill.id }).increment('xp', xp);
    else await db('player_skills').insert({ player_id: playerId, skill_id: skill.id, xp });
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
    const cropList = [];
    for (const c of crops) {
        cropList.push({
            id: c.id, name: c.name, seedItem: c.seed_item_name, produceItem: c.produce_item_name,
            plantLevel: c.plant_level, growSeconds: c.grow_seconds, yieldPerSeed: c.yield_per_seed,
            cropType: c.crop_type, isPerennial: !!c.is_perennial,
            unlocked: farmingLvl >= c.plant_level,
            seedsHeld: await inventoryQty(playerId, c.seed_item_name),
        });
    }

    if (!property) {
        const matCheck = await hasMaterials(playerId, ESTABLISH_COST);
        return {
            hasFarmstead: false,
            atNovita,
            farmingLevel: farmingLvl,
            hasHoe: !!hoe,
            build: {
                carpentryReq: CARPENTRY_REQ,
                cost: ESTABLISH_COST,
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
        plotCap: cap,
        plotMax: PLOT_MAX,
        timers: { till: TILL_SECONDS, sowPerSeed: SOW_SECONDS_PER_SEED, harvestPerSeed: HARVEST_SECONDS_PER_SEED, buildPlot: BUILD_PLOT_SECONDS, manure: MANURE_SECONDS },
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

    const matCheck = await hasMaterials(playerId, ESTABLISH_COST);
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
        await incrementStats(playerId, { total_actions_completed: 1, total_xp_earned: xp });

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
        await incrementStats(playerId, { total_actions_completed: 1, total_xp_earned: xp });

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

        const matCheck = await hasMaterials(playerId, ESTABLISH_COST);
        if (!matCheck.ok) return { success: false, error: 'You no longer have the materials.' };
        await consumeMaterials(playerId, ESTABLISH_COST);

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
        await incrementStats(playerId, { total_actions_completed: 1, total_xp_earned: xp });

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
        await incrementStats(playerId, { total_actions_completed: 1, total_xp_earned: xp });

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
        await incrementStats(playerId, { total_actions_completed: 1, total_xp_earned: xp });

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
        });

        const lvl = await skillLevel(playerId, 'Farming');
        const xp = activeXpForSeconds(lvl, count * SOW_SECONDS_PER_SEED);
        await awardXp(playerId, 'Farming', xp);
        await incrementStats(playerId, { total_actions_completed: 1, total_xp_earned: xp });

        await updateQuestObjectiveProgress(playerId, 'sow', crop.name, count);

        return { success: true, xp, skillName: 'Farming', message: `${count} ${crop.name} sown. Now it needs only time.` };
    } catch (err) {
        logger.error(`resolveSow error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

export async function resolveHarvest(playerId: number, plotIdRaw: string | null): Promise<FarmActionResult> {
    try {
        const plotId = plotIdRaw ? parseInt(plotIdRaw) : 0;
        const plot = await ownedPlot(playerId, plotId);
        if (!plot || plot.state !== 'growing' || !plot.crop_id) return { success: false, error: 'Nothing to harvest here.' };

        const crop = await db('crops').where({ id: plot.crop_id }).first();
        if (!crop) return { success: false, error: 'Crop definition missing.' };

        const soilBefore = plot.soil_state || 'normal';
        const yieldQty = Math.max(1, Math.round(plot.seed_count * crop.yield_per_seed * (SOIL_YIELD[soilBefore] ?? 1)));
        // Passive yield for the grow, plus active pay for the digging.
        const passiveXp = plot.seed_count * crop.xp_per_seed;
        const lvl = await skillLevel(playerId, 'Farming');
        const activeXp = activeXpForSeconds(lvl, plot.seed_count * HARVEST_SECONDS_PER_SEED);
        const xp = passiveXp + activeXp;

        await giveItem(playerId, crop.produce_item_name, yieldQty);
        await awardXp(playerId, 'Farming', xp);
        await incrementStats(playerId, { total_actions_completed: 1, total_xp_earned: xp });

        // Hungry crops take from the soil, legumes give back, bushes are neutral.
        const dir = crop.soil_effect === 'restore' ? 1 : crop.soil_effect === 'neutral' ? 0 : -1;
        const soilAfter = dir === 0 ? soilBefore : shiftSoil(soilBefore, dir);

        if (crop.is_perennial && crop.regrow_seconds) {
            await db('farm_plots').where({ id: plotId }).update({
                state: 'growing', planted_at: new Date(),
                ready_at: new Date(Date.now() + crop.regrow_seconds * 1000),
                soil_state: soilAfter, tended: false,
            });
        } else {
            await db('farm_plots').where({ id: plotId }).update({
                state: 'tilled', crop_id: null, seed_count: 0, planted_at: null, ready_at: null,
                soil_state: soilAfter, rested_since: new Date(),
            });
        }

        await updateQuestObjectiveProgress(playerId, 'harvest', crop.produce_item_name, 1);

        return {
            success: true, xp, skillName: 'Farming',
            itemName: crop.produce_item_name, quantity: yieldQty,
            message: (crop.is_perennial
                ? `You strip the ${crop.name.toLowerCase()} canes clean. They will bear again.`
                : `You lift the ${crop.name.toLowerCase()} crop from the earth.`)
                + (soilAfter !== soilBefore
                    ? dir > 0
                        ? ' The ground is the better for having held it.'
                        : ' The soil is poorer for the taking.'
                    : ''),
        };
    } catch (err) {
        logger.error(`resolveHarvest error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}
