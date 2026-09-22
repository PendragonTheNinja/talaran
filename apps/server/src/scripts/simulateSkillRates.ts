/**
 * What the passive skills actually pay per hour, measured with the code that
 * ships.
 *
 *   npx ts-node --transpile-only src/scripts/simulateSkillRates.ts
 *   npx ts-node --transpile-only src/scripts/simulateSkillRates.ts --players
 *
 * The first prints the optimal-play projection for Farming and Husbandry by
 * level. The second reads every live farmstead and prices each player's real
 * plots, so you can see what YOUR farmers will earn before a change ships.
 * Both are read-only.
 *
 * Farming imports its rules and constants from services/farming.ts rather than
 * copying them. An earlier version of this script carried its own copies, which
 * had drifted — 12 seconds a seed to sow where the game uses 6, 180 seconds to
 * harvest where it uses 8 a seed — and every table it printed was quietly wrong
 * because of it. A simulator that reimplements what it measures proves the
 * arithmetic, not the game.
 */

import db from '../db';
import {
    harvestSeedXp,
    activeXpForSeconds,
    plotCapForLevel,
    PLOT_CAPACITY,
    HARVEST_SECONDS_PER_SEED,
} from '../services/farming';
import { levelFromXp, levelTaper } from '../services/xp';
import { calculateForageTimer } from '../services/foraging';

/** The band: what an active skill pays per played hour at this level. */
function bandPerHour(level: number): number {
    return activeXpForSeconds(level, 3600);
}

function activeXp(level: number, seconds: number): number {
    return activeXpForSeconds(level, seconds);
}

// Husbandry, from services/husbandry.ts.
const PEN_MAX = 12;                 // hard ceiling, reached around level 33
const COOP_CAPACITY = 6;
const PADDOCK_CAPACITY = 3;
const FED_SECONDS = 12 * 3600;
const MUCK_INTERVAL = 24 * 3600;
const FEED_SECONDS_PER_HEAD = 8;
const MUCK_SECONDS = 60;
const COLLECT_SECONDS = 20;
const SLAUGHTER_SECONDS = 45;
const TAME_SECONDS = 30;

function penCapForLevel(level: number): number {
    return Math.min(PEN_MAX, 1 + Math.floor(level / 3));
}

function penCapacity(penType: string): number {
    return penType === 'coop' ? COOP_CAPACITY : PADDOCK_CAPACITY;
}

interface Species {
    name: string;
    husbandry_level: number;
    grow_seconds: number;
    elder_seconds: number;
    product_seconds: number | null;
    product_qty: number;
    product_chance: number;
    product_max_stored: number;
    xp_product: number;
    xp_mature: number;
    xp_slaughter: number;
    pen_type: string;
}

/**
 * Two ways to run a pen, because they are different games.
 *
 * KEEP: fill the pen with adults and collect forever. The XP is xp_product per
 * unit, and product_chance matters — a pig only turns up a truffle a quarter of
 * the time, so its 750 is really 187 an attempt.
 *
 * CULL: raise young to adult, take the maturity XP, slaughter for the big
 * payout, and start again. A pig is 4,267 to slaughter against 750 a truffle,
 * so this is not a side activity, it is the other half of the skill. The cycle
 * is grow_seconds long and needs a new calf or piglet each time, which is why
 * the calf find rate mattered so much.
 */
function keepRate(species: Species, level: number, head: number) {
    if (!species.product_seconds || species.xp_product <= 0) return null;
    // The shared taper, exactly as services/husbandry.ts applies it.
    const taper = levelTaper(species.husbandry_level, level);
    const perAttempt = species.xp_product * taper * (species.product_chance / 100);
    const xpPerUnit = perAttempt + activeXp(level, COLLECT_SECONDS);
    const perAnimalHour = (xpPerUnit / species.product_seconds) * 3600;

    // The cost side, counted as active time spent rather than ignored.
    const feedsPerDay = 86400 / FED_SECONDS;
    const upkeepSecondsPerDay = feedsPerDay * head * FEED_SECONDS_PER_HEAD
        + (86400 / MUCK_INTERVAL) * MUCK_SECONDS;

    return {
        perAnimalHour,
        farmHour: perAnimalHour * head,
        upkeepSecondsPerDay,
    };
}

