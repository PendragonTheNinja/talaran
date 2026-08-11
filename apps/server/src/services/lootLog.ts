import db from '../db';
import { logger } from '../index';

// The loot log (docs/loot-log-spec.md).
//
// One entry point, recordLoot(), called from a single wrapper around
// action_complete in gameTick. That is deliberate: every previous per-branch
// opt-in in this codebase (the action limiter, scene text) was silently missed
// by the next skill to ship. Anything that emits action_complete is logged,
// including skills that do not exist yet.

export type LootKind = 'item' | 'xp';

/**
 * action_type -> the verb shown in the log.
 *
 * Rod and net are separate entries on purpose: "Fishing at Luxmere" and
 * "Net Fishing at Luxmere" are the comparison a player actually wants.
 * Anything absent falls back to the result's skillName, so a new action type
 * still logs sensibly before anyone remembers to add it here.
 */
const ACTION_LABELS: Record<string, string> = {
    woodcutting: 'Woodcutting',
    mining_rock: 'Mining',
    mining_vein: 'Vein Mining',
    smelting: 'Smelting',
    smithing: 'Smithing',
    kiln_collect: 'Kiln',
    sawing: 'Sawing',
    woodworking: 'Woodworking',
    hunting: 'Hunting',
    foraging: 'Foraging',
    fishing_rod: 'Fishing',
    fishing_net: 'Net Fishing',
    fishing_cut_bait: 'Cutting Bait',
    farm_establish: 'Farmstead Work',
    shop_establish: 'Shop Building',
    farm_build_plot: 'Farmstead Work',
    farm_till: 'Tilling',
    farm_sow: 'Sowing',
    farm_tend: 'Tending',
    farm_manure: 'Manuring',
    farm_harvest: 'Harvesting',
    farm_uproot: 'Uprooting',
    husbandry_build_pen: 'Pen Building',
    husbandry_demolish_pen: 'Pen Building',
    husbandry_feed: 'Feeding',
    husbandry_feed_all: 'Feeding',
    husbandry_muck: 'Mucking Out',
    husbandry_muck_all: 'Mucking Out',
    husbandry_collect: 'Collecting',
    husbandry_collect_all: 'Collecting',
    husbandry_slaughter: 'Slaughtering',
    husbandry_slaughter_all: 'Slaughtering',
    husbandry_tame: 'Taming',
    recipe: 'Crafting',
    traveling: 'Travelling',
};

export interface LootAward {
    /** Item names and counts. Accepts the `drops` array every result already carries. */
    drops?: Array<{ name: string; quantity: number }>;
    /** Canonical multi-skill XP. Cutting bait pays Fishing AND Crafting. */
    xpAwards?: Array<{ skill: string; xp: number }>;
    /** Legacy single-skill shape, used when xpAwards is absent. */
    skillName?: string;
    xpAwarded?: number;
    /** Some results report one item outside `drops`. */
    itemName?: string | null;
    quantity?: number;
}

/** "Fishing at Luxmere". Falls back to the bare verb where there is no location. */
export async function buildSourceLabel(
    playerId: number, actionType: string, locationId: number | null, skillName?: string,
): Promise<string> {
    const verb = ACTION_LABELS[actionType] || skillName || 'Adventuring';

    // Farming and husbandry never stamp location_id on their action rows, so
    // without this fallback every farmstead job would log as a bare verb with no
    // place attached, while every other skill carried one.
    let id = locationId;
    if (!id) {
        const player = await db('players').where({ id: playerId }).select('current_location_id').first();
        id = player?.current_location_id ?? null;
    }
    if (!id) return verb;

    const location = await db('locations').where({ id }).select('name').first();
    return location?.name ? `${verb} at ${location.name}` : verb;
}

/**
 * Fold one completed action into the log.
 *
 * Never throws into the caller: a logging failure must not cost a player their
 * catch. Everything is caught and reported, and the action still resolves.
 */
export async function recordLoot(
    playerId: number,
    actionType: string,
    locationId: number | null,
    award: LootAward,
): Promise<void> {
    try {
        // Normalise the two XP shapes into one.
        const xpAwards = award.xpAwards?.length
            ? award.xpAwards
            : (award.skillName && award.xpAwarded)
                ? [{ skill: award.skillName, xp: award.xpAwarded }]
                : [];

        // Merge `itemName` into drops without double counting: several results
        // report their headline item BOTH ways.
        const drops = new Map<string, number>();
        for (const d of award.drops || []) {
            if (!d?.name || !d.quantity) continue;
            drops.set(d.name, (drops.get(d.name) || 0) + d.quantity);
        }
        if (award.itemName && !(award.drops || []).some((d) => d.name === award.itemName)) {
            drops.set(award.itemName, (drops.get(award.itemName) || 0) + (award.quantity || 1));
        }

        const meaningfulXp = xpAwards.filter((a) => a.skill && a.xp > 0);
        // An action that produced nothing still counts as an action: a run of
        // failed hunts or snapped lines is information, and hiding it would make
        // the per-action rates lie.
        const label = await buildSourceLabel(playerId, actionType, locationId, xpAwards[0]?.skill);
        const now = new Date();

        await db.transaction(async (trx) => {
            let source = await trx('loot_log_sources')
                .where({ player_id: playerId, source: label }).forUpdate().first();

            if (!source) {
                const [inserted] = await trx('loot_log_sources')
                    .insert({ player_id: playerId, source: label, actions: 1, first_at: now, last_at: now })
                    .returning('*');
                source = inserted;
            } else {
                await trx('loot_log_sources').where({ id: source.id })
                    .update({ actions: Number(source.actions) + 1, last_at: now });
            }

            const bump = async (kind: LootKind, name: string, amount: number) => {
                const existing = await trx('loot_log_entries')
                    .where({ source_id: source.id, kind, name }).forUpdate().first();
                if (existing) {
                    await trx('loot_log_entries').where({ id: existing.id })
                        .update({ amount: Number(existing.amount) + amount, last_at: now });
                } else {
                    await trx('loot_log_entries').insert({
                        source_id: source.id, kind, name, amount, first_at: now, last_at: now,
                    });
                }
            };

            for (const [name, quantity] of drops) await bump('item', name, quantity);
            for (const a of meaningfulXp) await bump('xp', a.skill, a.xp);
        });
    } catch (err) {
        // Deliberately swallowed. The player's action has already succeeded by
        // the time this runs, and losing a log row is far better than losing it.
        logger.error(`recordLoot failed for player ${playerId} (${actionType}): ${err}`);
    }
}

