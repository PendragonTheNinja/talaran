import { TRAVEL_EVENTS } from './travelEvents';
import { GOLD_DROP_NAME } from './goldFinds';
import { LIQUIDS } from './liquids';
import { ESTABLISH_COST, SHOP_TOWN } from './shops';
import { BUILD_MALLET, BUILD_SAW } from './construction';
import { SMELT_RECIPES, SMITH_RECIPES } from './smithing';
import { SAW_RECIPES, WOODWORK_RECIPES } from './carpentry';
import { BEDDING, PEN_COST } from './husbandry';
import { FARM_ESTABLISH_COST, plotCost } from './farming';
import { BUILD_COST as TALLY_BUILD_COST } from './tally';
import { STATION_ITEMS as TANNING_STATIONS } from './tanning';
import { HUNT_AMMO } from './hunting';
import type { ItemSource, ItemUse } from './itemPage';

// Item sources and uses that live in code rather than in the database.
//
// Roughly a third of what happens to an item in Talaran is decided by constants
// in service files: what a forge smelts, what a bench saws, what turns up on a
// road, what a shop costs to build. None of it is queryable, so the manual could
// not see any of it, and an item that only appeared here read as useless.
//
// This file imports those constants rather than restating them. That is the
// whole point: a table of costs copied into the manual is wrong the first time
// somebody edits the real one, whereas an import fails to compile. Renaming
// SMITH_RECIPES breaks this file loudly instead of quietly emptying a page.
//
// The longer-term fix for the build costs is to move them into the database
// alongside recipes, which would let you retune them without a deploy. Until
// then this keeps the manual honest.

interface Ingredient {
    name?: string;
    itemName?: string;
    quantity?: number;
    qty?: number;
}

const eq = (a: string | undefined, b: string) =>
    !!a && a.toLowerCase() === b.toLowerCase();

function ingredientList(list: Ingredient[] | undefined): string {
    return (list || [])
        .map(i => `${i.quantity ?? i.qty ?? 1} x ${i.name ?? i.itemName}`)
        .join(', ');
}

function needed(list: Ingredient[] | undefined, name: string): number | null {
    const hit = (list || []).find(i => eq(i.name ?? i.itemName, name));
    return hit ? (hit.quantity ?? hit.qty ?? 1) : null;
}