function cullRate(species: Species, level: number, head: number) {
    if (species.grow_seconds <= 0) return null;
    // One animal: tame it in, wait out grow_seconds, mature, slaughter.
    const taper = levelTaper(species.husbandry_level, level);
    const xpPerAnimal = (species.xp_mature + species.xp_slaughter) * taper
        + activeXp(level, TAME_SECONDS + SLAUGHTER_SECONDS);
    const perAnimalHour = (xpPerAnimal / species.grow_seconds) * 3600;
    return { perAnimalHour, farmHour: perAnimalHour * head };
}

async function husbandryReport(levels: number[]) {
    const species: Species[] = await db('animal_species')
        .select('name', 'husbandry_level', 'grow_seconds', 'elder_seconds', 'product_seconds',
            'product_qty', 'product_chance', 'product_max_stored', 'xp_product',
            'xp_mature', 'xp_slaughter', 'pen_type');

    console.log('\n\n=== HUSBANDRY ===\n');
    console.log('Pens are capped at 1 + level/3, to a ceiling of 12. A coop holds 6, a');
    console.log('paddock 3. Assumes every pen full, fed and mucked on time, and young');
    console.log('always available. product_chance is applied: a pig yields a quarter of');
    console.log('the time, so its 750 XP is really 187 an attempt.\n');
    console.log('KEEP = fill with adults and collect. CULL = raise, mature, slaughter, repeat.');
    console.log('');
    console.log('CULL IS A CEILING, NOT A RATE. It assumes young animals are unlimited, and they');
    console.log('are not: piglets and chicks come from traps (1-4 traps, a piglet on ~4% of catches,');
    console.log('so about one piglet a day), calves from hunts at 3-6%. With real supply the cull');
    console.log('loop runs around 0.8x band per hunting-hour for calves and under 0.2x for trapped');
    console.log('young. The young are the input, and they gate it the way seeds gate crops.\n');
    console.log('lvl  pens  best keep        head   keep/hr   best cull        head  ceiling/hr  band/hr   keep  ceiling');
    console.log('-'.repeat(108));

    for (const level of levels) {
        const unlocked = species.filter((s) => s.husbandry_level <= level);
        if (unlocked.length === 0) continue;
        const pens = penCapForLevel(level);
        const band = bandPerHour(level);

        // Best KEEP: the species whose per-animal rate x a full pen of it wins.
        let bestKeep: { name: string; head: number; farmHour: number } | null = null;
        let bestCull: { name: string; head: number; farmHour: number } | null = null;

        for (const s of unlocked) {
            const head = pens * penCapacity(s.pen_type);
            const keep = keepRate(s, level, head);
            if (keep && (!bestKeep || keep.farmHour > bestKeep.farmHour)) {
                bestKeep = { name: s.name, head, farmHour: keep.farmHour };
            }
            const cull = cullRate(s, level, head);
            if (cull && (!bestCull || cull.farmHour > bestCull.farmHour)) {
                bestCull = { name: s.name, head, farmHour: cull.farmHour };
            }
        }

        console.log(
            `${String(level).padStart(3)}  ${String(pens).padStart(4)}  `
            + `${(bestKeep?.name ?? '-').padEnd(15)} ${String(bestKeep?.head ?? 0).padStart(4)}  `
            + `${(bestKeep?.farmHour ?? 0).toFixed(0).padStart(8)}   `
            + `${(bestCull?.name ?? '-').padEnd(15)} ${String(bestCull?.head ?? 0).padStart(4)}  `
            + `${(bestCull?.farmHour ?? 0).toFixed(0).padStart(8)}  `
            + `${band.toFixed(0).padStart(8)}  `
            + `${((bestKeep?.farmHour ?? 0) / band).toFixed(2).padStart(5)}  `
            + `${((bestCull?.farmHour ?? 0) / band).toFixed(2).padStart(5)}`,
        );
    }
}

