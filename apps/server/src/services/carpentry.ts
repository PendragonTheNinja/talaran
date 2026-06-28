import db from '../db';
import { levelFromXp } from './xp';
import { logger } from '../lib/logger';
import { incrementStats } from './stats';
import { updateQuestObjectiveProgress } from '../routes/quests';
import { rollSecondaryDrops } from './drops';

// Quest that grants public-bench access at Verdale (created in Step 5).
const INTRO_QUEST = "The Carpenter's Commission";

export interface CarpentryResult {
    success: boolean;
    itemName?: string;
    quantity?: number;
    xpAwarded?: number;
    error?: string;
    ingredientsRemaining?: { name: string; quantity: number }[];
    outputTotal?: number;
    drops?: { name: string; quantity: number }[];
}

interface SawRecipe {
    ingredients: { name: string; quantity: number }[];
    output: string;
    outputQuantity: number;
    requiredLevel: number;
    xp: number;
    timer: number;
}

interface WoodworkRecipe {
    ingredients: { name: string; quantity: number }[];
    output: string;
    outputQuantity: number;
    requiredLevel: number;
    xp: number;
    timer: number;
}

// ── Recipe maps ───────────────────────────────────────────────────

const WOOD_TYPES = [
    { type: 'lanai', planks: 'Lanai Planks', logWord: 'Lanai', requiredLevel: 1 },
    { type: 'hatch', planks: 'Hatch Planks', logWord: 'Hatch', requiredLevel: 13 },
    { type: 'bearn', planks: 'Bearn Planks', logWord: 'Bearn', requiredLevel: 30 },
    { type: 'mirrith', planks: 'Mirrith Planks', logWord: 'Mirrith', requiredLevel: 50 },
    { type: 'craxial', planks: 'Craxial Planks', logWord: 'Craxial', requiredLevel: 70 },
];
const QUALITY_YIELD: Record<string, number> = { poor: 1, fine: 2, excellent: 3 };
const SAW_XP = 23;        // flat per saw; quality changes plank yield, not XP
const SAW_BASE_TIMER = 35; // seconds (route applies 2x at the public bench)

// Keyed by `${woodType}_${quality}`, e.g. 'lanai_fine'
export const SAW_RECIPES: Record<string, SawRecipe> = {};
for (const w of WOOD_TYPES) {
    for (const quality of ['poor', 'fine', 'excellent']) {
        const cap = quality.charAt(0).toUpperCase() + quality.slice(1);
        SAW_RECIPES[`${w.type}_${quality}`] = {
            ingredients: [{ name: `${cap} ${w.logWord} Log`, quantity: 1 }],
            output: w.planks,
            outputQuantity: QUALITY_YIELD[quality],
            requiredLevel: w.requiredLevel,
            xp: SAW_XP,
            timer: SAW_BASE_TIMER,
        };
    }
}

export const WOODWORK_RECIPES: Record<string, WoodworkRecipe> = {
    'lanai_tool_rod': {
        ingredients: [{ name: 'Lanai Planks', quantity: 1 }],
        output: 'Lanai Tool Rod',
        outputQuantity: 1,
        requiredLevel: 1,
        xp: 39,
        timer: 35,
    },
    'lanai_staff': {
        ingredients: [{ name: 'Lanai Planks', quantity: 4 }],
        output: 'Lanai Staff',
        outputQuantity: 1,
        requiredLevel: 5,
        xp: 156,
        timer: 140,
    },
    'lanai_sawhorse': {
        ingredients: [{ name: 'Lanai Planks', quantity: 10 }],
        output: 'Lanai Sawhorse',
        outputQuantity: 1,
        requiredLevel: 1,
        xp: 390,
        timer: 350,
    },
};

// ── Workstation ───────────────────────────────────────────────────

export async function getCarpentryWorkstation(playerId: number, locationId: number): Promise<any> {
    return db('workstations')
        .where({ player_id: playerId, location_id: locationId, type: 'carpentry' })
        .first();
}

