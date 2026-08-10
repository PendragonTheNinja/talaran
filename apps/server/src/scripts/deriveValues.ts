/**
 * Derive a gold value for every item from the game's own data.
 *
 *   npm run values:derive            report only (markdown + CSV to /tmp)
 *   npm run values:derive -- --write also fill items.value
 *
 * THE PEG (docs/economy-spec.md, locked with Nathan 2026-08-08):
 * value is time, priced off the xp-rebalance band. An action worth X xp yields
 * X/5 gold of value, so an hour on-band creates band(level)/5 gold (~440g/hr at
 * level 1). Everything else follows from four rules:
 *
 *   1. GATHERED items: value = action xp / 5.
 *   2. WEIGHTED tables (foraging, quality rolls, drop tables): rarity prices
 *      itself. v_i = actionValue / (N * p_i), which conserves total value per
 *      action (sum p_i * v_i = actionValue) while a 1-in-120 find prices at
 *      ~N*120 times a guaranteed one.
 *   3. CRAFTED items: inputs + labour, labour priced at the BASE band, not the
 *      crafting x1.8 XP multiplier (that is an XP incentive, not value).
 *      Cheapest acquisition wins when several paths make the same thing.
 *   4. HUSBANDRY products: feed + one minute of tending. NOT elapsed passive
 *      time: animals produce in parallel, so the clock is not player time.
 *      (First draft priced Milk at 481g by getting this wrong.)
 *
 * Items with no computable source get a TIER ESTIMATE (unlock at the tier's
 * first level, nominal 60s action) and are flagged HAND-TUNE in the report.
 *
 * HARD-WON SOURCE NOTES (each cost a wrong run to learn):
 *  - huntable_animals has xp_success/xp_failure, NOT xp_reward. drop_table is
 *    jsonb [{itemName,min,max,chance(percent, can be <1)}].
 *  - Ores are 'Ambren Ore' + 'Dense Ambren Ore' (quality null/'dense'), NOT
 *    poor/fine/excellent. Dense chance scales with levels-over in
 *    services/mining.ts, so Dense is priced at a flat 2x base with a note.
 *  - Logs ARE poor/fine/excellent, matched by (subtype, quality).
 *  - Sawing/woodworking/smelting/smithing predate the recipes table and live as
 *    exported constants in services/carpentry.ts and services/smithing.ts.
 *    Importing those services drags in routes/quests -> ../index (the server
 *    bootstrap), so quest progress is stubbed at the module loader first.
 *  - Secondary drops (Bird's Nest etc.) are drop_table_entries keyed by a
 *    free-form source_key ('woodcutting:lanai', 'mining:rock:granite') with
 *    item_id + chance_one_in.
 */
import knexLib from 'knex';
import * as fs from 'fs';

// ---- Stub the server bootstrap BEFORE any service import ------------------
// The constant tables live in services that reach back to routes/quests and,
// through services/drops, to ../index — which is the Express app itself, so a
// plain import boots the server (and fails on a middleware assert at index:164).
// Intercepting both at the module loader keeps this a pure data read.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Module: any = require('module');
const originalLoad = Module._load;
const noopLogger = {
    info: () => undefined, warn: () => undefined,
    error: (m: unknown) => console.error(m), debug: () => undefined,
};
Module._load = function (request: string, ...rest: unknown[]) {
    if (request.includes('routes/quests')) {
        return {
            updateQuestObjectiveProgress: async () => undefined,
            backfillQuestObjectives: async () => undefined,
        };
    }
    // '../index', '../../index' — the server bootstrap.
    if (/^\.{1,2}(\/\.\.)*\/index$/.test(request)) {
        return { logger: noopLogger, io: { to: () => ({ emit: () => undefined }) }, connectedPlayers: new Set() };
    }
    return originalLoad.apply(this, [request, ...rest]);
};
/* eslint-disable @typescript-eslint/no-var-requires */
const { SAW_RECIPES, WOODWORK_RECIPES } = require('../services/carpentry');
const { SMELT_RECIPES, SMITH_RECIPES } = require('../services/smithing');
/* eslint-enable @typescript-eslint/no-var-requires */

const db = knexLib({ client: 'pg', connection: process.env.DATABASE_URL });