/**
 * Farming XP per PLAYED hour at realistic best play, from the function that ships.
 *
 * An earlier version of this assumed a full farm of the best crop, fed by ~60
 * seeds an hour of foraging. That 60 was Sunlit Meadow's four cheap seed types
 * added together; Flax, the best crop, only comes from Creekbank at about 16 an
 * hour, so a 20-plot Flax farm needs 12 hours of foraging a day and no one does
 * that. The projection was a ceiling presented as a rate.
 *
 * This one plants the way a player would:
 *
 *   - Seeds come from foraging, at each habitat's real rate, computed from the
 *     live drop tables with the game's own calculateForageTimer. The forager is
 *     assumed to be at the same level as the farmer, with a tier 1 knife.
 *   - A player spends up to FORAGE_BUDGET_HOURS a day gathering seeds. Hours go
 *     to whichever habitat is worth most XP per hour to THIS farm, and every
 *     seed type that habitat drops is kept, because one forage drops them all.
 *   - Seeds fill plots best crop first.
 *   - Plots the seeds cannot fill take the best perennial, at its regrowth rate,
 *     since an established perennial needs no seed.
 *   - One harvest per plot per day, for an 8-hour player in one sitting.
 *
 * Every XP figure comes from harvestSeedXp and activeXpForSeconds, so it is what
 * the game pays.
 */
const PLAYED_HOURS_PER_DAY = 8;
const FORAGE_BUDGET_HOURS = 2;
const KNIFE_TIER = 1;

interface SeedSource { habitat: string; perHour: Map<string, number> }

async function seedSources(level: number): Promise<SeedSource[]> {
    const habitats: any[] = await db('foraging_habitats').where({ is_active: true }).select('*');
    const out: SeedSource[] = [];
    for (const h of habitats) {
        if ((h.required_level ?? 1) > level) continue;
        const table: any[] = typeof h.drop_table === 'string' ? JSON.parse(h.drop_table) : (h.drop_table || []);
        const total = table.reduce((s, e) => s + (Number(e.weight) || 0), 0);
        if (total <= 0) continue;
        const seconds = calculateForageTimer(h.base_timer, h.min_timer, level, h.required_level ?? 1, KNIFE_TIER);
        const foragesPerHour = 3600 / seconds;
        const perHour = new Map<string, number>();
        for (const e of table) {
            const avgQty = ((Number(e.min) || 1) + (Number(e.max) || 1)) / 2;
            perHour.set(e.itemName, foragesPerHour * (Number(e.weight) / total) * avgQty);
        }
        out.push({ habitat: h.name, perHour });
    }
    return out;
}

