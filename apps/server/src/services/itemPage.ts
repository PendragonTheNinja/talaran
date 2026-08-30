import db from '../db';
import { codeSources, codeUses } from './itemUsageCode';

// Item pages.
//
// One page per item, assembled on request rather than authored. There are two
// hundred items and there will be more, so a file each was never going to stay
// true; everything here is derived from the same tables the game runs on, which
// means an item's page is correct the moment its data is.
//
// The page answers three questions, in the order a player asks them:
//   what is it        the item row itself
//   where do I get it every source that can produce it
//   what is it for    every use that consumes it
//
// Sources are deliberately exhaustive. An item that appears nowhere in either
// list is worth knowing about too, because it usually means something is
// unfinished rather than that the item is useless.

export interface ItemSource {
    kind: string;          // 'Foraging', 'Recipe', 'Hunting', ...
    from: string;          // habitat, animal, recipe or node name
    where?: string;        // location, when the source has one
    detail?: string;       // odds, quantity, level
    link?: string;         // manual page worth reading next
}

export interface ItemUse {
    kind: string;
    into: string;
    detail?: string;
    link?: string;
}

export interface ItemPage {
    name: string;
    description: string | null;
    type: string;
    subtype: string | null;
    quality: string | null;
    tier: number | null;
    slot: string | null;
    levelRequired: number | null;
    value: number | null;
    sources: ItemSource[];
    uses: ItemUse[];
}

/**
 * What this file reads, declared rather than implied.
 *
 * scripts/auditItemCoverage.ts diffs these two lists against everything in the
 * schema and the services that names an item, and fails when something is not
 * accounted for. That is what stops an item page going quietly wrong the day a
 * new system lands: the audit fails instead of a player finding the hole.
 *
 * Adding a source or use below means adding it here too. If a place is
 * deliberately not surfaced, list it anyway with a note saying why, so the
 * decision is recorded rather than looking like an oversight.
 */
export const COVERED_TABLES: { table: string; column: string; note?: string }[] = [
    { table: 'foraging_habitats', column: 'drop_table' },
    { table: 'huntable_animals', column: 'drop_table' },
    { table: 'animal_species', column: 'slaughter_table' },
    { table: 'animal_species', column: 'product_item_name' },
    { table: 'animal_species', column: 'baby_item_name' },
    { table: 'animal_species', column: 'feed_item_name' },
    { table: 'crops', column: 'produce_item_name' },
    { table: 'recipes', column: 'output_item_name' },
    { table: 'recipes', column: 'inputs' },
    { table: 'bait_values', column: 'item_name' },
    { table: 'drop_table_entries', column: 'item_id' },
    { table: 'merchant_stock', column: 'item_id' },
    { table: 'fish_species', column: 'item_name' },
    { table: 'crops', column: 'seed_item_name' },
    { table: 'trap_targets', column: 'drop_table' },
    { table: 'trap_types', column: 'item_name' },
    { table: 'quests', column: 'reward_items' },
    { table: 'animal_species', column: 'mount_item_name' },
    { table: 'quests', column: 'start_items' },
    {
        table: 'quest_objectives', column: 'target_item',
        note: 'Deliberate. An objective consumes nothing; it checks that you hold something. Surfacing it as a use would read as though the quest destroys the item.',
    },
    {
        table: 'player_foraging_discoveries', column: 'item_name',
        note: 'Deliberate. Per-player progress, not a property of the item. The habitat drop tables already describe where a find comes from.',
    },
];

/**
 * Service files whose hardcoded item names are surfaced by this file.
 * Everything not listed here is reported by the audit as a gap.
 */
export const COVERED_CODE: string[] = [
    'services/itemPage.ts',
    'services/itemUsageCode.ts',
    // Read through itemUsageCode, which imports their constants rather than
    // restating them, so a rename breaks the build instead of a manual page.
    'services/travelEvents.ts',
    'services/goldFinds.ts',
    'services/liquids.ts',
    'services/shops.ts',
    'services/construction.ts',
    'services/smithing.ts',
    'services/carpentry.ts',
    'services/husbandry.ts',
    'services/farming.ts',
    'services/tally.ts',
    'services/tanning.ts',
    'services/hunting.ts',
    // Starter kit for a new character. Not a way to obtain anything, since it
    // happens once and cannot be repeated.
    'services/guest.ts',
    // Reads hunting's HUNT_AMMO to spend and recover arrows. The use is stated
    // on the arrow's page from hunting.ts, so restating it here would double it.
    'services/gameTick.ts',
];