// ---- The peg ---------------------------------------------------------------
const VALUE_DIVISOR = 5;                        // gold value = xp / 5
const BAND_R1 = 2000;                           // docs/xp-rebalance.md
const BAND_GROWTH = Math.pow(1.33, 1 / 12);
const BAND_DIP = 1.10;
const TEND_SECONDS = 60;
const PASSIVE_HANDLING_SECONDS = 60;            // load + collect a passive job                        // husbandry attention per product
const DENSE_ORE_MULT = 2;                       // dense chance is level-scaled in code; flat 2x here
const TIER_ESTIMATE_SECONDS = 60;               // nominal action for tier-estimated items
const NPC_BUY_PCT = 45;                         // report columns only; walls live in economy-spec
const NPC_SELL_PCT = 175;

const bandXpPerHour = (level: number) =>
    BAND_R1 * BAND_DIP * Math.pow(BAND_GROWTH, Math.max(1, level) - 1);
const goldPerHour = (level: number) => bandXpPerHour(level) / VALUE_DIVISOR;
const goldForSeconds = (level: number, seconds: number) =>
    goldPerHour(level) * (seconds / 3600);

type Method =
    | 'fish' | 'forage' | 'node' | 'byproduct' | 'trap' | 'hunt' | 'crop'
    | 'husbandry' | 'recipe' | 'saw' | 'woodwork' | 'smelt' | 'smith'
    | 'tier-estimate';

interface Derived { value: number; method: Method; basis: string; level: number }

const best = new Map<string, Derived>();
/** Keep the CHEAPEST honest acquisition: value is a floor, not an average. */
function propose(name: unknown, d: Derived): void {
    if (typeof name !== 'string' || !name) return;
    const v = Math.max(1, Math.round(d.value));
    const prev = best.get(name);
    if (!prev || v < prev.value) best.set(name, { ...d, value: v });
}

interface PseudoRecipe {
    name: string;
    output: string;
    outputQty: number;
    inputs: Array<{ itemName: string; qty: number }>;
    level: number;
    timer: number;
    method: Method;
    passive?: boolean;
}


/**
 * Read a content table, tolerating its absence.
 *
 * The derivation runs against whatever database it is pointed at, and those
 * differ: live had not yet run the fishing migrations when its first content
 * snapshot was taken, so fish_species and bait_values simply were not there. A
 * missing table means "this system does not exist here yet", not an error, and
 * the report should still price everything else.
 */
async function readTable(name: string, activeOnly = true): Promise<any[]> {
    try {
        const q = db(name);
        if (activeOnly) {
            const info = await db(name).columnInfo();
            if ((info as any).is_active) return await q.where({ is_active: true });
        }
        return await q.select('*');
    } catch {
        console.warn(`  (skipping ${name}: not present in this database)`);
        return [];
    }
}

