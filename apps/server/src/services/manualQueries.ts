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
import { FARM_ESTABLISH_COST, plotCost, HOMESTEAD_TIERS } from './farming';
import { ESTABLISH_COST as SHOP_COST, SHOP_TIERS, CARPENTRY_REQ as SHOP_CARPENTRY_REQ } from './shops';
import { tallyCostForTier, CARPENTRY_REQ as TALLY_CARPENTRY_REQ } from './tally';
import type { ManualTable } from '../routes/manual';
import { FORMS, STANCE_MULTIPLIER, TYPE_AIM, COMBAT, maxHp, unarmedWeapon, UNARMED, type Form } from '../lib/combatMath';
import { RUNGS } from '../lib/tiers';
import { BESTIARY_STEPS } from './bestiary';
import { minutesToFill, pourPerCycle, FILL_CYCLE_SECONDS, RESERVOIR_BASE, RESERVOIR_PER_LEVEL } from './talar';
import { activeXpForSeconds } from './farming';
import { rungOfTier } from '../lib/tiers';
import { cutGradeOf } from '../lib/gemGrades';
import { aidWords, isJewelryAid } from '../lib/jewelry';
import { HAND_HELD_BENCH_TOOLS, PUBLIC_STATIONS, parseRequiredTools } from './workstations';
import { listWords } from '../lib/listWords';
import { spellCostWords, spellCooldownWords, spellIsLive, castXp, type SpellRow } from './spells';

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

// ── Talar (docs/talar-spec.md) ──────────────────────────────────────────────

/** Where the light can be filled, by name: the rift locations. */
async function riftNames(): Promise<string> {
    const rifts = await db('locations').where({ is_rift: true }).orderBy('name').pluck('name');
    return rifts.length ? rifts.join(', ') : 'a rift';
}

/** Where spells are taught: the churches, by name and place. */
async function churchNames(): Promise<string> {
    const rows = await db('churches as c').join('locations as l', 'l.id', 'c.location_id').orderBy('c.name').select('c.name', 'l.name as place');
    return rows.length ? rows.map((r: any) => `${r.name}, ${r.place}`).join('; ') : 'a church';
}

/**
 * Talar's ladder for training-path (routes/manual.ts): its progression is
 * none of nodes, recipes or crops. What a level opens is a stone to fill, a
 * spell to learn, and jewelry to wear.
 */
export async function talarPathRows(): Promise<{ level: number; unlock: string; island: string; where: string; iconName: string; details: string }[]> {
    const [rift, church] = await Promise.all([riftNames(), churchNames()]);
    const gems = await db('items').whereNotNull('talar_per_hour').where({ is_active: true, quality: 'cut' })
        .orderBy([{ column: 'tier' }, { column: 'name' }]).select('name', 'tier', 'talar', 'talar_per_hour', 'quality');
    const spells: SpellRow[] = (await db('spells').where({ is_active: true }).orderBy('talar_level')).filter((sp: SpellRow) => spellIsLive(sp.key));
    // Only the pieces Talar fills; a fighter's ring or charm is worn on Melee.
    const pieces = await db('items').where({ type: 'jewelry', is_active: true }).whereNotNull('jewelry_aid').orderBy('name').select('name', 'tier', 'level_required', 'jewelry_aid');
    return [
        ...gems.map((g: any) => {
            const level = rungOfTier(Number(g.tier) || 1);
            return {
                level, unlock: `Fill ${g.name}`, island: '', where: rift, iconName: g.name,
                details: `${g.talar} Talar in ${minutesToFill(Number(g.talar), Number(g.talar_per_hour), Math.max(0, cutGradeOf(g.quality)))} min · ${activeXpForSeconds(level, FILL_CYCLE_SECONDS)} XP a minute`,
            };
        }),
        ...spells.map(sp => ({
            level: sp.talar_level, unlock: sp.name, island: '', where: church, iconName: sp.name,
            details: `Spell · ${spellCostWords(sp)} · ${spellCooldownWords(sp)}`,
        })),
        ...pieces.map((p: any) => ({
            level: Math.max(1, Number(p.level_required) || 1), unlock: `Wear ${p.name}`, island: '', where: 'Anywhere', iconName: p.name,
            details: isJewelryAid(p.jewelry_aid) ? aidWords(p.jewelry_aid, Number(p.tier) || 1) : '',
        })),
    ];
}

