import db from '../db';
import { logger } from '../index';
import { levelFromXp } from './xp';
import { incrementStats } from './stats';

// Foraging (docs/foraging-spec.md). A habitat is a gatherable patch; each cycle
// is a WEIGHTED PICK of one find from its drop_table. Gloves gate the prickly
// rows; the basket nudges yield; the knife shortens the timer. Discovery of each
// item is recorded per player+habitat to drive the "??? until found" tooltip.

export interface ForageDropEntry {
    itemName: string;
    weight: number;
    min: number;
    max: number;
    xp: number;
    requiresGloves?: boolean;
    notable?: boolean;
    season?: string | null;   // null/absent = year-round. The seam — unused for now.
}

export interface ForageResult {
    success: boolean;
    error?: string;
    itemName?: string;
    quantity?: number;
    xp?: number;
    notable?: boolean;
    firstDiscovery?: boolean;
}

function parseTable(raw: unknown): ForageDropEntry[] {
    if (Array.isArray(raw)) return raw as ForageDropEntry[];
    if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
    return [];
}

function randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weightedPick(entries: ForageDropEntry[]): ForageDropEntry {
    const total = entries.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * total;
    for (const e of entries) { r -= e.weight; if (r <= 0) return e; }
    return entries[entries.length - 1];
}

// Timer: eases from base toward min as the player out-levels the habitat, then
// the knife shaves a little more (5%/tier, capped at 50%). Floor of 1s.
export function calculateForageTimer(
    base: number, min: number, playerLevel: number, requiredLevel: number, knifeTier: number
): number {
    const levelsIn = Math.max(0, playerLevel - requiredLevel);
    let t = base - levelsIn * 0.1;
    t = Math.max(min, t);
    if (knifeTier > 0) t = t * (1 - Math.min(0.5, knifeTier * 0.05));
    return Math.max(1, Math.round(t));
}

// Foraging tools must be EQUIPPED, the same as the woodcutting hatchet — each in
// its own slot, so knife, gloves, and basket can all be worn together.
const TOOL_SLOT_COLUMN: Record<string, string> = {
    foraging_knife: 'mainhand_item_id',
    foraging_gloves: 'hands_item_id',
    foraging_basket: 'offhand_item_id',
};

export async function bestToolTier(playerId: number, subtype: string): Promise<number> {
    const column = TOOL_SLOT_COLUMN[subtype];
    if (!column) return 0;
    const equipment = await db('player_equipment').where({ player_id: playerId }).first();
    const itemId = equipment?.[column];
    if (!itemId) return 0;
    const item = await db('items').where({ id: itemId, subtype }).first();
    return item?.tier ? Number(item.tier) : 0;
}

async function playerLevelFor(playerId: number, skillName: string): Promise<number> {
    const skill = await db('skills').where({ name: skillName }).first();
    if (!skill) return 1;
    const ps = await db('player_skills').where({ player_id: playerId, skill_id: skill.id }).first();
    return ps ? levelFromXp(ps.xp) : 1;
}

// Habitats at a location, with per-player unlock + discovery state for the UI.
export async function getForagingHabitats(playerId: number, locationId: number) {
    const level = await playerLevelFor(playerId, 'Foraging');
    const habitats = await db('foraging_habitats')
        .where({ location_id: locationId, is_active: true })
        .orderBy('display_order', 'asc');

    const discoveries = await db('player_foraging_discoveries').where({ player_id: playerId });
    const knifeTier = await bestToolTier(playerId, 'foraging_knife');
    const hasGloves = (await bestToolTier(playerId, 'foraging_gloves')) > 0;
    const hasBasket = (await bestToolTier(playerId, 'foraging_basket')) > 0;

    const result = habitats.map(h => {
        const table = parseTable(h.drop_table);
        const found = new Set(
            discoveries.filter(d => d.habitat_id === h.id).map(d => d.item_name)
        );
        const items = table.map(e => {
            const discovered = found.has(e.itemName);
            return {
                name: discovered ? e.itemName : null,   // null → client renders "???"
                discovered,
                requiresGloves: !!e.requiresGloves,
                notable: !!e.notable,
            };
        });
        return {
            id: h.id,
            name: h.name,
            description: h.description,
            requiredLevel: h.required_level,
            unlocked: level >= h.required_level,
            discoveredCount: items.filter(i => i.discovered).length,
            totalCount: items.length,
            items,
        };
    });

    return { habitats: result, playerLevel: level, tools: { knifeTier, hasGloves, hasBasket } };
}

