// Additional manual data queries (docs/manual-spec.md §4).
//
// Registered into the same registry as the originals and returning the same
// ManualTable shape, so the client needs no changes and every one of these
// appears in both the Cartographer's pages and the reference view.
//
// The rule these follow, which is what keeps them from reading like a database
// dump: a column is only worth a place if a player would make a different
// decision knowing it. Internal ids, display_order and is_active never appear.
// Where the schema stores a raw number that means little on its own, it is
// resolved here into the thing the player actually cares about, so a drop
// weight becomes a percentage and a seed count becomes yield per plot.

import db from '../db';
import { PEN_COST } from './husbandry';
import { FARM_ESTABLISH_COST, plotCost } from './farming';
import { ESTABLISH_COST as SHOP_COST, SHOP_TOWN, CARPENTRY_REQ as SHOP_CARPENTRY_REQ } from './shops';
import { BUILD_COST as TALLY_COST, CARPENTRY_REQ as TALLY_CARPENTRY_REQ } from './tally';
import type { ManualTable } from '../routes/manual';
import { FORMS, STANCE_MULTIPLIER, TYPE_AIM, COMBAT, maxHp, unarmedWeapon, UNARMED, type Form } from '../lib/combatMath';
import { RUNGS } from '../lib/tiers';
import { BESTIARY_STEPS } from './bestiary';

type QueryHandler = (param?: string) => Promise<ManualTable | null>;

/** Turns a raw weight into a share of the table, which is what a player reads. */
function share(weight: number, total: number): string {
    if (!total) return '0%';
    const pct = (weight / total) * 100;
    if (pct >= 10) return `${Math.round(pct)}%`;
    if (pct >= 1) return `${pct.toFixed(1)}%`;
    return `${pct.toFixed(2)}%`;
}

function range(min: number, max: number): string {
    return min === max ? String(min) : `${min} to ${max}`;
}

/**
 * Falls back to a readable form of a subtype when no item row matches.
 * The columns store 'ambren', 'granite'; printing those raw is how a lowercase
 * word ends up sitting in a column of proper item names.
 */