async function farmingProjection(levels: number[]) {
    const crops: any[] = await db('crops').where({ is_active: true }).select('*');

    console.log('\n=== FARMING, XP PER PLAYED HOUR AT REALISTIC BEST PLAY ===\n');
    console.log(`${PLAYED_HOURS_PER_DAY}h a day, one harvest per plot per day, up to ${FORAGE_BUDGET_HOURS}h of that foraging seeds.`);
    console.log('Seeds fill plots best crop first; plots they cannot fill take the best perennial.\n');
    console.log('lvl  plots  planted                                  forage h   farm xp/played hr   band/hr   x band');
    console.log('-'.repeat(104));

    for (const level of levels) {
        const plots = plotCapForLevel(level);
        const unlocked = crops.filter((c) => c.plant_level <= level);
        if (unlocked.length === 0) continue;

        const activePerPlot = activeXp(level, PLOT_CAPACITY * HARVEST_SECONDS_PER_SEED);
        // Per seed, what each annual pays at this level (first harvest, as annuals always are).
        const annuals = unlocked.filter((c) => !c.is_perennial)
            .map((c) => ({ crop: c, perSeed: harvestSeedXp(level, c, PLOT_CAPACITY, 0) / PLOT_CAPACITY }))
            .sort((a, b) => b.perSeed - a.perSeed);
        const perennial = unlocked.filter((c) => c.is_perennial)
            .map((c) => ({ crop: c, perHarvest: harvestSeedXp(level, c, PLOT_CAPACITY, 1) }))
            .sort((a, b) => b.perHarvest - a.perHarvest)[0];

        // Plots are the scarce thing, so go crop by crop, best per seed first.
        // For each, forage ITS habitat for exactly what the remaining plots
        // need (within the day's budget), and bank everything else that habitat
        // drops, since one forage yields every seed type in its table. Seeds
        // are per day at steady state, so plots may be filled fractionally: on
        // average, that many plots of that crop are planted each day.
        const sources = await seedSources(level);
        const seedsPerDay = new Map<string, number>();
        const planted = new Map<string, number>();
        let budget = FORAGE_BUDGET_HOURS;
        let seedsWanted = plots * PLOT_CAPACITY;
        const activePerSeed = activePerPlot / PLOT_CAPACITY;
        let xpDay = 0;

        for (const a of annuals) {
            if (seedsWanted <= 0) break;
            const seedName = a.crop.seed_item_name;

            let have = seedsPerDay.get(seedName) ?? 0;
            if (have < seedsWanted && budget > 0) {
                const src = sources
                    .filter((s) => (s.perHour.get(seedName) ?? 0) > 0)
                    .sort((x, y) => (y.perHour.get(seedName) ?? 0) - (x.perHour.get(seedName) ?? 0))[0];
                if (src) {
                    const rate = src.perHour.get(seedName) ?? 0;
                    const hours = Math.min(budget, (seedsWanted - have) / rate);
                    for (const [name, r] of src.perHour) {
                        seedsPerDay.set(name, (seedsPerDay.get(name) ?? 0) + r * hours);
                    }
                    budget -= hours;
                    have = seedsPerDay.get(seedName) ?? 0;
                }
            }

            const use = Math.min(have, seedsWanted);
            if (use <= 0) continue;
            seedsPerDay.set(seedName, have - use);
            seedsWanted -= use;
            planted.set(a.crop.name, (planted.get(a.crop.name) ?? 0) + use / PLOT_CAPACITY);
            xpDay += use * (a.perSeed + activePerSeed);
        }

        // Plots the seeds could not fill take the best perennial, which needs
        // no seed once it is established.
        let free = seedsWanted / PLOT_CAPACITY;
        if (free > 0.01 && perennial) {
            xpDay += free * (perennial.perHarvest + activePerPlot);
            planted.set(perennial.crop.name, (planted.get(perennial.crop.name) ?? 0) + free);
            free = 0;
        }
        const mix = [...planted.entries()]
            .filter(([, n]) => n >= 0.05)
            .map(([name, n]) => `${n.toFixed(1)} ${name}`);

        const perHour = xpDay / PLAYED_HOURS_PER_DAY;
        const band = bandPerHour(level);
        const forageUsed = FORAGE_BUDGET_HOURS - budget;
        console.log(
            `${String(level).padStart(3)}  ${String(plots).padStart(5)}  ${mix.join(', ').padEnd(40).slice(0, 40)} `
            + `${forageUsed.toFixed(1).padStart(8)}   ${Math.round(perHour).toLocaleString().padStart(17)}   `
            + `${Math.round(band).toLocaleString().padStart(7)}   ${(perHour / band).toFixed(2).padStart(6)}x`,
        );
    }

    const perennials = crops.filter((c) => c.is_perennial);
    if (perennials.length) {
        console.log('\nPerennials, first harvest against each regrowth, five levels above their own:');
        for (const c of perennials) {
            const lvl = c.plant_level + 5;
            console.log(`  ${String(c.name).padEnd(12)} first ${String(harvestSeedXp(lvl, c, PLOT_CAPACITY, 0)).padStart(6)}`
                + `   then ${String(harvestSeedXp(lvl, c, PLOT_CAPACITY, 1)).padStart(5)} per regrowth`);
        }
    }
}