const STATION_WORDS: Record<string, string> = {
    smithing: 'smithy', carpentry: 'carpentry bench', cooking: 'hearth', lapidary: 'lapidary',
    tanning: 'tannery', textile: 'spinning and weaving bench',
}

export const extraQueries: Record<string, QueryHandler> = {
    // What a bench is made of, slot by slot, and what fits each (forum,
    // 2026-11-14: a skill's page said where its bench was but not what was on
    // it). {{data:bench-tools:<station type>}}, e.g. bench-tools:cooking.
    'bench-tools': async (param?: string) => {
        const station = String(param ?? '').trim();
        if (!station) return null;
        const slots = await db('workstation_slot_types').where({ station_type: station })
            .orderBy('display_order').select('slot', 'label', 'accepts_subtype', 'accepts_names', 'is_required', 'wears');
        if (!slots.length) return null;
        const names = (raw: unknown): string[] => {
            try { const v = JSON.parse(String(raw ?? '[]')); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
        };
        const subtypes = slots.map((r: any) => r.accepts_subtype).filter(Boolean);
        const named = slots.flatMap((r: any) => names(r.accepts_names));
        const fits = await db('items').where('is_active', true)
            .where(q => { q.whereIn('subtype', subtypes.length ? subtypes : ['']).orWhereIn('name', named.length ? named : ['']); })
            .orderBy(['tier', 'name']).select('name', 'subtype');
        // Tools a recipe here wants in hand rather than in a slot (the saw).
        const heldNames = new Set<string>();
        for (const r of await db('recipes').where({ station, is_active: true }).select('required_tools')) {
            for (const t of parseRequiredTools(r)) if (t in HAND_HELD_BENCH_TOOLS) heldNames.add(t);
        }
        const where = PUBLIC_STATIONS[station];
        const rows = (slots as any[]).map(r => {
            const accepted = names(r.accepts_names);
            const items = (fits as any[]).filter(i => (r.accepts_subtype && i.subtype === r.accepts_subtype) || accepted.includes(i.name)).map(i => i.name);
            return {
                slot: r.label,
                fits: items.length ? listWords(items, 'or') : 'Nothing made yet',
                needed: r.is_required ? 'Always' : 'When a recipe asks',
                wears: r.wears ? 'Yes' : 'No',
            };
        });
        for (const tool of heldNames) {
            const items: string[] = await db('items').where({ is_active: true, subtype: HAND_HELD_BENCH_TOOLS[tool] }).orderBy(['tier', 'name']).pluck('name');
            rows.push({
                slot: `${tool.charAt(0).toUpperCase()}${tool.slice(1)}, held in hand`,
                fits: items.length ? listWords(items, 'or') : 'Nothing made yet',
                needed: 'When a recipe asks',
                wears: 'At your own bench',
            });
        }
        const benchWord = STATION_WORDS[station] ?? `${station} bench`;
        return {
            title: `The ${benchWord}`,
            columns: [
                { key: 'slot', label: 'Slot' },
                { key: 'fits', label: 'What fits' },
                { key: 'needed', label: 'Needed' },
                { key: 'wears', label: 'Wears out', align: 'right' },
            ],
            rows,
            note: [
                'Set a tool into its slot where you work, and it stays there as part of your bench until you take it out again.',
                (slots as any[]).some(r => r.wears)
                    ? 'A tool that wears breaks in time and stays in its slot, broken, and the bench works at half speed until you fit another.' : '',
                where ? `A public ${benchWord} stands at ${where.location}, kept by ${where.keeper}${where.quest ? ', open to you once you have done the first job asked of you there' : ''}. It lends every tool it has, wears none of them, and works at half speed.` : '',
            ].filter(Boolean).join(' '),
        };
    },


    // ── Talar: the stones, the spells, the jewelry ───────────────────────────

    'talar-gems': async () => {
        const gems = await db('items').whereNotNull('talar_per_hour').where({ is_active: true })
            .orderBy([{ column: 'tier' }, { column: 'talar' }]).select('name', 'tier', 'talar', 'talar_per_hour', 'quality');
        return {
            title: 'Stones the light will fill',
            columns: [
                { key: 'stone', label: 'Stone', icon: 'stone' },
                { key: 'level', label: 'Talar', align: 'right' },
                { key: 'holds', label: 'Holds', align: 'right' },
                { key: 'time', label: 'To fill', align: 'right' },
            ],
            rows: gems.map((g: any) => {
                const grade = Math.max(0, cutGradeOf(g.quality));
                return {
                    stone: g.name,
                    level: rungOfTier(Number(g.tier) || 1),
                    holds: `${g.talar} Talar`,
                    time: seconds(Math.ceil(Number(g.talar) * 100 / pourPerCycle(Number(g.talar_per_hour), grade)) * FILL_CYCLE_SECONDS),
                };
            }),
            note: `Filled at ${await riftNames()}. The reservoir holds ${RESERVOIR_BASE} Talar at level 1 and ${RESERVOIR_PER_LEVEL} more each level.`,
        };
    },

    'spells': async () => {
        const spells: SpellRow[] = (await db('spells').where({ is_active: true }).orderBy([{ column: 'talar_level' }, { column: 'display_order' }]))
            .filter((sp: SpellRow) => spellIsLive(sp.key));
        return {
            title: 'Spells, and what each asks',
            columns: [
                { key: 'spell', label: 'Spell', icon: 'spell' },
                { key: 'level', label: 'Talar', align: 'right' },
                { key: 'cost', label: 'Costs' },
                { key: 'wait', label: 'Cast' },
                { key: 'vigil', label: 'Learned by' },
                { key: 'xp', label: 'XP', align: 'right' },
            ],
            rows: spells.map(sp => ({
                spell: sp.name,
                level: sp.talar_level,
                cost: spellCostWords(sp),
                wait: cap(spellCooldownWords(sp)),
                vigil: [`${sp.vigil_minutes} min vigil`, sp.offering_item_name, sp.writ_item_name].filter(Boolean).join(', '),
                xp: castXp(sp),
            })),
            note: `Taught at ${await churchNames()}.`,
        };
    },

    'jewelry': async () => {
        const pieces = await db('items').where({ type: 'jewelry', is_active: true }).orderBy([{ column: 'subtype', order: 'desc' }, { column: 'name' }])
            .select('name', 'subtype', 'tier', 'jewelry_aid', 'aim', 'power');
        const recipes = await db('recipes').where({ is_active: true }).whereIn('output_item_name', pieces.map((p: any) => p.name))
            .select('output_item_name', 'required_level');
        const makeAt = new Map<string, number>();
        for (const r of recipes) makeAt.set(r.output_item_name, Math.min(makeAt.get(r.output_item_name) ?? Infinity, Number(r.required_level)));
        return {
            title: 'Rings and amulets',
            columns: [
                { key: 'piece', label: 'Piece', icon: 'piece' },
                { key: 'slot', label: 'Worn' },
                { key: 'make', label: 'Crafting', align: 'right' },
                { key: 'does', label: 'Does' },
            ],
            rows: pieces.map((p: any) => ({
                piece: p.name,
                slot: p.subtype === 'ring' ? 'Finger' : 'Neck',
                make: makeAt.get(p.name) ?? '',
                does: isJewelryAid(p.jewelry_aid) ? cap(aidWords(p.jewelry_aid, Number(p.tier) || 1))
                    : Number(p.power) > 0 ? `+${Number(p.power)} power in a fight`
                    : Number(p.aim) > 0 ? `+${Number(p.aim)} aim in a fight` : '',
            })),
            note: 'A piece filled with Talar draws 1 Talar for every 20 actions it helps with, and does nothing while the reservoir is empty. The Keeper\'s Band draws only when it spares your gear a use.',
        };
    },

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

        // Every island has its own shop, homestead, and tally boards (the
        // islands table), so "where" names each island's place.
        const islands = await db('islands').orderBy('display_order').select('name', 'tier', 'homestead_place', 'shop_town');
        for (const isl of islands) {
            scaling(`Tally board (${isl.name})`, `Carpentry ${TALLY_CARPENTRY_REQ}`, `Anywhere on ${isl.name} but its islets`, tallyCostForTier(Number(isl.tier)), null);
        }
        const ports = islands.map((i: any) => i.shop_town).join(' or ');
        const grounds = islands.map((i: any) => i.homestead_place).join(' or ');
        scaling('Shop', `Carpentry ${SHOP_CARPENTRY_REQ}`, ports, SHOP_COST, null);
        for (const [n, t] of Object.entries(SHOP_TIERS)) {
            if (Number(n) < 2) continue;
            scaling(`Shop, tier ${n}, built outright`, `Carpentry ${t.carpentry}`, ports, t.build.cost, null);
            if (t.upgrade) scaling(`Shop, raised to tier ${n}`, `Carpentry ${t.carpentry}`, ports, t.upgrade.cost, null);
        }
        scaling('Homestead', 'Carpentry 1', grounds, FARM_ESTABLISH_COST, null);
        for (const t of HOMESTEAD_TIERS) {
            if (t.tier < 2) continue;
            scaling(`Homestead, tier ${t.tier}, built outright`, `Carpentry ${t.carpentry}`, grounds, t.build.cost, null);
            if (t.upgrade) scaling(`Homestead, raised to tier ${t.tier}`, `Carpentry ${t.carpentry}`, grounds, t.upgrade.cost, null);
        }
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

    // Boats (docs/sailing-spec.md): built in pieces on a slip, Carpentry to
    // build and Wayfaring to sail, read from vessel_types.
    'boats': async () => {
        const boats = await db('vessel_types').where({ is_active: true }).orderBy('tier').select('*');
        if (!boats.length) return null;
        const slips = (await db('locations').where({ has_slip: true }).orderBy('id').pluck('name')) as string[];
        const rows: Record<string, string | number>[] = [];
        for (const b of boats) {
            const pieces = typeof b.pieces === 'string' ? JSON.parse(b.pieces) : (b.pieces || []);
            for (const [i, p] of pieces.entries()) {
                rows.push({
                    boat: i === 0 ? `${b.name} (tier ${b.tier})` : '',
                    asks: i === 0 ? `Carpentry ${b.build_level} to build, Wayfaring ${b.sail_level} to sail` : '',
                    piece: p.name,
                    cost: (p.materials || []).map((m: any) => `${m.qty} x ${m.item}`).join(', '),
                });
            }
        }
        return {
            title: 'Boats, piece by piece',
            columns: [
                { key: 'boat', label: 'Boat' },
                { key: 'asks', label: 'Asks' },
                { key: 'piece', label: 'Piece' },
                { key: 'cost', label: 'Costs' },
            ],
            rows,
            note: `A keel is laid on a slip (${slips.join(', ')}), and the pieces are raised in order. Each building turn sets one to five of a piece's materials, more often five the better the carpenter, and pays Carpentry.`,
        };
    },

    // The islets a voyage lands on, by island, with how often (locations.
    // islet_kind and islet_weight). What each holds is left to be found.
    'islets': async () => {
        const rows = await db('locations as l').leftJoin('islands as i', 'i.name', 'l.region')
            .whereNotNull('l.islet_kind')
            .orderBy([{ column: 'i.display_order' }, { column: 'l.islet_weight', order: 'desc' }, { column: 'l.id' }])
            .select('l.name', 'l.region', 'l.islet_kind', 'l.islet_weight', 'i.tier');
        if (!rows.length) return null;
        const totals = new Map<string, number>();
        for (const r of rows) totals.set(r.region, (totals.get(r.region) ?? 0) + Number(r.islet_weight || 0));
        const boats = await db('vessel_types').where({ is_active: true }).orderBy('tier').select('name', 'tier');
        const boatFor = (tier: number) => boats.find((b: any) => Number(b.tier) >= tier)?.name ?? '';
        const HOW: Record<string, string> = { common: 'Often', seldom: 'Seldom', rare: 'Rarely' };
        return {
            title: 'The islets',
            columns: [
                { key: 'islet', label: 'Islet' },
                { key: 'island', label: 'Off' },
                { key: 'how', label: 'Reached' },
                { key: 'share', label: 'Landings', align: 'right' },
                { key: 'boat', label: 'Boat' },
            ],
            rows: rows.map((r: any) => ({
                islet: r.name,
                island: r.region,
                how: HOW[r.islet_kind] ?? r.islet_kind,
                share: `${Math.round(100 * Number(r.islet_weight || 0) / (totals.get(r.region) || 1))}%`,
                boat: boatFor(Number(r.tier) || 1),
            })),
            note: 'Where a voyage lands is chance, weighted as shown, and never the islet you are leaving. What is on each is for you to find.',
        };
    },

    // A skill's hand tools, every tier (forum, 2026-11-27: the Mining and
    // Woodcutting pages named no pickaxe or hatchet). Which tools a skill's
    // work uses is HAND_TOOLS_BY_ACTION in services/toolWear.ts, the same map
    // that wears them, plus the few carried tools nothing wears; who may hold
    // one is equipGates; who makes it is its recipe; who sells it is the
    // merchants' own stock. Bench tools have bench-tools.
    'tools': async (param?: string) => {
        const skill = (param || '').trim();
        if (!skill) return null;
        const { HAND_TOOLS_BY_ACTION } = await import('./toolWear');
        const { gateSkill } = await import('./equipGates');
        const USE: Record<string, string> = {
            woodcutting: 'Chopping', mining_rock: 'Mining', mining_vein: 'Mining', fishing_rod: 'Casting',
            fishing_net: 'Netting', fishing_cut_bait: 'Cutting bait', hunting: 'Hunting', foraging: 'Foraging',
            sawing: 'Sawing', farm_till: 'Tilling', farm_harvest: 'Cutting grain and flax', farm_harvest_all: 'Cutting grain and flax',
            farm_establish: 'Building', farm_upgrade: 'Building', farm_build_plot: 'Building', shop_establish: 'Building',
            shop_upgrade: 'Building', husbandry_build_pen: 'Building', husbandry_demolish_pen: 'Building',
            guild_build: 'Building', vessel_build: 'Building', cooking_build_hearth: 'Building a hearth',
            husbandry_feed: 'Feeding', husbandry_feed_all: 'Feeding', husbandry_muck: 'Mucking out', husbandry_muck_all: 'Mucking out',
            husbandry_slaughter: 'Butchering', husbandry_slaughter_all: 'Butchering', husbandry_tame: 'Haltering a horse',
            husbandry_collect: 'Milking', husbandry_collect_all: 'Milking',
        };
        // Carried, and never worn down: a bucket holds milk and waters a field,
        // a tinderbox lights a fire.
        const CARRIED: Record<string, [string, string][]> = {
            cooking: [['tinderbox', 'Lighting a fire']],
            farming: [['bucket', 'Tending (carried)']],
            husbandry: [['bucket', 'Carrying milk (carried)']],
        };
        const uses = new Map<string, Set<string>>();
        const note = (sub: string, use: string) => { if (!uses.has(sub)) uses.set(sub, new Set()); uses.get(sub)!.add(use); };
        for (const [action, spec] of Object.entries(HAND_TOOLS_BY_ACTION)) {
            if (spec.skill.toLowerCase() !== skill.toLowerCase()) continue;
            const subs = Array.isArray(spec.tools) ? spec.tools : (spec.can ?? []);
            for (const sub of subs) note(sub, USE[action] ?? action);
        }
        for (const [sub, use] of CARRIED[skill.toLowerCase()] ?? []) note(sub, use);

        // Wayfaring wears its gear rather than working with it: a staff and
        // boots on foot (items.agility_reduction, services/travel.ts), the
        // sailor's set at sea (items.sea_speed_pct), and the mounts. Forum,
        // 2026-11-27: the page listed none of the walking gear.
        const wayfaring = skill.toLowerCase() === 'wayfaring';
        const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
        const useOf = (i: any): string => {
            if (wayfaring) {
                if (i.type === 'mount') return 'Riding';
                if (Number(i.agility_reduction) > 0) return `On foot, ${pct(Number(i.agility_reduction))} quicker`;
                if (Number(i.sea_speed_pct) > 0) return `At sea, ${Number(i.sea_speed_pct)}% quicker`;
            }
            return listWords([...(uses.get(i.subtype) ?? [])]);
        };
        if (!uses.size && !wayfaring) return null;

        const items = await db('items').where({ is_active: true })
            .where(q => {
                if (uses.size) q.whereIn('subtype', [...uses.keys()]);
                if (wayfaring) q.orWhere('agility_reduction', '>', 0).orWhere('sea_speed_pct', '>', 0).orWhere('type', 'mount');
            })
            .whereNot('name', 'like', 'Admin%')
            .orderBy([{ column: 'tier' }, { column: 'name' }])
            .select('name', 'type', 'subtype', 'tier', 'level_required', 'weapon_form', 'armour', 'aim', 'power', 'agility_reduction', 'sea_speed_pct');
        if (!items.length) return null;
        // Where gear no recipe makes comes from: mounts are raised (Husbandry),
        // the sailor's set comes out of the islets' sea chests.
        const raised = new Map<string, number>(
            (await db('animal_species').where({ is_active: true }).whereNotNull('mount_item_name').select('mount_item_name', 'husbandry_level'))
                .map((a: any) => [a.mount_item_name, Number(a.husbandry_level)]));
        const elsewhere = (i: any): string | null =>
            raised.has(i.name) ? `Raised, Husbandry ${raised.get(i.name)}`
            : i.subtype === 'sailors_set' ? 'Found in sea chests'
            : i.type === 'mount' ? 'Given to new arrivals'
            : null;
        const recipes = await db('recipes').where({ is_active: true }).whereIn('output_item_name', items.map((i: any) => i.name))
            .select('output_item_name', 'skill', 'required_level');
        const sold = await db('merchant_stock as s').join('merchants as m', 'm.id', 's.merchant_id').join('items as i', 'i.id', 's.item_id')
            .where({ 's.is_active': true, 'm.sells': true }).whereIn('i.name', items.map((i: any) => i.name))
            .select('i.name', 'm.name as merchant', 's.is_core');
        return {
            title: wayfaring ? "Wayfaring's gear" : `${skill}'s tools`,
            columns: [
                { key: 'tool', label: wayfaring ? 'Gear' : 'Tool', icon: 'tool' },
                { key: 'use', label: wayfaring ? 'Helps' : 'For' },
                { key: 'tier', label: 'Tier', align: 'right' },
                { key: 'wield', label: 'Used from' },
                { key: 'made', label: 'Made by' },
                { key: 'sold', label: 'Sold by' },
            ],
            rows: items.map((i: any) => {
                const gate = gateSkill(i);
                const r = recipes.find((x: any) => x.output_item_name === i.name);
                const sellers = sold.filter((x: any) => x.name === i.name)
                    .map((x: any) => x.is_core ? `${x.merchant}, every day` : x.merchant);
                return {
                    tool: i.name,
                    use: useOf(i),
                    tier: Number(i.tier) || 1,
                    wield: gate && Number(i.level_required) > 1 ? `${gate} ${i.level_required}` : 'Any level',
                    made: r ? `${r.skill} ${r.required_level}` : (elsewhere(i) ?? 'Not made'),
                    sold: sellers.length ? listWords(sellers) : (elsewhere(i) ? 'Not sold' : 'Nobody'),
                };
            }),
            note: wayfaring
                ? 'Gear for the road works only on foot, and its shares add together; the sailor\'s set works only at sea, one share for each piece worn. Riding, your boots are only boots.'
                : 'A tool below the work\'s own tier still does it, more slowly; one above it works a little faster. Tools wear with use and break in time, and every one of them is made by a trade or sold on a shelf, so nobody is ever shut out for want of one.',
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
        const species = await db('animal_species')
            .orderBy(['husbandry_level', 'name'])
            .select('*');
        // What each eats (animal_feeds), a head's worth of each, in Oxford-comma words.
        const feeds = await db('animal_feeds').where({ is_active: true }).orderBy('display_order').select('species_id', 'item_name', 'qty');
        const rows = species.map((r: any) => {
            const own = feeds.filter((f: any) => Number(f.species_id) === Number(r.id)).map((f: any) => `${f.qty} ${f.item_name}`);
            const words = own.length <= 1 ? own[0] : own.length === 2 ? `${own[0]} or ${own[1]}` : `${own.slice(0, -1).join(', ')}, or ${own[own.length - 1]}`;
            return { ...r, feeds: words || null };
        });

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
                // Everything it eats (animal_feeds), a head's worth of each.
                // Bees feed themselves (a NULL feed item, on purpose).
                feed: r.feeds ?? (r.feed_item_name ? `${r.feed_qty} ${r.feed_item_name}` : 'Nothing; it feeds itself'),
                feedItem: r.feed_item_name,
                grow: Number(r.grow_seconds) > 0 ? seconds(r.grow_seconds) : 'Comes grown',
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
        title: 'Pierce, slash, and crush',
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
            { kills: BESTIARY_STEPS.found, learn: 'Its name, its look, its level, and where it lives.' },
            { kills: BESTIARY_STEPS.stances, learn: 'What it is weak to and what it shrugs off. The fight shows it from then on.' },
            { kills: BESTIARY_STEPS.commonDrops, learn: 'What it usually carries.' },
            { kills: BESTIARY_STEPS.allDrops, learn: 'Everything it carries, the rare things included.' },
            { kills: BESTIARY_STEPS.mastery.toLocaleString('en-US'), learn: 'A line of its story, and the mark of mastery.' },
        ],
        note: 'The chance of any one thing is never written down. You will have a feel for it by then.',
    }),

};