function titleCase(v: string): string {
    return String(v)
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

const FORM_LABEL: Record<Form, string> = { dual: 'A pair', onehand: 'One hand', twohand: 'Both hands' };

function cap(v: string): string {
    return v.charAt(0).toUpperCase() + v.slice(1);
}

function seconds(s: number): string {
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rest = s % 60;
    if (m < 60) return rest ? `${m}m ${rest}s` : `${m}m`;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return mm ? `${h}h ${mm}m` : `${h}h`;
}

export const extraQueries: Record<string, QueryHandler> = {

    // ── What carpentry builds ───────────────────────────────────────────────
    //
    // Buildings are not recipes and never appear in training-path, so a carpenter
    // reading the manual could see every plank they might saw and nothing they
    // might raise. The costs live in service constants, which are imported here
    // rather than restated: a table of numbers copied into the manual is wrong
    // the first time somebody retunes the real one.
    //
    // Several scale with how many you already own. The first is quoted and the
    // step is stated, because a reader wants to know what the next one costs,
    // not to read forty rows of arithmetic they could have done themselves.
    'buildings': async () => {
        const rows: Record<string, string | number>[] = [];

        const scaling = (
            what: string,
            level: string,
            where: string,
            first: { itemName: string; qty: number }[],
            second: { itemName: string; qty: number }[] | null,
        ) => {
            const cost = first.map((c) => {
                const next = second?.find(x => x.itemName === c.itemName)?.qty ?? c.qty;
                const step = next - c.qty;
                return step > 0
                    ? `${c.qty} x ${c.itemName} (+${step} each after)`
                    : `${c.qty} x ${c.itemName}`;
            });
            rows.push({ what, level, where, cost: cost.join(', ') });
        };

        scaling('Tally board', `Carpentry ${TALLY_CARPENTRY_REQ}`, 'Anywhere you may build', TALLY_COST, null);
        scaling('Shop', `Carpentry ${SHOP_CARPENTRY_REQ}`, SHOP_TOWN, SHOP_COST, null);
        scaling('Homestead', 'Carpentry 1', 'Your own land', FARM_ESTABLISH_COST, null);
        scaling('Farm plot', 'Carpentry 1', 'On your homestead', plotCost(1), plotCost(2));
        // Raising a pen is carpentry and pays Carpentry, whatever the animals in
        // it are worth later. Husbandry decides how MANY you may own, not
        // whether you may build one, and those are different questions.
        scaling('Coop', 'Carpentry 1', 'On your homestead', PEN_COST.coop(1), PEN_COST.coop(2));
        scaling('Paddock', 'Carpentry 1', 'On your homestead', PEN_COST.paddock(1), PEN_COST.paddock(2));

        return {
            title: 'Everything you can raise',
            columns: [
                { key: 'what', label: 'Building' },
                { key: 'where', label: 'Where' },
                { key: 'level', label: 'Asks' },
                { key: 'cost', label: 'Costs' },
            ],
            rows,
            note: 'Every structure here is carpentry and pays Carpentry, whatever trade uses it afterwards. A figure marked with a plus is what each further one costs on top of the last, so the second coop is dearer than the first and the tenth is dearer again. Pens are the exception to the level column: anyone may build one, but you may only keep one pen for every three levels of Husbandry, to a ceiling of twelve. Nothing here is refundable, and nothing here moves once built.',
        };
    },

    // ── Foraging ────────────────────────────────────────────────────────────
    // The habitat's whole drop table, weights resolved to percentages.
    //
    // This is a deliberate spoiler. The game reveals a habitat's contents one
    // find at a time and the manual now gives the lot away, because a player
    // who opens a reference page has decided they want the numbers.
    'foraging-habitats': async (param?: string) => {
        const habitats = await db('foraging_habitats')
            .join('locations', 'locations.id', 'foraging_habitats.location_id')
            .where('foraging_habitats.is_active', true)
            .modify((q) => {
                if (param) q.whereRaw('LOWER(foraging_habitats.name) = LOWER(?)', [param]);
            })
            .orderBy(['foraging_habitats.required_level', 'foraging_habitats.display_order'])
            .select(
                'foraging_habitats.name as habitat',
                'foraging_habitats.required_level as level',
                'foraging_habitats.base_timer as timer',
                'foraging_habitats.min_timer as floor',
                'foraging_habitats.drop_table as drops',
                'locations.name as where',
            );

        if (!habitats.length) return null;

        const rows: Record<string, string | number>[] = [];
        for (const h of habitats) {
            const drops = typeof h.drops === 'string' ? JSON.parse(h.drops) : h.drops;
            const total = drops.reduce((sum: number, d: any) => sum + (d.weight || 0), 0);
            for (const d of drops) {
                rows.push({
                    habitat: h.habitat,
                    where: h.where,
                    find: d.itemName,
                    chance: share(d.weight || 0, total),
                    qty: range(d.min ?? 1, d.max ?? 1),
                    xp: Number(d.xp || 0).toLocaleString(),
                    needs: [
                        d.requiresGloves ? 'Gloves' : null,
                        d.season ? d.season : null,
                    ].filter(Boolean).join(', ') || '',
                });
            }
        }

        return {
            title: param ? `${habitats[0].habitat}` : 'Every habitat, and everything in it',
            columns: [
                { key: 'habitat', label: 'Habitat' },
                { key: 'where', label: 'Where' },
                { key: 'find', label: 'Find', icon: 'find' },
                { key: 'chance', label: 'Share', align: 'right' },
                { key: 'qty', label: 'Amount', align: 'right' },
                { key: 'xp', label: 'XP', align: 'right' },
                { key: 'needs', label: 'Requires' },
            ],
            rows,
            note: 'Share is that find\'s slice of the habitat\'s table, before any gear. Rows marked Gloves never come up bare-handed, and you are given no sign they exist. Seasonal rows only appear in their season.',
        };
    },

    // Habitat timers, separated from the finds so the table above stays about
    // what you get and this one stays about how long it takes.
    'foraging-speed': async () => {
        const rows = await db('foraging_habitats')
            .join('locations', 'locations.id', 'foraging_habitats.location_id')
            .where('foraging_habitats.is_active', true)
            .orderBy('foraging_habitats.required_level')
            .select(
                'foraging_habitats.name as habitat',
                'locations.name as where',
                'foraging_habitats.required_level as level',
                'foraging_habitats.base_timer as timer',
                'foraging_habitats.min_timer as floor',
            );

        return {
            title: 'Habitats and search times',
            columns: [
                { key: 'habitat', label: 'Habitat' },
                { key: 'where', label: 'Where' },
                { key: 'level', label: 'Foraging', align: 'right' },
                { key: 'timer', label: 'At entry', align: 'right' },
                { key: 'floor', label: 'Fastest', align: 'right' },
            ],
            rows: rows.map((r: any) => ({
                habitat: r.habitat,
                where: r.where,
                level: r.level,
                timer: `${r.timer}s`,
                floor: `${r.floor}s`,
            })),
            note: 'Entry speed is what you search at on the day you qualify. The floor is what you approach as the level climbs, and a knife takes five percent per grade off whatever you are on, to a limit of half.',
        };
    },


    // ── Bait ────────────────────────────────────────────────────────────────
    // Fishing and trapping both run on bait, both pages talk about it at
    // length, and the table holding the actual numbers was never once queried.
    // Categories map to what wants them, so a reader can go from "I have a
    // sack of grain" to "that is worth something to a rabbit" without guessing.
    'bait': async (param?: string) => {
        const rows = await db('bait_values')
            .modify((q) => {
                if (param) q.whereRaw('LOWER(category) = LOWER(?)', [param]);
            })
            .orderBy(['category', 'bait_value', 'item_name'])
            .select('item_name as bait', 'category', 'bait_value as value');

        if (!rows.length) return null;

        return {
            title: param ? `${param} bait` : 'Bait, and what it is worth',
            columns: [
                { key: 'category', label: 'Wanted by' },
                { key: 'bait', label: 'Bait', icon: 'bait' },
                { key: 'value', label: 'Value', align: 'right' },
            ],
            rows: rows.map((r: any) => ({
                category: r.category,
                bait: r.bait,
                value: Number(r.value).toLocaleString(),
            })),
            note: 'Value is what one of a thing is worth as bait. Higher is better, and the cheapest bait that clears the bar is usually the right one, since the surplus is simply spent.',
        };
    },


    // ── Husbandry ───────────────────────────────────────────────────────────
    // Three tables, because an animal is three separate decisions: whether you
    // can keep it, what it gives you while alive, and what it gives you at the
    // end. Folding those into one row produced something nobody could read.

    'animals': async () => {
        const rows = await db('animal_species')
            .orderBy(['husbandry_level', 'name'])
            .select('*');

        return {
            title: 'The herd',
            columns: [
                { key: 'animal', label: 'Animal', icon: 'babyItem' },
                { key: 'level', label: 'Husbandry', align: 'right' },
                { key: 'pen', label: 'Pen' },
                { key: 'feed', label: 'Eats', icon: 'feedItem' },
                { key: 'grow', label: 'Young to grown', align: 'right' },
                { key: 'elder', label: 'Grown to elder', align: 'right' },
            ],
            rows: rows.map((r: any) => ({
                animal: r.name,
                babyItem: r.baby_item_name,
                level: r.husbandry_level,
                pen: r.pen_type,
                feed: `${r.feed_qty} x ${r.feed_item_name}`,
                feedItem: r.feed_item_name,
                grow: seconds(r.grow_seconds),
                elder: r.elder_seconds ? seconds(r.elder_seconds) : 'Never',
            })),
            note: 'Clocks only run on a pen that is fed and mucked out. Neglect one and the animals simply stop, quietly and without complaint.',
        };
    },

    // What an animal gives while it is alive, which is the reason to keep one
    // rather than hunt one.
    'animal-produce': async () => {
        const rows = await db('animal_species')
            .whereNotNull('product_item_name')
            .orderBy(['husbandry_level', 'name'])
            .select('*');

        if (!rows.length) return null;

        return {
            title: 'What they give while they live',
            columns: [
                { key: 'animal', label: 'Animal', icon: 'babyItem' },
                { key: 'product', label: 'Gives', icon: 'productItem' },
                { key: 'every', label: 'Every', align: 'right' },
                { key: 'qty', label: 'Amount', align: 'right' },
                { key: 'odds', label: 'Odds', align: 'right' },
                { key: 'stored', label: 'Holds up to', align: 'right' },
            ],
            rows: rows.map((r: any) => ({
                animal: r.name,
                babyItem: r.baby_item_name,
                product: r.product_item_name,
                productItem: r.product_item_name,
                every: r.product_seconds ? seconds(r.product_seconds) : 'Once',
                qty: r.product_qty ?? 1,
                odds: r.product_chance ? `${r.product_chance}%` : '100%',
                stored: r.product_max_stored ?? 'No limit',
            })),
            note: 'An elder gives the same amount but waits longer between them. Produce accumulates up to the limit and then stops, so a full animal is an idle one.',
        };
    },

    // And what it gives at the end. Stored as a drop table, so the odds are
    // per item rather than one guaranteed yield.
    'animal-slaughter': async () => {
        const rows = await db('animal_species')
            .orderBy(['husbandry_level', 'name'])
            .select('name', 'baby_item_name', 'husbandry_level', 'slaughter_table');

        const out: Record<string, string | number>[] = [];
        for (const r of rows) {
            let table: any[] = [];
            try {
                table = typeof r.slaughter_table === 'string'
                    ? JSON.parse(r.slaughter_table || '[]')
                    : (r.slaughter_table || []);
            } catch {
                table = [];
            }
            for (const d of table) {
                out.push({
                    animal: r.name,
                    babyItem: r.baby_item_name,
                    yieldName: d.itemName,
                    qty: range(d.min ?? 1, d.max ?? 1),
                    odds: (d.chance ?? 100) >= 100 ? 'Always' : `${d.chance}%`,
                });
            }
        }

        if (!out.length) return null;

        return {
            title: 'What they give at the end',
            columns: [
                { key: 'animal', label: 'Animal', icon: 'babyItem' },
                { key: 'yieldName', label: 'Yields', icon: 'yieldName' },
                { key: 'qty', label: 'Amount', align: 'right' },
                { key: 'odds', label: 'Odds', align: 'right' },
            ],
            rows: out,
            note: 'A butchering knife must be equipped. An elder butchers out no smaller than an adult, so there is no cost to letting one grow old beyond the waiting.',
        };
    },

    // ── Woodcutting and Mining ──────────────────────────────────────────────
    //
    // These do not repeat training-path, which already lists every node with
    // its level and where to find it. They answer the question that table does
    // not: what actually comes out, and at what odds.
    //
    // A node yields three different items, one per grade, and the grade carries
    // all the way through to what can be built from it. The grades are shown as
    // their real items with their real art, because "60% fine" means less than
    // seeing the Fine Lanai Log you will be holding.
    //
    // NOTE on the skill filter: LOWER() is not optional. resource_nodes.skill is
    // stored lowercase, and an exact-case match here returned nothing at all,
    // which is what produced the empty tables on Mining and Woodcutting.

    'trees': async () => {
        const nodes = await db('resource_nodes')
            .join('locations', 'locations.id', 'resource_nodes.location_id')
            .whereRaw('LOWER(resource_nodes.skill) = ?', ['woodcutting'])
            .andWhere('resource_nodes.is_active', true)
            .orderBy(['resource_nodes.required_level', 'resource_nodes.name'])
            .select(
                'resource_nodes.name as tree',
                'locations.name as where',
                'resource_nodes.required_level as level',
                'resource_nodes.required_tool_tier as tier',
                'resource_nodes.base_timer as timer',
                'resource_nodes.min_timer as floor',
                'resource_nodes.xp_reward as xp',
                'resource_nodes.fine_chance as fine',
                'resource_nodes.excellent_chance as excellent',
            );

        if (!nodes.length) return null;

        // Logs are named "<Quality> <Subtype> Log", so the item for a grade is
        // found by subtype rather than assembled from strings.
        const logs = await db('items').where({ type: 'log' }).select('name', 'subtype', 'quality');
        const logFor = (tree: string, quality: string): string => {
            const t = tree.toLowerCase();
            const hit = logs.find((l: any) => l.quality === quality && t.includes(String(l.subtype).toLowerCase()));
            return hit ? hit.name : '';
        };

        const graded = nodes.some((r: any) => Number(r.fine || 0) > 0 || Number(r.excellent || 0) > 0);

        const columns: ManualTable['columns'] = [
            { key: 'tree', label: 'Tree' },
            { key: 'where', label: 'Where' },
            { key: 'level', label: 'Level', align: 'right' },
            { key: 'tier', label: 'Hatchet', align: 'right' },
            { key: 'speed', label: 'Chop', align: 'right' },
        ];
        if (graded) {
            columns.push(
                { key: 'poor', label: 'Poor', icon: 'poorItem' },
                { key: 'fineC', label: 'Fine', icon: 'fineItem' },
                { key: 'excC', label: 'Excellent', icon: 'excItem' },
            );
        }
        columns.push({ key: 'xp', label: 'XP', align: 'right' });

        return {
            title: 'Every tree, and what it gives up',
            columns,
            rows: nodes.map((r: any) => {
                const fine = Number(r.fine || 0);
                const exc = Number(r.excellent || 0);
                return {
                    tree: r.tree,
                    where: r.where,
                    level: r.level,
                    tier: r.tier ? `Tier ${r.tier}` : 'Any',
                    speed: `${r.timer}s to ${r.floor}s`,
                    poor: `${Math.max(0, 100 - fine - exc)}%`,
                    poorItem: logFor(r.tree, 'poor'),
                    fineC: `${fine}%`,
                    fineItem: logFor(r.tree, 'fine'),
                    excC: `${exc}%`,
                    excItem: logFor(r.tree, 'excellent'),
                    xp: Number(r.xp).toLocaleString(),
                };
            }),
            note: 'Chop time starts at the first figure on the day you qualify and approaches the second as the level climbs. The grade you get decides what the log can become, so an excellent log is worth carrying further than a poor one.',
        };
    },

    'rocks': async () => {
        const nodes = await db('resource_nodes')
            .join('locations', 'locations.id', 'resource_nodes.location_id')
            .whereRaw('LOWER(resource_nodes.skill) = ?', ['mining'])
            .andWhere('resource_nodes.is_active', true)
            .orderBy(['resource_nodes.required_level', 'resource_nodes.name'])
            .select(
                'resource_nodes.name as rock',
                'locations.name as where',
                'resource_nodes.required_level as level',
                'resource_nodes.required_tool_tier as tier',
                'resource_nodes.base_timer as timer',
                'resource_nodes.min_timer as floor',
                'resource_nodes.xp_reward as xp',
                'resource_nodes.fine_chance as fine',
                'resource_nodes.excellent_chance as excellent',
                'resource_nodes.ore_subtype as ore',
            );

        if (!nodes.length) return null;

        // Granite yields Granite, which is type 'rock', not type 'ore'. Looking
        // only at ores left that column reading a bare lowercase subtype.
        const ores = await db('items')
            .whereIn('type', ['ore', 'rock'])
            .select('name', 'subtype', 'quality');
        // A rock's ore_subtype names the ore found there. The plain ore is the
        // row with no quality set; graded rows exist only where a skill grades.
        const oreFor = (subtype: string | null, quality: string | null): string => {
            if (!subtype) return '';
            const key = String(subtype).toLowerCase();
            const hit = ores.find((o: any) =>
                String(o.subtype).toLowerCase() === key
                && (quality === null ? !o.quality : o.quality === quality));
            return hit ? hit.name : '';
        };

        // Grades are shown when graded ITEMS exist, not when the node happens to
        // carry grade percentages.
        //
        // Mining nodes still hold fine_chance 35 and excellent_chance 5, left
        // over from when mining was modelled on woodcutting. There is no Fine
        // Ambren Ore for them to produce and never has been, so those numbers
        // cannot do anything and printing them told the reader a story about
        // ore grades that does not exist in the game.
        //
        // Woodcutting is unaffected: Poor, Fine and Excellent logs are real
        // items, so trees keep their columns. Add graded ore items later and
        // mining gets them back with no change here.
        const graded = nodes.some((r: any) => oreFor(r.ore, 'fine') || oreFor(r.ore, 'excellent'));

        const columns: ManualTable['columns'] = [
            { key: 'where', label: 'Where' },
            { key: 'yields', label: 'Yields', icon: 'oreItem' },
            { key: 'level', label: 'Level', align: 'right' },
            { key: 'tier', label: 'Pickaxe', align: 'right' },
            { key: 'speed', label: 'Swing', align: 'right' },
        ];
        if (graded) {
            columns.push(
                { key: 'poor', label: 'Poor', icon: 'poorItem' },
                { key: 'fineC', label: 'Fine', icon: 'fineItem' },
                { key: 'excC', label: 'Excellent', icon: 'excItem' },
            );
        }
        columns.push({ key: 'xp', label: 'XP', align: 'right' });

        return {
            title: 'Every rock, and what is in it',
            columns,
            rows: nodes.map((r: any) => {
                const fine = Number(r.fine || 0);
                const exc = Number(r.excellent || 0);
                return {
                    rock: r.rock,
                    where: r.where,
                    level: r.level,
                    tier: r.tier ? `Tier ${r.tier}` : 'Any',
                    speed: `${r.timer}s to ${r.floor}s`,
                    yields: oreFor(r.ore, null) || (r.ore ? `${titleCase(r.ore)} Ore` : 'Stone'),
                    oreItem: oreFor(r.ore, null),
                    poor: `${Math.max(0, 100 - fine - exc)}%`,
                    poorItem: oreFor(r.ore, 'poor'),
                    fineC: `${fine}%`,
                    fineItem: oreFor(r.ore, 'fine'),
                    excC: `${exc}%`,
                    excItem: oreFor(r.ore, 'excellent'),
                    xp: Number(r.xp).toLocaleString(),
                };
            }),
        };
    },

    // A vein is not a thing you go to. You mine granite, and now and then the
    // rock gives up an ore seam at that location, which you may work until it
    // is spent before going back to the granite.
    //
    // Which ore appears is decided by location, not by the rock: mining.ts
    // gathers the ore_subtype of EVERY node at the location and draws from the
    // ones that have a real ore item. Granite has no ore item, so it never
    // yields itself, and Origrund produces ambren while Grundagr produces
    // burgh. That falls out of the data, so nothing here is hardcoded and a
    // third ore added at a third location needs no edit.
    'veins': async () => {
        const nodes = await db('resource_nodes')
            .join('locations', 'locations.id', 'resource_nodes.location_id')
            .whereRaw('LOWER(resource_nodes.skill) = ?', ['mining'])
            .andWhere('resource_nodes.is_active', true)
            .select(
                'resource_nodes.name as rock',
                'resource_nodes.location_id as locId',
                'locations.name as where',
                'resource_nodes.ore_subtype as ore',
                'resource_nodes.required_level as level',
                'resource_nodes.vein_discovery_chance as chance',
                'resource_nodes.min_vein_quantity as minq',
                'resource_nodes.max_vein_quantity as maxq',
            );

        if (!nodes.length) return null;

        const ores = await db('items')
            .where({ type: 'ore' })
            .select('name', 'subtype', 'quality');

        const plain = (subtype: string) =>
            ores.find((o: any) => !o.quality && String(o.subtype).toLowerCase() === String(subtype).toLowerCase());

        // Ores obtainable at a location, by the same rule the game applies.
        const oresAt = new Map<number, string[]>();
        for (const n of nodes) {
            const hit = n.ore && plain(n.ore);
            if (!hit) continue;
            const list = oresAt.get(n.locId) || [];
            if (!list.includes(hit.name)) list.push(hit.name);
            oresAt.set(n.locId, list);
        }

        // Only the rock you actually work can turn one up, which is the one
        // whose own subtype has no ore item behind it.
        const rows: Record<string, string | number>[] = [];
        for (const n of nodes) {
            if (!n.chance || (n.ore && plain(n.ore))) continue;
            for (const oreName of oresAt.get(n.locId) || []) {
                rows.push({
                    where: n.where,
                    rock: n.rock,
                    oreName,
                    level: n.level,
                    chance: `${(Number(n.chance) / 100).toFixed(2)}%`,
                    qty: range(n.minq ?? 0, n.maxq ?? 0),
                });
            }
        }

        if (!rows.length) return null;

        return {
            title: 'Veins, and where they turn up',
            columns: [
                { key: 'where', label: 'Where' },
                { key: 'rock', label: 'While mining' },
                { key: 'oreName', label: 'A vein of', icon: 'oreName' },
                { key: 'chance', label: 'Per swing', align: 'right' },
                { key: 'qty', label: 'Holds', align: 'right' },
            ],
            rows,
            note: 'You cannot go looking for a vein. You mine the granite, and every so often the rock opens onto a seam, which is yours alone until it is announced to the island a short while later. Work it until it is spent, then the granite is still there.',
        };
    },

    // ── Combat (docs/combat-spec.md; Manual pages Melee, Defense,
    // Constitution, Combat and Bestiary) ─────────────────────────────────────
    //
    // The Manual is public, and a creature's drops and its weaknesses are the
    // Bestiary's to tell (decided 2026-10-12), so nothing here reads
    // drop_table_entries or a creature's stance columns. Where and how strong a
    // creature is, the fight menu shows anyway.

    'fighting-spots': async () => {
        const rows = await db('fighting_spots')
            .join('locations', 'locations.id', 'fighting_spots.location_id')
            .join('fighting_spot_creatures', 'fighting_spot_creatures.spot_id', 'fighting_spots.id')
            .join('creatures', 'creatures.id', 'fighting_spot_creatures.creature_id')
            .where('fighting_spots.is_active', true)
            .andWhere('creatures.is_active', true)
            .select('fighting_spots.id', 'fighting_spots.name as spot', 'fighting_spots.kind',
                'locations.name as place', 'locations.region as island', 'creatures.level');
        if (!rows.length) return null;

        const spots = new Map<number, { spot: string; place: string; island: string; kind: string; levels: number[] }>();
        for (const r of rows as any[]) {
            const s = spots.get(r.id) ?? { spot: r.spot, place: r.place, island: r.island || '', kind: r.kind, levels: [] as number[] };
            s.levels.push(Number(r.level));
            spots.set(r.id, s);
        }
        const list = [...spots.values()].sort((a, b) => Math.min(...a.levels) - Math.min(...b.levels));
        const islands = new Set(list.map(s => s.island).filter(Boolean));

        const columns: ManualTable['columns'] = [{ key: 'spot', label: 'Spot' }];
        if (islands.size > 1) columns.push({ key: 'island', label: 'Island' });
        columns.push(
            { key: 'place', label: 'Where' },
            { key: 'levels', label: 'Levels', align: 'right' },
            { key: 'kind', label: 'You fight' },
        );
        return {
            title: 'Where the fighting is',
            columns,
            rows: list.map(s => ({
                spot: s.spot,
                island: s.island,
                place: s.place,
                levels: range(Math.min(...s.levels), Math.max(...s.levels)),
                kind: s.kind === 'chosen' ? 'Whichever you pick' : 'Whatever comes',
            })),
            note: islands.size === 1 ? `All of it on ${[...islands][0]}, for now.` : undefined,
        };
    },

    'creatures': async () => {
        const rows = await db('creatures')
            .join('fighting_spot_creatures', 'fighting_spot_creatures.creature_id', 'creatures.id')
            .join('fighting_spots', 'fighting_spots.id', 'fighting_spot_creatures.spot_id')
            .join('locations', 'locations.id', 'fighting_spots.location_id')
            .where('creatures.is_active', true)
            .andWhere('fighting_spots.is_active', true)
            .orderBy(['creatures.level', 'creatures.name'])
            .select('creatures.id', 'creatures.name', 'creatures.level', 'creatures.xp_per_kill',
                'fighting_spots.name as spot', 'locations.name as place');
        if (!rows.length) return null;

        const byCreature = new Map<number, { name: string; level: number; xp: number; where: string[] }>();
        for (const r of rows as any[]) {
            const c = byCreature.get(r.id) ?? { name: r.name, level: Number(r.level), xp: Number(r.xp_per_kill), where: [] as string[] };
            c.where.push(`${r.spot}, ${r.place}`);
            byCreature.set(r.id, c);
        }
        return {
            title: 'What lives there',
            columns: [
                { key: 'name', label: 'Creature' },
                { key: 'level', label: 'Level', align: 'right' },
                { key: 'where', label: 'Found at' },
                { key: 'xp', label: 'Melee XP a kill', align: 'right' },
            ],
            rows: [...byCreature.values()].map(c => ({ ...c, where: c.where.join('; ') })),
            note: `Defense and Constitution share ${COMBAT.DEFENSIVE_XP_MULTIPLE === 2 ? 'twice' : `${COMBAT.DEFENSIVE_XP_MULTIPLE} times`} the Melee figure between them. What the creature carries and what hurts it, your Bestiary will tell you once you have killed enough of them.`,
        };
    },

    // Every weapon a smith can make, plus the one everybody already owns.
    // Weapons nobody makes come from creatures, and those are the Bestiary's.
    'weapons': async () => {
        const rows = await db('items')
            .whereNotNull('items.weapon_form')
            .whereExists(function () {
                this.select(1).from('recipes').whereRaw('recipes.output_item_name = items.name').andWhere('recipes.is_active', true);
            })
            .orderBy(['items.level_required', 'items.name'])
            .select('items.name', 'items.weapon_form', 'items.damage_type', 'items.level_required', 'items.aim', 'items.power');

        const fists = unarmedWeapon('dual');
        const out = [
            {
                name: UNARMED.name, icon: '', form: 'A pair, or one with a shield', type: cap(UNARMED.damageType),
                level: 1, aim: fists.aim, power: fists.power, swing: `${FORMS.dual.swingSeconds}s`,
            },
            ...(rows as any[]).map(r => ({
                name: r.name,
                icon: r.name,
                form: FORM_LABEL[r.weapon_form as Form] ?? r.weapon_form,
                type: r.damage_type ? cap(r.damage_type) : '',
                level: r.level_required,
                aim: r.aim,
                power: r.power,
                swing: FORMS[r.weapon_form as Form] ? `${FORMS[r.weapon_form as Form].swingSeconds}s` : '',
            })),
        ];
        return {
            title: 'Weapons',
            columns: [
                { key: 'name', label: 'Weapon', icon: 'icon' },
                { key: 'form', label: 'Held in' },
                { key: 'type', label: 'Damage' },
                { key: 'level', label: 'Melee', align: 'right' },
                { key: 'aim', label: 'Aim', align: 'right' },
                { key: 'power', label: 'Power', align: 'right' },
                { key: 'swing', label: 'Swing', align: 'right' },
            ],
            rows: out,
            note: 'Only a one-handed weapon leaves room for a shield. Bare hands are the fallback when nothing is held, and swing as a one-hander if a shield is.',
        };
    },

    'damage-types': async () => ({
        title: 'Pierce, slash and crush',
        columns: [
            { key: 'type', label: 'Damage' },
            { key: 'aim', label: 'Aim, first metal', align: 'right' },
            { key: 'weak', label: 'Against a weakness', align: 'right' },
            { key: 'resist', label: 'Against a hide that shrugs it off', align: 'right' },
        ],
        rows: (Object.keys(TYPE_AIM) as (keyof typeof TYPE_AIM)[]).map(t => ({
            type: cap(t),
            aim: TYPE_AIM[t],
            weak: `+${Math.round((STANCE_MULTIPLIER.weak - 1) * 100)}% damage`,
            resist: `${Math.round((STANCE_MULTIPLIER.resistant - 1) * 100)}% damage`,
        })),
        note: 'The surer the aim, the lighter the blow: each type is weighed so that none of them comes out ahead against a creature that neither fears nor ignores it.',
    }),

    'armour': async () => {
        const rows = await db('items')
            .where('items.armour', '>', 0)
            .whereExists(function () {
                this.select(1).from('recipes').whereRaw('recipes.output_item_name = items.name').andWhere('recipes.is_active', true);
            })
            .orderBy(['items.level_required', 'items.name'])
            .select('items.name', 'items.slot', 'items.level_required', 'items.armour');
        if (!rows.length) return null;
        const SLOT: Record<string, string> = { head: 'Head', chest: 'Body', legs: 'Legs', hands: 'Hands', feet: 'Feet', offhand: 'Shield' };
        return {
            title: 'Armour',
            columns: [
                { key: 'name', label: 'Piece', icon: 'name' },
                { key: 'slot', label: 'Worn on' },
                { key: 'level', label: 'Defense', align: 'right' },
                { key: 'armour', label: 'Armour', align: 'right' },
            ],
            rows: (rows as any[]).map(r => ({ name: r.name, slot: SLOT[r.slot] ?? r.slot, level: r.level_required, armour: r.armour })),
            note: 'One new piece for every level of Defense. A shield needs a one-handed weapon beside it.',
        };
    },

    'constitution-hp': async () => ({
        title: 'Health by Constitution',
        columns: [
            { key: 'level', label: 'Constitution', align: 'right' },
            { key: 'hp', label: 'Health', align: 'right' },
        ],
        rows: RUNGS.map(level => ({ level, hp: maxHp(level) })),
        note: `Every level adds ${COMBAT.HP_PER_CONSTITUTION} health.`,
    }),

    'durability': async () => {
        const rows = await db('durability_tiers').orderBy('tier').select('*');
        if (!rows.length) return null;
        return {
            title: 'How long gear lasts',
            columns: [
                { key: 'tier', label: 'Tier', align: 'right' },
                { key: 'uses', label: 'Lasts at least', align: 'right' },
                { key: 'chance', label: 'Then breaks', align: 'right' },
            ],
            rows: (rows as any[]).map(r => ({
                tier: r.tier,
                uses: `${Number(r.guaranteed_uses).toLocaleString('en-US')} kills`,
                chance: `${Number(r.break_chance_pct)}% a kill`,
            })),
            note: `Your weapon wears with every kill, and ${COMBAT.ARMOUR_PIECES_WORN_PER_KILL} of the armour pieces you have on, picked at random. A few rare pieces last longer than their tier. The count is kept per kind of item rather than per piece, so trading one blade for another of the same make does not start it again; a break does.`,
        };
    },

    'fight-food': async () => {
        const rows = await db('items')
            .where('heal_amount', '>', 0)
            .whereNull('buff_effect')
            .orderBy([{ column: 'heal_amount', order: 'desc' }, 'name'])
            .select('name', 'heal_amount');
        if (!rows.length) return null;
        return {
            title: 'Food that mends',
            columns: [
                { key: 'name', label: 'Food', icon: 'name' },
                { key: 'heal', label: 'Mends', align: 'right' },
            ],
            rows: (rows as any[]).map(r => ({ name: r.name, heal: r.heal_amount })),
            note: 'Dishes that do something else besides, such as a meal that speeds a trade, are not fighting food and mend nothing.',
        };
    },

    'bestiary-steps': async () => ({
        title: 'What the Bestiary tells, and when',
        columns: [
            { key: 'kills', label: 'Kills', align: 'right' },
            { key: 'learn', label: 'You learn' },
        ],
        rows: [
            { kills: BESTIARY_STEPS.found, learn: 'Its name, its look, its level and where it lives.' },
            { kills: BESTIARY_STEPS.stances, learn: 'What it is weak to and what it shrugs off. The fight shows it from then on.' },
            { kills: BESTIARY_STEPS.commonDrops, learn: 'What it usually carries.' },
            { kills: BESTIARY_STEPS.allDrops, learn: 'Everything it carries, the rare things included.' },
            { kills: BESTIARY_STEPS.mastery.toLocaleString('en-US'), learn: 'A line of its story, and the mark of mastery.' },
        ],
        note: 'The chance of any one thing is never written down. You will have a feel for it by then.',
    }),

};