/**
 * Your actual farmers, today's payout against the new one, from live tables.
 *
 * Reads every farmstead and prices each plot as it stands: its real crop, its
 * real seed count, and its real harvests_since_sow, through the shipping
 * harvestSeedXp. A plot with nothing in it is priced as sown full with the
 * player's best unlocked crop, since that is what they would do next. Read-only.
 *
 * "Old" is what the harvest paid before this change: seed count x xp_per_seed,
 * every harvest, perennial or not, with no taper.
 */
async function realFarmers() {
    const farmingSkill = await db('skills').where({ name: 'Farming' }).first();
    if (!farmingSkill) { console.log('No Farming skill row.'); return; }

    const crops = await db('crops').where({ is_active: true }).select('*');
    const byId = new Map(crops.map((c: any) => [c.id, c]));

    const farms = await db('player_properties as pp')
        .join('players as p', 'p.id', 'pp.player_id')
        .leftJoin('player_skills as ps', function () {
            this.on('ps.player_id', '=', 'pp.player_id')
                .andOn('ps.skill_id', '=', db.raw('?', [farmingSkill.id]));
        })
        .select('pp.id as property_id', 'p.username', 'ps.xp as farming_xp');

    const rows: any[] = [];
    for (const farm of farms) {
        const plots = await db('farm_plots').where({ property_id: farm.property_id });
        if (plots.length === 0) continue;

        const level = levelFromXp(Number(farm.farming_xp ?? 0));
        const bestCrop = crops
            .filter((c: any) => c.plant_level <= level)
            .sort((a: any, b: any) => b.xp_per_seed - a.xp_per_seed)[0];
        if (!bestCrop) continue;

        let oldDay = 0;
        let newDay = 0;
        for (const plot of plots) {
            const crop = (plot.crop_id && byId.get(plot.crop_id)) || bestCrop;
            const seeds = plot.seed_count > 0 ? plot.seed_count : PLOT_CAPACITY;
            // One harvest per plot per day for an 8-hour player.
            oldDay += seeds * crop.xp_per_seed;
            // Steady state: a perennial is a regrowth after its first harvest.
            const since = crop.is_perennial ? Math.max(1, Number(plot.harvests_since_sow) || 0) : 0;
            newDay += harvestSeedXp(level, crop, seeds, since);
        }

        const band = bandPerHour(level);
        rows.push({
            name: farm.username, level, plots: plots.length,
            oldHr: oldDay / PLAYED_HOURS_PER_DAY, newHr: newDay / PLAYED_HOURS_PER_DAY, band,
        });
    }

    rows.sort((a, b) => b.level - a.level);

    console.log('\n\n=== YOUR ACTUAL FARMERS: farming XP per played hour, old against new ===\n');
    console.log('player             lvl  plots    old/hr   old x band    new/hr   new x band');
    console.log('-'.repeat(82));
    for (const r of rows.slice(0, 25)) {
        console.log(
            `${String(r.name).slice(0, 17).padEnd(17)} ${String(r.level).padStart(4)} ${String(r.plots).padStart(6)}  `
            + `${Math.round(r.oldHr).toLocaleString().padStart(8)}   ${(r.oldHr / r.band).toFixed(2).padStart(9)}x  `
            + `${Math.round(r.newHr).toLocaleString().padStart(8)}   ${(r.newHr / r.band).toFixed(2).padStart(9)}x`,
        );
    }
    if (rows.length === 0) console.log('(no farmsteads with plots)');
}

async function main() {
    const arg = process.argv.indexOf('--level');
    const levels = arg > -1
        ? [Number(process.argv[arg + 1])]
        : [1, 3, 5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 57];

    if (process.argv.includes('--players')) {
        await realFarmers();
    } else {
        await farmingProjection(levels);
        await husbandryReport(levels);
    }
    await db.destroy();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
