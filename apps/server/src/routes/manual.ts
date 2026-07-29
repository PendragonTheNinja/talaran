import { Router, Request, Response } from 'express';
import db from '../db';
import { logger } from '../lib/logger';
import { xpForLevel } from '../services/xp';
import { plotCost, plotCapForLevel, FARMSTEAD_TOWN } from '../services/farming';

// The Manual's dynamic data blocks (docs/manual-spec.md §4).
//
// Manual prose is authored markdown served as a static asset. Numbers are NOT —
// they are read live from the same tables the game executes against, so a recipe
// added through the admin Content tab is correct in the manual before anyone
// writes a word about it.
//
// Content can only invoke queries registered here. A directive never carries a
// table name or SQL — it carries a registry key. Unknown key = 404.
//
// PUBLIC: no requireAuth. The manual page must render logged out.

const router = Router();

// ── response shape ──────────────────────────────────────────────────────────
// Every query returns this, so the client renders any block generically and new
// queries need zero client work.
export interface ManualTable {
    title: string;
    columns: {
        key: string;
        label: string;
        align?: 'left' | 'right';
        /**
         * Row key holding an ITEM NAME to draw an icon from. The display text and
         * the icon source differ often enough to need separating: a recipe is
         * called "Tie Snare" but produces a "Snare". The client resolves the image
         * by name and hides it silently when there is no art yet, so a missing
         * icon costs nothing.
         */
        icon?: string;
    }[];
    rows: Record<string, string | number>[];
    note?: string;
    /** Item name for an icon beside the table's own title. */
    icon?: string;
}

// ── cache ───────────────────────────────────────────────────────────────────
// This data changes on content edits, not per request.
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; data: ManualTable }>();

function cached(key: string): ManualTable | null {
    const hit = cache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > TTL_MS) {
        cache.delete(key);
        return null;
    }
    return hit.data;
}

/** Clear the manual cache. Call after bulk content edits if you want it instant. */
export function clearManualCache(): void {
    cache.clear();
}

// ── helpers ─────────────────────────────────────────────────────────────────
function fmtSeconds(s: number): string {
    if (s < 60) return `${s}s`;

    const m = Math.floor(s / 60);
    const rem = s % 60;
    if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;

    const h = Math.floor(m / 60);
    const mins = m % 60;
    // "4h", not "4h 0m".
    return mins ? `${h}h ${mins}m` : `${h}h`;
}

function fmtNumber(n: number): string {
    return n.toLocaleString('en-US');
}

// ── Where recipe work happens ───────────────────────────────────────────────
//
// Recipe work is town-locked. The gate lives in the client: LocationPanel opens a
// craft submenu only in that craft's town, so nowhere else offers the work.
//
//   Emberra  → Forge       → Smithing
//   Verdale  → Workshop    → Carpentry
//   Caliwen  → Craftworks  → Crafting (tanning included)
//   Novita   → Farmstead   → Farming
//
// Those four cover every row in `recipes`; no recipe is gated by any other skill.
// `recipes.station` is NOT the gate — it governs the public-bench timer penalty
// (the legacy `usingBlacksmith ? timer * 2 : timer`), which is why a station can
// be null on work that is still town-locked.
//
// Note that setupWorkstation() itself does not check location, so the server
// would accept a workstation raised anywhere. Unreachable through the UI, but it
// means the town lock is enforced by content rather than by code.
const RECIPE_TOWNS: Record<string, string> = {
    smithing: 'Emberra',
    carpentry: 'Verdale',
    crafting: 'Caliwen',
    farming: FARMSTEAD_TOWN,
};

/** The town a skill's recipe work belongs to, or null if the skill has none. */
function recipeTown(skill: string): string | null {
    return RECIPE_TOWNS[skill.toLowerCase()] ?? null;
}

// ── registry ────────────────────────────────────────────────────────────────
type QueryHandler = (param: string | undefined) => Promise<ManualTable>;