/** JSONB columns arrive as objects from pg and as strings from some drivers. */
function asArray(raw: unknown): any[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * A duration in words. manualQueries.ts has its own copy for the tables; this
 * is the one this file uses, kept local so item pages do not depend on the
 * manual's query layer for something this small.
 */
function seconds(s: number): string {
    if (!s) return 'no time at all';
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const restS = s % 60;
    if (m < 60) return restS ? `${m}m ${restS}s` : `${m}m`;
    const h = Math.floor(m / 60);
    const restM = m % 60;
    if (h < 24) return restM ? `${h}h ${restM}m` : `${h}h`;
    const d = Math.floor(h / 24);
    const restH = h % 24;
    return restH ? `${d}d ${restH}h` : `${d}d`;
}

function range(min: number, max: number): string {
    return min === max ? String(min) : `${min} to ${max}`;
}

function share(weight: number, total: number): string {
    if (!total) return '';
    const pct = (weight / total) * 100;
    return pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
}

const SKILL_PAGE: Record<string, string> = {
    Woodcutting: 'skills/woodcutting',
    Mining: 'skills/mining',
    Fishing: 'skills/fishing',
    Foraging: 'skills/foraging',
    Hunting: 'skills/hunting',
    Carpentry: 'skills/carpentry',
    Smithing: 'skills/smithing',
    Farming: 'skills/farming',
    Husbandry: 'skills/husbandry',
    Crafting: 'skills/crafting',
    Cooking: 'skills/cooking',
};

export async function buildItemPage(itemName: string): Promise<ItemPage | null> {
    const item = await db('items')
        .whereRaw('LOWER(name) = LOWER(?)', [itemName])
        .andWhere('is_active', true)
        .first();

    if (!item) return null;

    const name: string = item.name;
    const sources: ItemSource[] = [];
    const uses: ItemUse[] = [];

    // ── Where it comes from ─────────────────────────────────────────────────

    // Gathered from a node. Logs and ore are named "<Quality> <Subtype> <Kind>",
    // so the node is matched on subtype rather than on the item name.
    if (item.subtype && ['log', 'ore', 'rock'].includes(item.type)) {
        const skill = item.type === 'log' ? 'woodcutting' : 'mining';
        const nodes = await db('resource_nodes')
            .join('locations', 'locations.id', 'resource_nodes.location_id')
            .whereRaw('LOWER(resource_nodes.skill) = ?', [skill])
            .andWhere('resource_nodes.is_active', true)
            .select(
                'resource_nodes.name as node',
                'resource_nodes.ore_subtype as ore',
                'resource_nodes.required_level as level',
                'resource_nodes.fine_chance as fine',
                'resource_nodes.excellent_chance as excellent',
                'locations.name as where',
            );

        for (const n of nodes) {
            const matches = item.type === 'ore' || item.type === 'rock'
                ? String(n.ore || '').toLowerCase() === String(item.subtype).toLowerCase()
                : String(n.node).toLowerCase().includes(String(item.subtype).toLowerCase());
            if (!matches) continue;

            const fine = Number(n.fine || 0);
            const exc = Number(n.excellent || 0);
            const odds = item.quality === 'fine' ? fine
                : item.quality === 'excellent' ? exc
                : item.quality === 'poor' ? Math.max(0, 100 - fine - exc)
                : null;

            sources.push({
                kind: item.type === 'log' ? 'Woodcutting' : 'Mining',
                from: n.node,
                where: n.where,
                detail: [
                    `Level ${n.level}`,
                    odds === null ? '' : `${odds}% of what you get`,
                ].filter(Boolean).join(' · '),
                link: item.type === 'log' ? SKILL_PAGE.Woodcutting : SKILL_PAGE.Mining,
            });
        }
    }

    // Foraged. Weights are per habitat, so the share is worked out per table.
    const habitats = await db('foraging_habitats')
        .join('locations', 'locations.id', 'foraging_habitats.location_id')
        .where('foraging_habitats.is_active', true)
        .select(
            'foraging_habitats.name as habitat',
            'foraging_habitats.required_level as level',
            'foraging_habitats.drop_table as drops',
            'locations.name as where',
        );

    for (const h of habitats) {
        const drops = asArray(h.drops);
        const total = drops.reduce((sum: number, d: any) => sum + (d.weight || 0), 0);
        for (const d of drops) {
            if (String(d.itemName).toLowerCase() !== name.toLowerCase()) continue;
            sources.push({
                kind: 'Foraging',
                from: h.habitat,
                where: h.where,
                detail: [
                    `Level ${h.level}`,
                    share(d.weight || 0, total),
                    range(d.min ?? 1, d.max ?? 1) === '1' ? '' : `${range(d.min ?? 1, d.max ?? 1)} at a time`,
                    d.requiresGloves ? 'Gloves needed' : '',
                    d.season || '',
                ].filter(Boolean).join(' · '),
                link: SKILL_PAGE.Foraging,
            });
        }
    }

    // Hunted, and trapped.
    const hunted = await db('huntable_animals')
        .join('locations', 'locations.id', 'huntable_animals.location_id')
        .where('huntable_animals.is_active', true)
        .select(
            'huntable_animals.name as animal',
            'huntable_animals.required_level as level',
            'huntable_animals.drop_table as drops',
            'locations.name as where',
        );

    for (const a of hunted) {
        for (const d of asArray(a.drops)) {
            if (String(d.itemName).toLowerCase() !== name.toLowerCase()) continue;
            sources.push({
                kind: 'Hunting',
                from: a.animal,
                where: a.where,
                detail: [
                    `Level ${a.level}`,
                    d.chance && d.chance < 100 ? `${d.chance}%` : '',
                    range(d.min ?? 1, d.max ?? 1) === '1' ? '' : range(d.min ?? 1, d.max ?? 1),
                ].filter(Boolean).join(' · '),
                link: SKILL_PAGE.Hunting,
            });
        }
    }

    // Grown, and kept.
    const crops = await db('crops').where('is_active', true).select('*');
    for (const c of crops) {
        if (String(c.produce_item_name).toLowerCase() === name.toLowerCase()) {
            sources.push({
                kind: 'Farming',
                from: c.name,
                detail: `Level ${c.plant_level} · ${c.yield_per_seed} per seed`,
                link: SKILL_PAGE.Farming,
            });
        }
    }

    const animals = await db('animal_species').select('*');
    for (const a of animals) {
        if (String(a.product_item_name || '').toLowerCase() === name.toLowerCase()) {
            sources.push({
                kind: 'Husbandry',
                from: a.name,
                detail: `Level ${a.husbandry_level} · every ${Math.round((a.product_seconds || 0) / 60)} minutes`,
                link: SKILL_PAGE.Husbandry,
            });
        }
        for (const d of asArray(a.slaughter_table)) {
            if (String(d.itemName).toLowerCase() !== name.toLowerCase()) continue;
            sources.push({
                kind: 'Butchering',
                from: a.name,
                detail: [
                    (d.chance ?? 100) >= 100 ? 'Always' : `${d.chance}%`,
                    range(d.min ?? 1, d.max ?? 1) === '1' ? '' : range(d.min ?? 1, d.max ?? 1),
                ].filter(Boolean).join(' · '),
                link: SKILL_PAGE.Husbandry,
            });
        }
    }

    // Made at a bench.
    const recipes = await db('recipes').where('is_active', true).select('*');
    for (const r of recipes) {
        if (String(r.output_item_name).toLowerCase() === name.toLowerCase()) {
            const inputs = asArray(r.inputs)
                .map((i: any) => `${i.qty ?? i.quantity ?? 1} x ${i.itemName ?? i.name}`)
                .join(', ');
            sources.push({
                kind: r.skill,
                from: r.name,
                where: r.station ? r.station.charAt(0).toUpperCase() + r.station.slice(1) : undefined,
                detail: [
                    `Level ${r.required_level}`,
                    inputs ? `From ${inputs}` : '',
                    r.output_qty > 1 ? `Makes ${r.output_qty}` : '',
                ].filter(Boolean).join(' · '),
                link: SKILL_PAGE[r.skill],
            });
        }
    }

    // Caught. fish_species.item_name is the item; name is the species label.
    const fish = await db('fish_species')
        .leftJoin('locations', 'locations.id', 'fish_species.location_id')
        .where('fish_species.is_active', true)
        .whereRaw('LOWER(fish_species.item_name) = LOWER(?)', [name])
        .select(
            'fish_species.name as fish',
            'fish_species.required_level as level',
            'fish_species.bait_category as bait',
            'fish_species.time_window as window',
            'fish_species.seasons as seasons',
            'locations.name as where',
        );

    for (const f of fish) {
        sources.push({
            kind: 'Fishing',
            from: f.fish,
            where: f.where || undefined,
            detail: [
                `Level ${f.level}`,
                f.bait ? `${f.bait} bait` : '',
                f.window || '',
                f.seasons || '',
            ].filter(Boolean).join(' · '),
            link: SKILL_PAGE.Fishing,
        });
    }

    // Trapped. The drop table hangs off the target, which hangs off a trap type.
    const trapped = await db('trap_targets')
        .join('trap_types', 'trap_types.id', 'trap_targets.trap_type_id')
        .leftJoin('locations', 'locations.id', 'trap_targets.location_id')
        .where('trap_targets.is_active', true)
        .select(
            'trap_targets.name as target',
            'trap_targets.drop_table as drops',
            'trap_types.name as trap',
            'trap_types.required_level as level',
            'locations.name as where',
        );

    for (const t of trapped) {
        for (const d of asArray(t.drops)) {
            if (String(d.itemName).toLowerCase() !== name.toLowerCase()) continue;
            sources.push({
                kind: 'Trapping',
                from: `${t.target}, in a ${t.trap}`,
                where: t.where || undefined,
                detail: [
                    `Level ${t.level}`,
                    (d.chance ?? 100) >= 100 ? '' : `${d.chance}%`,
                    range(d.min ?? 1, d.max ?? 1) === '1' ? '' : range(d.min ?? 1, d.max ?? 1),
                ].filter(Boolean).join(' · '),
                link: SKILL_PAGE.Hunting,
            });
        }
    }

    // Given by a quest, on starting it or on finishing it.
    //
    // Start items were left out at first, on the argument that kit handed over
    // to begin a quest is not really a way to obtain something. That was wrong:
    // the Lanai Hunting Bow comes from the Huntsman's Lesson and from nowhere
    // else, so excluding start items made the only source of a real item
    // invisible. Both are listed, and which one it is gets said plainly.
    const quests = await db('quests')
        .where('is_active', true)
        .select('name', 'npc_name', 'reward_items', 'start_items');

    for (const q of quests) {
        const grants: [string, unknown][] = [
            ['On taking it up', q.start_items],
            ['On finishing it', q.reward_items],
        ];
        for (const [when, raw] of grants) {
            for (const r of asArray(raw)) {
                if (String(r.itemName).toLowerCase() !== name.toLowerCase()) continue;
                sources.push({
                    kind: 'Quest',
                    from: q.name,
                    where: q.npc_name || undefined,
                    detail: [when, (r.qty ?? 1) > 1 ? `${r.qty} of them` : ''].filter(Boolean).join(' · '),
                    link: 'reference/quests',
                });
            }
        }
    }

    // Secondary drops. These hang off a source_key rather than a table of their
    // own, and they join items by id, which is why nothing that scans for item
    // NAMES could ever see them. This is where a bird's nest out of a Lanai and
    // rough quartz out of granite actually come from, and none of it was
    // reachable from anywhere in the manual before now.
    const secondary = await db('drop_table_entries')
        .join('items', 'items.id', 'drop_table_entries.item_id')
        .where('drop_table_entries.item_id', item.id)
        .andWhere('drop_table_entries.is_active', true)
        .select(
            'drop_table_entries.source_key as key',
            'drop_table_entries.chance_one_in as oneIn',
            'drop_table_entries.chance_percent as pct',
            'drop_table_entries.min_qty as minq',
            'drop_table_entries.max_qty as maxq',
        );

    for (const d of secondary) {
        // 'woodcutting:lanai' and 'mining:rock:granite' are readable already;
        // they just need the punctuation turning into words.
        const parts = String(d.key).split(':');
        const skill = parts[0];
        const rest = parts.slice(1).filter(p => p !== 'rock' && p !== 'saw');
        const pretty = rest
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');

        const odds = d.pct !== null && d.pct !== undefined
            ? `${d.pct}%`
            : d.oneIn > 1 ? `Around 1 in ${d.oneIn}` : 'Always';

        sources.push({
            kind: skill.charAt(0).toUpperCase() + skill.slice(1),
            from: pretty ? `While working ${pretty}` : 'While working',
            detail: [
                odds,
                range(d.minq ?? 1, d.maxq ?? 1) === '1' ? '' : range(d.minq ?? 1, d.maxq ?? 1),
            ].filter(Boolean).join(' · '),
            link: SKILL_PAGE[skill.charAt(0).toUpperCase() + skill.slice(1)],
        });
    }

    // Bought from a merchant.
    const stocked = await db('merchant_stock')
        .join('merchants', 'merchants.id', 'merchant_stock.merchant_id')
        .leftJoin('locations', 'locations.id', 'merchants.location_id')
        .where('merchant_stock.item_id', item.id)
        .andWhere('merchant_stock.is_active', true)
        .select('merchants.name as merchant', 'locations.name as where');

    for (const m of stocked) {
        sources.push({
            kind: 'Merchant',
            from: m.merchant,
            where: m.where || undefined,
            detail: item.value ? `${item.value} gold` : undefined,
            link: 'systems/the-marketplace',
        });
    }

    // ── What it is for ──────────────────────────────────────────────────────

    for (const r of recipes) {
        const used = asArray(r.inputs).find(
            (i: any) => String(i.itemName ?? i.name).toLowerCase() === name.toLowerCase(),
        );
        if (!used) continue;
        uses.push({
            kind: r.skill,
            into: r.output_item_name,
            detail: `Level ${r.required_level} · needs ${used.qty ?? used.quantity ?? 1}`,
            link: SKILL_PAGE[r.skill],
        });
    }

    for (const a of animals) {
        if (String(a.feed_item_name || '').toLowerCase() === name.toLowerCase()) {
            uses.push({
                kind: 'Husbandry',
                into: `Feeding ${a.name}`,
                detail: `${a.feed_qty} at a time`,
                link: SKILL_PAGE.Husbandry,
            });
        }
    }

    // A seed is the clearest case of an item with a use and no recipe: you
    // plant it. Without this every seed in the game read as good for nothing.
    for (const c of crops) {
        if (String(c.seed_item_name || '').toLowerCase() !== name.toLowerCase()) continue;
        uses.push({
            kind: 'Farming',
            into: c.produce_item_name,
            detail: [
                `Level ${c.plant_level}`,
                `${c.yield_per_seed} per seed`,
                c.is_perennial ? 'Perennial' : '',
            ].filter(Boolean).join(' · '),
            link: SKILL_PAGE.Farming,
        });
    }

    // The trap itself, rather than what comes out of it.
    const trapTypes = await db('trap_types')
        .where('is_active', true)
        .whereRaw('LOWER(item_name) = LOWER(?)', [name])
        .select('name', 'required_level', 'catch_chance');

    for (const t of trapTypes) {
        uses.push({
            kind: 'Trapping',
            into: `Setting a ${t.name}`,
            detail: `Level ${t.required_level}${t.catch_chance ? ` · ${t.catch_chance}% a check` : ''}`,
            link: SKILL_PAGE.Hunting,
        });
    }

    // A young animal's whole purpose is to stop being one. Without this a chick
    // read as an item with no use at all, when raising it is the entire skill:
    // the page now says what it becomes, where it has to live to get there, and
    // what it is worth once grown.
    for (const a2 of animals) {
        if (String(a2.baby_item_name || '').toLowerCase() !== name.toLowerCase()) continue;

        const grown: string[] = [];
        if (a2.product_item_name) {
            grown.push(a2.product_seconds
                ? `${a2.product_item_name} every ${seconds(a2.product_seconds)}`
                : String(a2.product_item_name));
        }
        if (a2.mount_item_name) grown.push(`can be ridden`);

        uses.push({
            kind: 'Husbandry',
            into: `Raising ${a2.name}`,
            detail: [
                `Level ${a2.husbandry_level}`,
                `Kept in a ${a2.pen_type}`,
                `Grown in ${seconds(a2.grow_seconds)}`,
                grown.length ? `Then gives ${grown.join(', ')}` : '',
            ].filter(Boolean).join(' · '),
            link: SKILL_PAGE.Husbandry,
        });
    }

    // A grown animal becomes a mount, which is the whole point of raising some.
    for (const a2 of animals) {
        if (String(a2.mount_item_name || '').toLowerCase() !== name.toLowerCase()) continue;
        sources.push({
            kind: 'Husbandry',
            from: `${a2.name}, grown`,
            detail: [
                `Level ${a2.husbandry_level}`,
                a2.baby_item_name ? `Raised from ${a2.baby_item_name}` : '',
                `Takes ${seconds(a2.grow_seconds)}`,
            ].filter(Boolean).join(' · '),
            link: SKILL_PAGE.Husbandry,
        });
    }

    const bait = await db('bait_values')
        .whereRaw('LOWER(item_name) = LOWER(?)', [name])
        .select('category', 'bait_value');

    for (const b of bait) {
        uses.push({
            kind: 'Bait',
            into: b.category,
            detail: `Worth ${b.bait_value}`,
            link: b.category?.toLowerCase().includes('fish') ? SKILL_PAGE.Fishing : SKILL_PAGE.Hunting,
        });
    }

    // Everything decided in code rather than in a table.
    sources.push(...codeSources(name));
    uses.push(...codeUses(name));

    // Some recipes exist twice: once as a row in `recipes` and once as a
    // constant in a service. Both are real and both are read, so an Ambren Saw
    // listed its forging twice.
    //
    // The two copies agree on the ingredients and the level and disagree on
    // everything cosmetic: the row is named "Ambren Saw" and carries a station,
    // the constant is keyed "ambren_saw" and carries none. So the ingredient
    // list is the signature, and it is the only part worth matching on.
    //
    // Keying on kind and location as well would be wrong in the other
    // direction: the two Granite Rocks at Grundagr and Origrund have identical
    // details and are genuinely two different places to mine, so they must both
    // survive. That is why the recipe rule only applies to entries that list
    // ingredients at all.
    const recipeSeen = new Set<string>();
    const exactSeen = new Set<string>();

    // The two paths word the same recipe differently. A row in `recipes` says
    // "Level 1 · needs 1"; the constant says "Forging ambren_pickaxe · level 1
    // · needs 1". Keying on the wording therefore matched neither, which is why
    // the duplicates survived two attempts at this.
    //
    // They agree on every number, because the numbers are the recipe: the level
    // it takes and the quantities it moves. So the key is the digits, in order,
    // and the prose around them is ignored.
    const numbersIn = (text: string): string => (text.match(/\d+/g) || []).join(',');

    function dedupe<T extends { kind: string; from?: string; into?: string; detail?: string; where?: string }>(
        list: T[],
    ): T[] {
        return list.filter((e) => {
            const detail = (e.detail || '').toLowerCase();

            // Anything quoting ingredients or a quantity is a recipe, and two
            // recipes are the same when they make the same thing out of the
            // same amounts at the same level.
            if (detail.includes('from ') || detail.includes('needs ')) {
                const key = `${e.kind}|${e.into ?? ''}|${numbersIn(detail)}`.toLowerCase();
                if (recipeSeen.has(key)) return false;
                recipeSeen.add(key);
                return true;
            }

            // Everything else only collapses on an exact repeat, so the two
            // Granite Rocks at Grundagr and Origrund both survive: identical
            // details, genuinely different places to mine.
            const key = `${e.kind}|${e.from ?? e.into ?? ''}|${detail}|${e.where ?? ''}`.toLowerCase();
            if (exactSeen.has(key)) return false;
            exactSeen.add(key);
            return true;
        });
    }

    const finalSources = dedupe(sources);
    recipeSeen.clear();
    exactSeen.clear();
    const finalUses = dedupe(uses);

    return {
        name,
        description: item.description || null,
        type: item.type,
        subtype: item.subtype || null,
        quality: item.quality || null,
        tier: item.tier ?? null,
        slot: item.slot || null,
        levelRequired: item.level_required ?? null,
        // stackable is not exposed: everything in Talaran stacks, so the row
        // only ever read "Yes" and took up space saying nothing.
        value: item.value ?? null,
        sources: finalSources,
        uses: finalUses,
    };
}