export function codeSources(name: string): ItemSource[] {
    const out: ItemSource[] = [];

    // Found on the road. Nothing in the manual mentioned these at all, so an
    // item that only comes from travel looked like it came from nowhere.
    for (const e of TRAVEL_EVENTS) {
        if (!eq(e.itemName, name)) continue;
        out.push({
            kind: 'Travelling',
            from: 'Found on the road',
            where: e.region === 'global' ? 'Anywhere' : e.region,
            detail: [
                `Roughly 1 in ${e.rarity} stretches`,
                e.quantity > 1 ? `${e.quantity} at a time` : '',
            ].filter(Boolean).join(' · '),
            link: 'systems/travel',
        });
    }

    if (eq(GOLD_DROP_NAME, name)) {
        out.push({
            kind: 'Gathering',
            from: 'Turned up while working',
            detail: 'Any gathering action can produce coin',
            link: 'systems/coin',
        });
    }

    // Smelting and smithing at the forge.
    for (const [key, r] of Object.entries(SMELT_RECIPES)) {
        if (!eq(r.output, name)) continue;
        out.push({
            kind: 'Smithing',
            from: `Smelting ${key}`,
            detail: [
                `Level ${r.requiredLevel}`,
                ingredientList(r.ingredients) ? `From ${ingredientList(r.ingredients)}` : '',
                r.outputQuantity > 1 ? `Makes ${r.outputQuantity}` : '',
            ].filter(Boolean).join(' · '),
            link: 'skills/smithing',
        });
    }

    for (const [key, r] of Object.entries(SMITH_RECIPES)) {
        if (!eq(r.output, name)) continue;
        out.push({
            kind: 'Smithing',
            from: `Forging ${key}`,
            detail: [
                `Level ${r.requiredLevel}`,
                ingredientList(r.ingredients) ? `From ${ingredientList(r.ingredients)}` : '',
            ].filter(Boolean).join(' · '),
            link: 'skills/smithing',
        });
    }

    // Sawing and woodwork at the bench.
    for (const [key, r] of Object.entries(SAW_RECIPES)) {
        if (!eq(r.output, name)) continue;
        out.push({
            kind: 'Carpentry',
            from: `Sawing ${key}`,
            detail: [
                `Level ${r.requiredLevel}`,
                r.outputQuantity > 1 ? `Makes ${r.outputQuantity}` : '',
            ].filter(Boolean).join(' · '),
            link: 'skills/carpentry',
        });
    }

    for (const [key, r] of Object.entries(WOODWORK_RECIPES)) {
        if (!eq(r.output, name)) continue;
        out.push({
            kind: 'Carpentry',
            from: key,
            detail: [
                `Level ${r.requiredLevel}`,
                ingredientList(r.ingredients) ? `From ${ingredientList(r.ingredients)}` : '',
                r.outputQuantity > 1 ? `Makes ${r.outputQuantity}` : '',
            ].filter(Boolean).join(' · '),
            link: 'skills/carpentry',
        });
    }

    // A sealed container is how a liquid is carried, so it is obtained by
    // filling the empty one.
    for (const def of Object.values(LIQUIDS)) {
        if (!eq(def.sealed, name)) continue;
        out.push({
            kind: 'Dairy',
            from: `Filling a ${def.empty}`,
            detail: `Holds ${def.per} ${def.liquid}`,
            link: 'skills/husbandry',
        });
    }

    // Mucking out a pen lays fresh bedding and returns manure, which is the
    // only way manure enters the world.
    if (eq('Manure', name)) {
        out.push({
            kind: 'Husbandry',
            from: 'Mucking out a pen',
            detail: `Costs ${BEDDING.perHead} ${BEDDING.itemName} a head`,
            link: 'skills/husbandry',
        });
    }

    return out;
}