const registry: Record<string, QueryHandler> = {
    /**
     * Everything a skill unlocks, by level: gathering nodes and craft recipes in
     * one ladder. Gathering skills live in resource_nodes, crafting skills in the
     * unified recipes table, and several skills have both.
     */
    'training-path': async (param) => {
        const skill = (param || '').trim();
        if (!skill) throw new Error('training-path requires a skill');

        const nodes = await db('resource_nodes')
            .leftJoin('locations', 'resource_nodes.location_id', 'locations.id')
            .whereRaw('LOWER(resource_nodes.skill) = ?', [skill.toLowerCase()])
            .where('resource_nodes.is_active', true)
            .select(
                'resource_nodes.name',
                'resource_nodes.required_level',
                'resource_nodes.base_timer',
                'resource_nodes.xp_reward',
                'locations.name as location_name',
                'locations.region as island',
            );

        const recipes = await db('recipes')
            .whereRaw('LOWER(skill) = ?', [skill.toLowerCase()])
            .where('is_active', true)
            .select(
                'name',
                'required_level',
                'output_item_name',
                'output_qty',
                'timer_seconds',
                'xp',
                'station',
            );

        // Farming's real progression is neither a node nor a recipe: what you can
        // sow at what level lives in its own table, so without this the Farming
        // page showed only the grain and flax processing recipes.
        const crops = skill.toLowerCase() === 'farming'
            ? await db('crops').where({ is_active: true }).select(
                'name',
                'produce_item_name',
                'plant_level',
                'grow_seconds',
                'yield_per_seed',
                'xp_per_seed',
                'soil_effect',
                'is_perennial',
                'regrow_seconds',
                'region',
                'grows_anywhere',
            )
            : [];

        const rows = [
            ...crops.map((c) => {
                const notes = [
                    `Sow · ${fmtSeconds(c.grow_seconds)} to grow`,
                    `${c.yield_per_seed} per seed`,
                    `${c.xp_per_seed} XP`,
                ];
                if (c.soil_effect === 'restore') notes.push('restores soil');
                else if (c.soil_effect === 'neutral') notes.push('leaves soil be');
                if (c.is_perennial) {
                    notes.push(c.regrow_seconds
                        ? `regrows in ${fmtSeconds(c.regrow_seconds)}`
                        : 'perennial');
                }

                return {
                    level: c.plant_level,
                    unlock: c.name,
                    // grows_anywhere crops ignore the island lock, so they belong
                    // to no island in particular.
                    island: c.grows_anywhere ? '' : (c.region || ''),
                    where: FARMSTEAD_TOWN,
                    iconName: c.produce_item_name,
                    details: notes.join(' · '),
                };
            }),
            ...nodes.map((n) => ({
                level: n.required_level,
                unlock: n.name,
                // Islands are locations.region. Recipes have a station but no place,
                // so they belong to no island in particular and stay blank.
                island: n.island || '',
                where: n.location_name || 'Unknown',
                iconName: n.name,
                details: `Gather · ${fmtSeconds(n.base_timer)} · ${n.xp_reward} XP`,
            })),
            ...recipes.map((r) => ({
                level: r.required_level,
                unlock: r.name,
                island: '',
                // Falls back to the station only while a skill's town is unfilled,
                // so an unmapped skill degrades to old behaviour rather than lying.
                where: recipeTown(skill) || 'Unknown',
                iconName: r.output_item_name,
                details:
                    `Make ${r.output_qty > 1 ? `${r.output_qty}× ` : ''}${r.output_item_name}`
                    + ` · ${fmtSeconds(r.timer_seconds)} · ${r.xp} XP`,
            })),
        ].sort((a, b) => a.level - b.level || String(a.unlock).localeCompare(String(b.unlock)));

        // Talaran is the world; Taiar Island is only its first island. The island
        // column appears on its own once a skill actually spans more than one, so
        // these tables stay honest as content grows without needing an edit here.
        const islands = new Set(rows.map((r) => r.island).filter(Boolean));

        const columns: ManualTable['columns'] = [
            { key: 'level', label: 'Level', align: 'right' },
            { key: 'unlock', label: 'Unlocks', icon: 'iconName' },
        ];
        if (islands.size > 1) columns.push({ key: 'island', label: 'Island' });
        columns.push({ key: 'where', label: 'Where' }, { key: 'details', label: 'Details' });

        return {
            title: `${skill}: what opens, and when`,
            columns,
            rows,
            note: islands.size === 1
                ? `All of it on ${[...islands][0]}, for now.`
                : undefined,
        };
    },

    /**
     * The XP ladder. Read from the live formula in services/xp.ts rather than a
     * stored table — adjusting the curve never needs a migration, and this block
     * follows it automatically.
     */
    'xp-curve': async () => {
        const levels = [2, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100];
        const rows = levels.map((lvl) => ({
            level: lvl,
            step: fmtNumber(xpForLevel(lvl) - xpForLevel(lvl - 1)),
            total: fmtNumber(xpForLevel(lvl)),
        }));

        return {
            title: 'The cost of a level',
            columns: [
                { key: 'level', label: 'Level', align: 'right' },
                { key: 'step', label: 'XP for this level', align: 'right' },
                { key: 'total', label: 'XP from the start', align: 'right' },
            ],
            rows,
            note: 'Every skill uses this same ladder. Only the earning rate differs.',
        };
    },

    /**
     * Field costs at a farmstead. Escalates per plot; the cap is gated on Farming
     * level. Both read from the constants in services/farming.ts.
     */
    'plot-costs': async () => {
        const rows = [];
        for (let plot = 1; plot <= 10; plot++) {
            const cost = plotCost(plot);
            // Lowest Farming level at which this plot number is permitted.
            let need = 0;
            while (plotCapForLevel(need) < plot && need < 200) need++;

            rows.push({
                plot,
                level: need <= 1 ? 1 : need,
                cost: cost.map((c) => `${c.qty}× ${c.itemName}`).join(', '),
            });
        }

        return {
            title: 'Enclosing a field',
            columns: [
                { key: 'plot', label: 'Field', align: 'right' },
                { key: 'level', label: 'Farming', align: 'right' },
                { key: 'cost', label: 'Materials' },
            ],
            rows,
            note: 'Each field takes three minutes to fence, and the twentieth is the last.',
        };
    },

    /**
     * Every quest currently in the world, with who gives it and where. This is the
     * catalogue, not any player's progress; nothing here is per-player.
     */
    quests: async (param) => {
        const skill = (param || '').trim();

        let q = db('quests')
            .leftJoin('locations', 'quests.location_id', 'locations.id')
            .where('quests.is_active', true);

        if (skill) q = q.whereRaw('LOWER(quests.skill) = ?', [skill.toLowerCase()]);

        const quests = await q.select(
            'quests.id',
            'quests.name',
            'quests.skill',
            'quests.npc_name',
            'quests.description',
            'locations.name as location_name',
            'locations.region as island',
        );

        const counts = await db('quest_objectives')
            .whereIn('quest_id', quests.map((x) => x.id))
            .select('quest_id')
            .count('* as steps')
            .groupBy('quest_id');

        const stepsBy = new Map(counts.map((c: any) => [c.quest_id, Number(c.steps)]));

        const rows = quests
            .map((x) => ({
                quest: x.name,
                skill: x.skill,
                island: x.island || '',
                from: x.location_name ? `${x.npc_name}, at ${x.location_name}` : x.npc_name,
                steps: stepsBy.get(x.id) ?? 0,
            }))
            .sort((a, b) =>
                String(a.skill).localeCompare(String(b.skill))
                || String(a.quest).localeCompare(String(b.quest)));

        // Same island rule as training-path: the column earns its place only once
        // quests actually span more than one.
        const islands = new Set(rows.map((r) => r.island).filter(Boolean));

        const columns: ManualTable['columns'] = [
            { key: 'quest', label: 'Quest' },
            { key: 'skill', label: 'Teaches' },
        ];
        if (islands.size > 1) columns.push({ key: 'island', label: 'Island' });
        columns.push(
            { key: 'from', label: 'Ask' },
            { key: 'steps', label: 'Steps', align: 'right' },
        );

        return {
            title: skill ? `${skill} quests` : 'Every quest in Talaran',
            columns,
            rows,
            note: 'None of these appear until the person offering them has spoken to you.',
        };
    },

    /** A single item's particulars, for pages that discuss specific gear. */
    'item-stats': async (param) => {
        const name = (param || '').trim();
        if (!name) throw new Error('item-stats requires an item name');

        const item = await db('items').whereRaw('LOWER(name) = ?', [name.toLowerCase()]).first();
        if (!item) return { title: name, columns: [], rows: [] };

        const rows: Record<string, string | number>[] = [
            { field: 'Type', value: item.subtype ? `${item.type} (${item.subtype})` : item.type },
            { field: 'Tier', value: item.tier ?? '—' },
            { field: 'Worn', value: item.slot || 'Carried, not worn' },
            { field: 'Level required', value: item.level_required ?? 1 },
        ];

        if (item.travel_speed_modifier && Number(item.travel_speed_modifier) !== 1) {
            rows.push({
                field: 'Travel',
                value: `×${item.travel_speed_modifier} journey time`,
            });
        }
        if (item.agility_reduction) {
            rows.push({
                field: 'On foot',
                value: `−${Math.round(Number(item.agility_reduction) * 100)}% journey time`,
            });
        }

        return {
            title: item.name,
            icon: item.name,
            columns: [
                { key: 'field', label: '' },
                { key: 'value', label: '' },
            ],
            rows,
        };
    },
};