export interface LootLogEntry {
    kind: LootKind;
    name: string;
    amount: number;
    lastAt: string;
    /**
     * Base worth of this line: items.value multiplied by the amount gathered.
     * Null for xp rows, and null for items with no derived value, so an
     * unpriced item reads as "unknown" rather than as free.
     */
    value: number | null;
}

export interface LootLogSource {
    source: string;
    actions: number;
    firstAt: string;
    lastAt: string;
    items: LootLogEntry[];
    xp: LootLogEntry[];
    totalValue: number | null;
}

export async function getLootLog(playerId: number): Promise<{
    sources: LootLogSource[];
    totals: { items: number; xp: Array<{ skill: string; xp: number }>; value: number | null };
    since: string | null;
}> {
    const sources = await db('loot_log_sources')
        .where({ player_id: playerId })
        .orderBy('last_at', 'desc');

    const player = await db('players').where({ id: playerId }).select('loot_reset_at').first();

    if (sources.length === 0) {
        return {
            sources: [],
            totals: { items: 0, xp: [], value: null },
            since: player?.loot_reset_at ? new Date(player.loot_reset_at).toISOString() : null,
        };
    }

    const entries = await db('loot_log_entries')
        .whereIn('source_id', sources.map((s) => s.id))
        .orderBy('amount', 'desc');

    const bySource = new Map<number, any[]>();
    for (const e of entries) {
        if (!bySource.has(e.source_id)) bySource.set(e.source_id, []);
        bySource.get(e.source_id)!.push(e);
    }

    // Entries store the item NAME, so that is what we price on. One query for
    // the whole log rather than one per line.
    //
    // This is BASE VALUE, the peg, not what any merchant would hand over. A
    // pawnbroker pays 35% of it and a player shop will land somewhere near it,
    // so it is the neutral measure of a haul rather than a quote.
    const itemNames = [...new Set(entries.filter((e) => e.kind === 'item').map((e) => e.name))];
    const valueByName = new Map<string, number>();
    if (itemNames.length > 0) {
        const priced = await db('items').whereIn('name', itemNames).whereNotNull('value').select('name', 'value');
        for (const row of priced) valueByName.set(row.name, Number(row.value));
    }

    const shaped: LootLogSource[] = sources.map((s) => {
        const mine = bySource.get(s.id) || [];
        const toEntry = (e: any): LootLogEntry => {
            const amount = Number(e.amount);
            const unit = e.kind === 'item' ? valueByName.get(e.name) : undefined;
            return {
                kind: e.kind,
                name: e.name,
                amount,
                lastAt: new Date(e.last_at).toISOString(),
                value: unit === undefined ? null : unit * amount,
            };
        };

        const items = mine.filter((e) => e.kind === 'item').map(toEntry);

        // Unpriced lines are skipped rather than counted as zero, so a total is
        // never quietly wrong. A source with nothing priced reports null.
        const priced = items.filter((i) => i.value !== null);

        return {
            source: s.source,
            actions: Number(s.actions),
            firstAt: new Date(s.first_at).toISOString(),
            lastAt: new Date(s.last_at).toISOString(),
            items,
            xp: mine.filter((e) => e.kind === 'xp').map(toEntry),
            totalValue: priced.length > 0 ? priced.reduce((sum, i) => sum + (i.value ?? 0), 0) : null,
        };
    });

    const totalItems = shaped.reduce(
        (sum, s) => sum + s.items.reduce((n, i) => n + i.amount, 0), 0,
    );
    const xpBySkill = new Map<string, number>();
    for (const s of shaped) {
        for (const x of s.xp) xpBySkill.set(x.name, (xpBySkill.get(x.name) || 0) + x.amount);
    }

    // The earliest activity is the honest start when the player has never
    // cleared, since loot_reset_at is null until the first clear.
    const earliest = shaped.reduce<string | null>(
        (min, s) => (!min || s.firstAt < min ? s.firstAt : min), null,
    );

    return {
        sources: shaped,
        totals: {
            items: totalItems,
            xp: [...xpBySkill.entries()]
                .map(([skill, xp]) => ({ skill, xp }))
                .sort((a, b) => b.xp - a.xp),
            value: shaped.some((s) => s.totalValue !== null)
                ? shaped.reduce((sum, s) => sum + (s.totalValue ?? 0), 0)
                : null,
        },
        since: player?.loot_reset_at
            ? new Date(player.loot_reset_at).toISOString()
            : earliest,
    };
}

/** Wipe the log. Entries cascade from sources. */
export async function clearLootLog(playerId: number, source?: string): Promise<void> {
    if (source) {
        await db('loot_log_sources').where({ player_id: playerId, source }).delete();
        return;
    }
    await db('loot_log_sources').where({ player_id: playerId }).delete();
    await db('players').where({ id: playerId }).update({ loot_reset_at: new Date() });
}