export function codeUses(name: string): ItemUse[] {
    const out: ItemUse[] = [];

    // Materials consumed at the forge and the bench.
    for (const [key, r] of Object.entries(SMELT_RECIPES)) {
        const qty = needed(r.ingredients, name);
        if (qty === null) continue;
        out.push({
            kind: 'Smithing',
            into: r.output,
            detail: `Smelting ${key} · level ${r.requiredLevel} · needs ${qty}`,
            link: 'skills/smithing',
        });
    }

    for (const [key, r] of Object.entries(SMITH_RECIPES)) {
        const qty = needed(r.ingredients, name);
        if (qty === null) continue;
        out.push({
            kind: 'Smithing',
            into: r.output,
            detail: `Forging ${key} · level ${r.requiredLevel} · needs ${qty}`,
            link: 'skills/smithing',
        });
    }

    for (const [key, r] of Object.entries(WOODWORK_RECIPES)) {
        const qty = needed(r.ingredients, name);
        if (qty === null) continue;
        out.push({
            kind: 'Carpentry',
            into: r.output,
            detail: `${key} · level ${r.requiredLevel} · needs ${qty}`,
            link: 'skills/carpentry',
        });
    }

    // Logs are sawn into planks, which is the use players ask about most and
    // the one that was missing entirely.
    for (const [key, r] of Object.entries(SAW_RECIPES)) {
        const qty = needed((r as { ingredients?: Ingredient[] }).ingredients, name);
        const isInput = qty !== null || eq(key, name);
        if (!isInput) continue;
        out.push({
            kind: 'Carpentry',
            into: r.output,
            detail: `Sawn at the bench · level ${r.requiredLevel}`,
            link: 'skills/carpentry',
        });
    }

    // Tools that must be held rather than spent. Worth stating on the tool's
    // own page, since otherwise a hammer looks like it does nothing.
    for (const tool of [BUILD_MALLET, BUILD_SAW]) {
        if (!eq(tool.itemName, name)) continue;
        out.push({
            kind: 'Building',
            into: 'Any construction',
            detail: 'Must be equipped. Not consumed.',
            link: 'systems/construction',
        });
    }

    // Raising a shop.
    const shopQty = needed(ESTABLISH_COST as Ingredient[], name);
    if (shopQty !== null) {
        out.push({
            kind: 'Building',
            into: `A shop at ${SHOP_TOWN}`,
            detail: `Needs ${shopQty}`,
            link: 'systems/player-shops',
        });
    }

    // A liquid's empty container, and the liquid it measures.
    for (const def of Object.values(LIQUIDS)) {
        if (eq(def.empty, name)) {
            out.push({
                kind: 'Dairy',
                into: def.sealed,
                detail: `Fill with ${def.per} ${def.liquid}`,
                link: 'skills/husbandry',
            });
        }
        if (eq(def.liquid, name)) {
            out.push({
                kind: 'Dairy',
                into: def.sealed,
                detail: `${def.per} fill one ${def.empty}`,
                link: 'skills/husbandry',
            });
        }
    }

    // Pens. The cost grows with each one built, so the first is quoted and the
    // growth is described rather than printed as a table nobody would read.
    for (const [pen, costFor] of Object.entries(PEN_COST)) {
        const first = costFor(1);
        const second = costFor(2);
        const hit = first.find(c => eq(c.itemName, name));
        if (!hit) continue;
        const step = (second.find(c => eq(c.itemName, name))?.qty ?? hit.qty) - hit.qty;
        out.push({
            kind: 'Husbandry',
            into: `Building a ${pen}`,
            detail: `${hit.qty} for the first${step > 0 ? `, ${step} more each time after` : ''}`,
            link: 'skills/husbandry',
        });
    }

    if (eq(BEDDING.itemName, name)) {
        out.push({
            kind: 'Husbandry',
            into: 'Fresh bedding',
            detail: `${BEDDING.perHead} a head when mucking out, which returns manure`,
            link: 'skills/husbandry',
        });
    }

    // The farmstead, and the plots that follow it.
    const farmQty = FARM_ESTABLISH_COST.find(c => eq(c.itemName, name))?.qty;
    if (farmQty) {
        out.push({
            kind: 'Building',
            into: 'A farmstead',
            detail: `Needs ${farmQty}`,
            link: 'skills/farming',
        });
    }

    const plotFirst = plotCost(1).find(c => eq(c.itemName, name));
    if (plotFirst) {
        const plotStep = (plotCost(2).find(c => eq(c.itemName, name))?.qty ?? plotFirst.qty) - plotFirst.qty;
        out.push({
            kind: 'Building',
            into: 'A farm plot',
            detail: `${plotFirst.qty} for the first${plotStep > 0 ? `, ${plotStep} more each time after` : ''}`,
            link: 'skills/farming',
        });
    }

    const tallyQty = TALLY_BUILD_COST.find(c => eq(c.itemName, name))?.qty;
    if (tallyQty) {
        out.push({
            kind: 'Building',
            into: 'A tally board',
            detail: `Needs ${tallyQty}`,
            link: 'systems/tally-boards',
        });
    }

    if (TANNING_STATIONS.some(t => eq(t, name))) {
        out.push({
            kind: 'Crafting',
            into: 'A tannery',
            detail: 'Consumed when the tannery is set up',
            link: 'skills/crafting',
        });
    }

    if (eq(HUNT_AMMO, name)) {
        out.push({
            kind: 'Hunting',
            into: 'Every shot taken',
            detail: 'One spent per shot, and often recovered afterwards',
            link: 'skills/hunting',
        });
    }

    return out;
}