export async function setupCarpentryWorkstation(
    playerId: number,
    locationId: number
): Promise<{ success: boolean; error?: string }> {
    try {
        const existing = await getCarpentryWorkstation(playerId, locationId);
        if (existing) return { success: false, error: 'You already have a Carpentry workstation here.' };

        const required = ['Lanai Sawhorse', 'Ambren Saw', 'Ambren Plane'];
        for (const itemName of required) {
            const item = await db('items').where({ name: itemName }).first();
            if (!item) return { success: false, error: `Required item not found: ${itemName}` };
            const inv = await db('player_inventory').where({ player_id: playerId, item_id: item.id }).first();
            if (!inv || inv.quantity < 1) {
                return { success: false, error: `You need a ${itemName} to set up your workstation.` };
            }
        }

        for (const itemName of required) {
            const item = await db('items').where({ name: itemName }).first();
            const inv = await db('player_inventory').where({ player_id: playerId, item_id: item.id }).first();
            if (inv.quantity <= 1) {
                await db('player_inventory').where({ player_id: playerId, item_id: item.id }).delete();
            } else {
                await db('player_inventory').where({ player_id: playerId, item_id: item.id }).decrement('quantity', 1);
            }
        }

        await db('workstations').insert({
            player_id: playerId,
            location_id: locationId,
            type: 'carpentry',
            tier: 1,
            is_active: true,
        });

        logger.info(`Player ${playerId} set up carpentry workstation at location ${locationId}`);
        return { success: true };
    } catch (err) {
        logger.error(`Setup carpentry workstation error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

// ── Access gate (mirrors canSmithHere) ────────────────────────────

export async function canSawHere(
    playerId: number,
    locationId: number
): Promise<{ allowed: boolean; error?: string; usingBench?: boolean }> {
    const workstation = await getCarpentryWorkstation(playerId, locationId);
    if (workstation?.is_active) {
        return { allowed: true, usingBench: false };
    }

    const quest = await db('quests').where({ name: INTRO_QUEST }).first();
    if (quest) {
        const playerQuest = await db('player_quests')
            .where({ player_id: playerId, quest_id: quest.id })
            .whereIn('status', ['active', 'completed'])
            .first();
        if (playerQuest) {
            return { allowed: true, usingBench: true };
        }
    }

    return { allowed: false, error: 'Speak to the Carpenter at Verdale to use the workshop.' };
}

// ── Shared consume/award helpers ──────────────────────────────────

async function hasIngredients(playerId: number, ingredients: { name: string; quantity: number }[]) {
    for (const ing of ingredients) {
        const item = await db('items').where({ name: ing.name }).first();
        if (!item) return { ok: false, error: `Required item not found: ${ing.name}` };
        const inv = await db('player_inventory').where({ player_id: playerId, item_id: item.id }).first();
        if (!inv || inv.quantity < ing.quantity) {
            return { ok: false, error: `You need ${ing.quantity}x ${ing.name}.` };
        }
    }
    return { ok: true as const };
}

async function consumeIngredients(playerId: number, ingredients: { name: string; quantity: number }[]) {
    for (const ing of ingredients) {
        const item = await db('items').where({ name: ing.name }).first();
        const inv = await db('player_inventory').where({ player_id: playerId, item_id: item.id }).first();
        if (inv.quantity <= ing.quantity) {
            await db('player_inventory').where({ player_id: playerId, item_id: item.id }).delete();
        } else {
            await db('player_inventory').where({ player_id: playerId, item_id: item.id }).decrement('quantity', ing.quantity);
        }
    }
}

async function ingredientsRemaining(playerId: number, ingredients: { name: string; quantity: number }[]) {
    const out: { name: string; quantity: number }[] = [];
    for (const ing of ingredients) {
        const item = await db('items').where({ name: ing.name }).first();
        const inv = item ? await db('player_inventory').where({ player_id: playerId, item_id: item.id }).first() : null;
        out.push({ name: ing.name, quantity: inv ? inv.quantity : 0 });
    }
    return out;
}

async function itemTotal(playerId: number, name: string): Promise<number> {
    const item = await db('items').where({ name }).first();
    if (!item) return 0;
    const inv = await db('player_inventory').where({ player_id: playerId, item_id: item.id }).first();
    return inv ? inv.quantity : 0;
}

async function awardItem(playerId: number, name: string, qty: number) {
    const item = await db('items').where({ name }).first();
    if (!item) throw new Error(`awardItem: no item named "${name}"`);
    const existing = await db('player_inventory').where({ player_id: playerId, item_id: item.id }).first();
    if (existing) {
        await db('player_inventory').where({ player_id: playerId, item_id: item.id }).increment('quantity', qty);
    } else {
        await db('player_inventory').insert({ player_id: playerId, item_id: item.id, quantity: qty });
    }
}

async function carpentryLevel(playerId: number): Promise<{ skillId: number; level: number }> {
    const skill = await db('skills').where({ name: 'Carpentry' }).first();
    const ps = await db('player_skills').where({ player_id: playerId, skill_id: skill.id }).first();
    return { skillId: skill.id, level: ps ? levelFromXp(parseInt(ps.xp)) : 1 };
}

// ── Saw logs → planks ─────────────────────────────────────────────

export async function sawPlanks(
    playerId: number,
    locationId: number,
    sawKey: string
): Promise<CarpentryResult> {
    try {
        const can = await canSawHere(playerId, locationId);
        if (!can.allowed) return { success: false, error: can.error };

        const recipe = SAW_RECIPES[sawKey];
        if (!recipe) return { success: false, error: 'Unknown wood type.' };

        const { skillId, level } = await carpentryLevel(playerId);
        if (level < recipe.requiredLevel) {
            return { success: false, error: `You need Carpentry level ${recipe.requiredLevel} to saw this wood.` };
        }

        const check = await hasIngredients(playerId, recipe.ingredients);
        if (!check.ok) return { success: false, error: check.error };
        await consumeIngredients(playerId, recipe.ingredients);
        await awardItem(playerId, recipe.output, recipe.outputQuantity);

        await updateQuestObjectiveProgress(playerId, 'saw', recipe.output, 1);

        await db('player_skills').where({ player_id: playerId, skill_id: skillId }).increment('xp', recipe.xp);
        await incrementStats(playerId, { total_actions_completed: 1, total_xp_earned: recipe.xp });

        const [wood, quality] = sawKey.split('_');
        const drops = await rollSecondaryDrops(playerId, `carpentry:saw:${wood}:${quality}`);

        logger.info(`Player ${playerId} sawed ${recipe.outputQuantity}x ${recipe.output}`);
        const sawRemaining = await ingredientsRemaining(playerId, recipe.ingredients);
        const sawTotal = await itemTotal(playerId, recipe.output);
        return { success: true, itemName: recipe.output, quantity: recipe.outputQuantity, xpAwarded: recipe.xp, ingredientsRemaining: sawRemaining, outputTotal: sawTotal, drops };
    } catch (err) {
        logger.error(`Saw error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

// ── Woodwork planks → items ───────────────────────────────────────

export async function woodwork(
    playerId: number,
    locationId: number,
    recipeKey: string
): Promise<CarpentryResult> {
    try {
        const can = await canSawHere(playerId, locationId);
        if (!can.allowed) return { success: false, error: can.error };

        const recipe = WOODWORK_RECIPES[recipeKey];
        if (!recipe) return { success: false, error: 'Unknown recipe.' };

        const { skillId, level } = await carpentryLevel(playerId);
        if (level < recipe.requiredLevel) {
            return { success: false, error: `You need Carpentry level ${recipe.requiredLevel}.` };
        }

        const check = await hasIngredients(playerId, recipe.ingredients);
        if (!check.ok) return { success: false, error: check.error };
        await consumeIngredients(playerId, recipe.ingredients);
        await awardItem(playerId, recipe.output, recipe.outputQuantity);

        await updateQuestObjectiveProgress(playerId, 'woodwork', recipe.output, 1);

        await db('player_skills').where({ player_id: playerId, skill_id: skillId }).increment('xp', recipe.xp);
        await incrementStats(playerId, { total_actions_completed: 1, total_xp_earned: recipe.xp });

        logger.info(`Player ${playerId} crafted ${recipe.outputQuantity}x ${recipe.output}`);
        const wwRemaining = await ingredientsRemaining(playerId, recipe.ingredients);
        const wwTotal = await itemTotal(playerId, recipe.output);
        return { success: true, itemName: recipe.output, quantity: recipe.outputQuantity, xpAwarded: recipe.xp, ingredientsRemaining: wwRemaining, outputTotal: wwTotal };
    } catch (err) {
        logger.error(`Woodwork error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}