export async function canForageHere(playerId: number, habitatId: number): Promise<{ allowed: boolean; reason?: string }> {
    const habitat = await db('foraging_habitats').where({ id: habitatId }).first();
    if (!habitat || !habitat.is_active) return { allowed: false, reason: 'That habitat cannot be foraged.' };
    const level = await playerLevelFor(playerId, 'Foraging');
    if (level < habitat.required_level) {
        return { allowed: false, reason: `You need Foraging level ${habitat.required_level} to forage here.` };
    }
    return { allowed: true };
}

// One forage cycle: pick a find, award it + XP, record discovery.
export async function processForagingAction(playerId: number, habitatIdRaw: number | string): Promise<ForageResult> {
    try {
        const habitatId = typeof habitatIdRaw === 'string' ? parseInt(habitatIdRaw) : habitatIdRaw;
        const habitat = await db('foraging_habitats').where({ id: habitatId }).first();
        if (!habitat || !habitat.is_active) return { success: false, error: 'Habitat not found' };

        const foragingSkill = await db('skills').where({ name: 'Foraging' }).first();
        if (!foragingSkill) return { success: false, error: 'Foraging skill missing' };
        const ps = await db('player_skills').where({ player_id: playerId, skill_id: foragingSkill.id }).first();
        const level = ps ? levelFromXp(ps.xp) : 1;
        if (level < habitat.required_level) return { success: false, error: `Requires Foraging level ${habitat.required_level}` };

        const hasGloves = (await bestToolTier(playerId, 'foraging_gloves')) > 0;
        const hasBasket = (await bestToolTier(playerId, 'foraging_basket')) > 0;

        const table = parseTable(habitat.drop_table);
        // Gloves gate; (season filter would go here once seasons are enabled).
        const pool = table.filter(e => !e.requiresGloves || hasGloves);
        if (pool.length === 0) return { success: false, error: 'You need foraging gloves to gather here.' };

        const pick = weightedPick(pool);
        let qty = randInt(pick.min, pick.max);
        if (hasBasket) qty += 1;   // slight, reliable yield nudge

        const item = await db('items').where({ name: pick.itemName }).first();
        if (!item) return { success: false, error: `Foraged item missing: ${pick.itemName}` };

        const existing = await db('player_inventory').where({ player_id: playerId, item_id: item.id }).first();
        if (existing) {
            await db('player_inventory').where({ player_id: playerId, item_id: item.id }).increment('quantity', qty);
        } else {
            await db('player_inventory').insert({ player_id: playerId, item_id: item.id, quantity: qty });
        }

        await db('player_skills')
            .where({ player_id: playerId, skill_id: foragingSkill.id })
            .increment('xp', pick.xp);

        // Stats — every gather, matching mining/woodcutting (outside the discovery guard).
        await incrementStats(playerId, {
            total_items_foraged: qty,
            total_actions_completed: 1,
            total_xp_earned: pick.xp,
        });

        // Discovery — first time this player pulls this item from this habitat.
        let firstDiscovery = false;
        const already = await db('player_foraging_discoveries')
            .where({ player_id: playerId, habitat_id: habitatId, item_name: pick.itemName }).first();
        if (!already) {
            await db('player_foraging_discoveries')
                .insert({ player_id: playerId, habitat_id: habitatId, item_name: pick.itemName });
            firstDiscovery = true;
            const exploration = await db('skills').where({ name: 'Exploration' }).first();
            if (exploration) {
                await db('player_skills')
                    .where({ player_id: playerId, skill_id: exploration.id })
                    .increment('xp', 10);
            }
        }

        return { success: true, itemName: pick.itemName, quantity: qty, xp: pick.xp, notable: !!pick.notable, firstDiscovery };
    } catch (err) {
        logger.error(`Foraging error for player ${playerId}: ${err}`);
        return { success: false, error: 'Server error' };
    }
}