async function main(): Promise<void> {
    const write = process.argv.includes('--write');
    const items: Array<{ id: number; name: string; tier: number | null }> =
        await db('items').select('id', 'name', 'tier');
    const itemNames = new Set(items.map((i) => i.name));
    const itemById = new Map(items.map((i) => [i.id, i.name]));

    // ---- 1. Fish: xp / 5, straight ----------------------------------------
    for (const f of await readTable('fish_species')) {
        propose(f.item_name, {
            value: Number(f.xp) / VALUE_DIVISOR,
            method: 'fish', level: f.required_level,
            basis: `${f.xp} xp catch at Fishing ${f.required_level}`,
        });
    }

    // ---- 2. Foraging: weighted table, conservation rule --------------------
    for (const h of await readTable('foraging_habitats')) {
        let table: any[];
        try { table = typeof h.drop_table === 'string' ? JSON.parse(h.drop_table) : h.drop_table; }
        catch { continue; }
        if (!Array.isArray(table) || table.length === 0) continue;
        const totalW = table.reduce((s, e) => s + (Number(e.weight) || 0), 0);
        if (totalW <= 0) continue;
        const N = table.length;
        for (const e of table) {
            const p = (Number(e.weight) || 0) / totalW;
            if (p <= 0) continue;
            const avgQty = ((Number(e.min) || 1) + (Number(e.max) || 1)) / 2;
            const actionValue = goldForSeconds(h.required_level, Number(h.base_timer) || 6);
            propose(e.itemName, {
                value: actionValue / (N * p * avgQty),
                method: 'forage', level: h.required_level,
                basis: `1-in-${Math.round(1 / p)} at ${h.name} (L${h.required_level}, ${h.base_timer}s)`,
            });
        }
    }

    // ---- 3. Resource nodes ------------------------------------------------
    // Woodcutting: poor/fine/excellent LOG items share the action value by the
    // conservation rule. Mining: base ore = xp/5; Dense = flat 2x (the real
    // dense chance scales with levels-over in services/mining.ts, so any flat
    // number is an approximation; 2x errs cheap). Stone rocks ('Granite Rock')
    // match the first item whose name starts with the subtype word.
    for (const n of await readTable('resource_nodes')) {
        const actionValue = Number(n.xp_reward) / VALUE_DIVISOR;
        const subtype = String(n.name).split(' ')[0].toLowerCase();
        if (n.skill === 'woodcutting') {
            const qualities: Array<[string, number]> = ([
                ['poor', Number(n.poor_chance) || 0],
                ['fine', Number(n.fine_chance) || 0],
                ['excellent', Number(n.excellent_chance) || 0],
            ] as Array<[string, number]>).filter(([, c]) => c > 0);
            const totalC = qualities.reduce((s, [, c]) => s + c, 0);
            if (totalC <= 0) continue;
            const N = qualities.length;
            for (const [q, c] of qualities) {
                const p = c / totalC;
                const item = items.find((i) => {
                    const low = i.name.toLowerCase();
                    return low.includes(subtype) && low.startsWith(q) && low.includes('log');
                });
                if (!item) continue;
                propose(item.name, {
                    value: actionValue / (N * p),
                    method: 'node', level: n.required_level,
                    basis: `${q} roll (${c}%) at ${n.name}, ${n.xp_reward} xp`,
                });
            }
        } else if (n.skill === 'mining') {
            const base = items.find((i) => i.name.toLowerCase() === `${subtype} ore`)
                ?? items.find((i) => i.name.toLowerCase().startsWith(subtype)
                    && !i.name.toLowerCase().startsWith('dense'));
            if (base) {
                propose(base.name, {
                    value: actionValue,
                    method: 'node', level: n.required_level,
                    basis: `${n.name}, ${n.xp_reward} xp`,
                });
                const dense = items.find((i) => i.name === `Dense ${base.name}`);
                if (dense) {
                    propose(dense.name, {
                        value: actionValue * DENSE_ORE_MULT,
                        method: 'node', level: n.required_level,
                        basis: `dense roll at ${n.name} (flat x${DENSE_ORE_MULT}; real chance is level-scaled)`,
                    });
                }
            }
        }
    }

    // ---- 4. Secondary drops: drop_table_entries by source_key --------------
    // A byproduct is a free bonus on an action already paid for, so it is
    // priced at actionValue * chance_one_in with the parent action found by the
    // source_key's second-ish token matched against node names.
    const nodes = await readTable('resource_nodes');
    for (const e of await readTable('drop_table_entries')) {
        const key = String(e.source_key);                 // 'woodcutting:lanai', 'mining:rock:granite'
        const parts = key.split(':');
        const word = parts[parts.length - 1];
        const parent = nodes.find((n) => String(n.name).toLowerCase().includes(word));
        if (!parent) continue;
        const name = itemById.get(Number(e.item_id));
        if (!name) continue;
        const avgQty = ((Number(e.min_qty) || 1) + (Number(e.max_qty) || 1)) / 2;
        const actionValue = Number(parent.xp_reward) / VALUE_DIVISOR;
        propose(name, {
            value: (actionValue * Math.max(1, Number(e.chance_one_in))) / avgQty,
            method: 'byproduct', level: parent.required_level,
            basis: `1-in-${e.chance_one_in} byproduct of ${parent.name}`,
        });
    }

    // ---- 5. Trapping: passive, target xp spread across its drops -----------
    for (const t of await readTable('trap_targets')) {
        let table: any[];
        try { table = typeof t.drop_table === 'string' ? JSON.parse(t.drop_table) : t.drop_table; }
        catch { continue; }
        if (!Array.isArray(table) || table.length === 0) continue;
        const actionValue = Number(t.xp) / VALUE_DIVISOR;
        const entries = table.filter((e) => (Number(e.chance) || 0) > 0);
        const N = entries.length || 1;
        for (const e of entries) {
            const p = Math.min(1, (Number(e.chance) || 100) / 100);
            const avgQty = ((Number(e.min) || 1) + (Number(e.max) || 1)) / 2;
            propose(e.itemName, {
                value: actionValue / (N * p * avgQty),
                method: 'trap', level: 1,
                basis: `${t.name} snare drop (${p * 100 < 1 ? (p * 100).toFixed(2) : Math.round(p * 100)}%)`,
            });
        }
    }

    // ---- 6. Hunting: xp_success spread across the drop json ----------------
    for (const a of await readTable('huntable_animals')) {
        let drops: any[];
        try { drops = typeof a.drop_table === 'string' ? JSON.parse(a.drop_table) : a.drop_table; }
        catch { continue; }
        if (!Array.isArray(drops) || drops.length === 0) continue;
        const actionValue = Number(a.xp_success) / VALUE_DIVISOR;
        if (actionValue <= 0) continue;
        const entries = drops.filter((e) => (Number(e.chance) || 0) > 0);
        const N = entries.length || 1;
        for (const e of entries) {
            const p = Math.min(1, (Number(e.chance) || 100) / 100);
            const avgQty = ((Number(e.min) || 1) + (Number(e.max) || 1)) / 2;
            propose(e.itemName, {
                value: actionValue / (N * p * avgQty),
                method: 'hunt', level: a.required_level,
                basis: `${a.name} hunt (L${a.required_level}, ${p * 100 < 1 ? (p * 100).toFixed(2) : Math.round(p * 100)}%)`,
            });
        }
    }

    // ---- 7. Crops: seed + attention, NOT growth XP -------------------------
    // Same trap as husbandry, and it bit twice. A crop's xp_per_seed is large
    // (Flax 497) because farming pays for an 18-hour GROW, and elapsed growth is
    // not player time: the field works while the player fishes. Pricing off that
    // XP put Flax at 35g and cascaded to Linen Thread 138g and a 849g Fishing
    // Net. What a harvest actually costs is the seed plus the sow/tend/harvest
    // handling it occasions.
    const CROP_ATTENTION_SECONDS = 120;
    for (const c of await readTable('crops')) {
        const seedCost = best.get(c.seed_item_name)?.value ?? 1;
        const attention = goldForSeconds(Number(c.plant_level) || 1, CROP_ATTENTION_SECONDS);
        const yieldQty = Math.max(1, Number(c.yield_per_seed));
        propose(c.produce_item_name, {
            value: (attention + seedCost) / yieldQty,
            method: 'crop', level: c.plant_level,
            basis: `${c.name}: seed ${seedCost}g + ${CROP_ATTENTION_SECONDS}s handling over yield ${yieldQty}`,
        });
        if (!best.has(c.seed_item_name)) {
            propose(c.seed_item_name, {
                value: seedCost, method: 'crop', level: c.plant_level,
                basis: `${c.name} seed (bootstrap)`,
            });
        }
    }

    // ---- 8. Husbandry products: feed + attention, NOT elapsed time ---------
    for (const s of await readTable('animal_species')) {
        if (!s.product_item_name || !s.product_seconds) continue;
        const feedCost = (best.get(s.feed_item_name)?.value ?? 1) * Number(s.feed_qty || 1);
        const attention = goldForSeconds(Number(s.husbandry_level) || 1, TEND_SECONDS);
        propose(s.product_item_name, {
            value: (attention + feedCost) / Math.max(1, Number(s.product_qty)),
            method: 'husbandry', level: Number(s.husbandry_level) || 1,
            basis: `${s.name}: feed ${feedCost}g + ${TEND_SECONDS}s tending`,
        });
    }

    // ---- 9. All recipe systems, unified, iterated to fixpoint --------------
    // The recipes TABLE plus the four code-constant systems, normalised into
    // one list. Iteration instead of a topological sort: chains are shallow
    // (<6 deep), so a few passes converge without cycle analysis.
    const pseudo: PseudoRecipe[] = [];
    for (const r of await readTable('recipes')) {
        let inputs: Array<{ itemName: string; qty: number }>;
        try { inputs = typeof r.inputs === 'string' ? JSON.parse(r.inputs) : r.inputs; }
        catch { continue; }
        if (!Array.isArray(inputs)) continue;
        pseudo.push({
            name: r.name, output: r.output_item_name,
            outputQty: Math.max(1, Number(r.output_qty)),
            inputs: inputs.map((i) => ({ itemName: i.itemName, qty: Number(i.qty) || 1 })),
            level: Number(r.required_level) || 1,
            timer: Number(r.timer_seconds) || 0,
            method: 'recipe',
            passive: r.mode === 'passive',
        });
    }
    const addConst = (rec: any, key: string, method: Method) => {
        const ins = (rec.ingredients ?? []).map((i: any) => ({ itemName: i.name, qty: Number(i.quantity) || 1 }));
        pseudo.push({
            name: key, output: rec.output,
            outputQty: Math.max(1, Number(rec.outputQuantity) || 1),
            inputs: ins,
            level: Number(rec.requiredLevel) || 1,
            timer: Number(rec.timer) || 0,
            method,
        });
    };
    for (const [k, r] of Object.entries<any>(SAW_RECIPES ?? {})) addConst(r, k, 'saw');
    for (const [k, r] of Object.entries<any>(WOODWORK_RECIPES ?? {})) addConst(r, k, 'woodwork');
    for (const [k, r] of Object.entries<any>(SMELT_RECIPES ?? {})) addConst(r, k, 'smelt');
    for (const [k, r] of Object.entries<any>(SMITH_RECIPES ?? {})) addConst(r, k, 'smith');

    // ---- 9a. Tier-estimate the LEAVES before pricing recipes ---------------
    // Ordering bug found on the first v2 run: tier-estimate used to run last, so
    // a recipe whose input was only ever tier-estimated never fired, and the
    // output fell through to a tier estimate too. That silently killed the
    // entire metal chain (Charc was unpriced -> Ambren Ingot never smelted ->
    // no ingot meant no pickaxe, no hatchet, no nails).
    //
    // A leaf is an item no recipe produces. Estimating those first gives the
    // fixpoint something to stand on; anything a recipe DOES produce is left
    // alone here so its real cost wins.
    const recipeOutputs = new Set<string>(pseudo.map((r) => r.output));
    for (const i of items) {
        if (best.has(i.name) || recipeOutputs.has(i.name)) continue;
        const tier = Number(i.tier);
        if (!Number.isFinite(tier) || tier < 1) continue;
        const unlock = (tier - 1) * 12 + 1;
        propose(i.name, {
            value: goldForSeconds(unlock, TIER_ESTIMATE_SECONDS),
            method: 'tier-estimate', level: unlock,
            basis: `tier ${tier} leaf, nominal ${TIER_ESTIMATE_SECONDS}s at L${unlock} (HAND-TUNE)`,
        });
    }

    for (let pass = 0; pass < 10; pass++) {
        let changed = false;
        for (const r of pseudo) {
            if (!r.inputs.every((i) => best.has(i.itemName))) continue;
            const inputCost = r.inputs.reduce(
                (s, i) => s + (best.get(i.itemName)!.value * i.qty), 0);
            // PASSIVE recipes are the third instance of the same trap (after
            // husbandry products and crops): a 6-hour tanning soak is elapsed
            // time, not player time, and the vat works while the player fishes.
            // Pricing the timer put Leather at 1081g (3193g of "labour") and
            // cascaded to 6228g boots. Passive work costs the handling it
            // occasions, not the clock.
            const labour = r.passive
                ? goldForSeconds(r.level, PASSIVE_HANDLING_SECONDS)
                : goldForSeconds(r.level, r.timer);
            const perUnit = Math.max(1, Math.round((inputCost + labour) / r.outputQty));
            const prev = best.get(r.output);
            // A real recipe cost always beats a tier ESTIMATE, even when dearer:
            // the estimate is a placeholder, not a competing acquisition path.
            // Between two real paths, the cheaper one wins.
            const prevIsGuess = prev?.method === 'tier-estimate';
            if (!prev || prevIsGuess || perUnit < prev.value) {
                best.set(r.output, {
                    value: perUnit, method: r.method, level: r.level,
                    basis: `${r.name}: inputs ${Math.round(inputCost)}g + ${Math.round(labour)}g labour / ${r.outputQty}`,
                });
                changed = true;
            }
        }
        if (!changed) break;
    }

    // ---- 10. Everything left: tier estimate --------------------------------
    for (const i of items) {
        if (best.has(i.name)) continue;
        const tier = Number(i.tier);
        if (!Number.isFinite(tier) || tier < 1) continue;   // tier 0 admin items stay null
        const unlock = (tier - 1) * 12 + 1;
        propose(i.name, {
            value: goldForSeconds(unlock, TIER_ESTIMATE_SECONDS),
            method: 'tier-estimate', level: unlock,
            basis: `tier ${tier} nominal ${TIER_ESTIMATE_SECONDS}s action at L${unlock} (HAND-TUNE)`,
        });
    }

    // ---- Output -------------------------------------------------------------
    const byMethod = new Map<Method, Array<{ name: string; d: Derived }>>();
    for (const [name, d] of best) {
        if (!itemNames.has(name)) continue;
        const list = byMethod.get(d.method) ?? [];
        list.push({ name, d });
        byMethod.set(d.method, list);
    }
    const orphanRefs = [...best.keys()].filter((n) => !itemNames.has(n));

    let md = `# Derived item values\n\nPeg: value = xp / ${VALUE_DIVISOR}. `
        + `NPC walls: buys at ${NPC_BUY_PCT}%, sells at ${NPC_SELL_PCT}%. `
        + `Level-1 band: ${Math.round(goldPerHour(1))}g of value per hour.\n`;
    const order: Method[] = ['fish', 'forage', 'node', 'byproduct', 'trap', 'hunt',
        'crop', 'husbandry', 'saw', 'smelt', 'woodwork', 'smith', 'recipe', 'tier-estimate'];
    for (const m of order) {
        const list = (byMethod.get(m) ?? []).sort((a, b) => a.d.level - b.d.level || a.d.value - b.d.value);
        if (list.length === 0) continue;
        md += `\n## ${m} (${list.length})\n\n| Item | Value | NPC buys | NPC sells | Basis |\n|---|---|---|---|---|\n`;
        for (const { name, d } of list) {
            const buy = Math.max(1, Math.floor(d.value * NPC_BUY_PCT / 100));
            const sell = Math.max(1, Math.ceil(d.value * NPC_SELL_PCT / 100));
            md += `| ${name} | ${d.value}g | ${buy}g | ${sell}g | ${d.basis} |\n`;
        }
    }
    const unpriced = items.filter((i) => !best.has(i.name));
    if (unpriced.length) {
        md += `\n## No value assigned (${unpriced.length})\n\n`
            + unpriced.map((i) => `- ${i.name} (tier ${i.tier})`).join('\n') + '\n';
    }
    if (orphanRefs.length) {
        md += `\n## Drop-table names matching NO item (data bugs)\n\n`
            + orphanRefs.map((n) => `- ${n}`).join('\n') + '\n';
    }

    fs.writeFileSync('/tmp/derived-values.md', md);
    fs.writeFileSync('/tmp/derived-values.csv',
        'item,value,method,basis\n' + [...best.entries()]
            .filter(([n]) => itemNames.has(n))
            .map(([n, d]) => `"${n}",${d.value},${d.method},"${d.basis.replace(/"/g, "'")}"`).join('\n'));
    console.log(`priced ${[...best.keys()].filter((n) => itemNames.has(n)).length}/${items.length} items; `
        + `${unpriced.length} unpriced; ${orphanRefs.length} orphan refs. Report: /tmp/derived-values.md`);

    if (write) {
        let n = 0;
        for (const [name, d] of best) {
            if (!itemNames.has(name)) continue;
            await db('items').where({ name }).update({ value: d.value });
            n++;
        }
        console.log(`wrote items.value for ${n} items`);
    }
    await db.destroy();
}

main().catch((e) => { console.error(e); process.exit(1); });