// ── route ───────────────────────────────────────────────────────────────────
// Express 5 / path-to-regexp v8 removed the ":param?" optional syntax, so the
// two shapes are registered separately against one handler. This also works on
// Express 4, unlike v8's "{/:param}" brace form.
const handleData = async (req: Request, res: Response): Promise<void> => {
    const { query, param } = req.params as { query: string; param?: string };

    const handler = registry[query];
    if (!handler) {
        res.status(404).json({ error: `Unknown manual query "${query}".` });
        return;
    }

    const key = `${query}:${param || ''}`;
    const hit = cached(key);
    if (hit) {
        res.json(hit);
        return;
    }

    try {
        const data = await handler(param);
        cache.set(key, { at: Date.now(), data });
        res.json(data);
    } catch (err) {
        logger.error(`Manual data error (${key}): ${err}`);
        res.status(500).json({ error: 'Could not read that from the ledger.' });
    }
};

router.get('/data/:query', handleData);
router.get('/data/:query/:param', handleData);

// ── Live overrides ──────────────────────────────────────────────────────────
// manual_pages shadows the markdown files. Public and unauthenticated, like the
// rest of this router: the manual must render logged out.

/** Published overrides, without content, so the client can merge the manifest. */
router.get('/pages', async (_req: Request, res: Response) => {
    try {
        const pages = await db('manual_pages')
            .where({ is_published: true })
            .select('section', 'slug', 'title', 'blurb', 'sort_order')
            .orderBy('sort_order', 'asc');

        res.json({ pages });
    } catch (err) {
        logger.error(`Manual pages error: ${err}`);
        // A failure here must not take the manual down; the client falls back
        // to the shipped manifest on its own.
        res.json({ pages: [] });
    }
});

/** One page's overridden content. 404 means "use the file", not "error". */
router.get('/page/:section/:slug', async (req: Request, res: Response) => {
    const { section, slug } = req.params as { section: string; slug: string };

    try {
        const page = await db('manual_pages')
            .where({ section, slug, is_published: true })
            .first();

        if (!page) {
            res.status(404).json({ error: 'No override for that page.' });
            return;
        }

        res.json({ content: page.content });
    } catch (err) {
        logger.error(`Manual page error (${section}/${slug}): ${err}`);
        res.status(404).json({ error: 'No override for that page.' });
    }
});

/** The registry keys, so the client can validate directives without guessing. */
router.get('/queries', (_req: Request, res: Response) => {
    res.json({ queries: Object.keys(registry) });
});

export default router;
