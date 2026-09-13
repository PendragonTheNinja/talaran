import type { Knex } from 'knex';

/**
 * Cooking, part 2: direct cooking.
 *
 * One raw thing becomes one cooked thing. Twenty-six recipes, no other inputs,
 * available from level 1. This is the bulk food that fills a pack, and it is
 * what gives all eighteen fish species and the eight meats individual meaning.
 *
 * Every recipe here needs NO TOOLS. That is deliberate: a station with no
 * slots can run them, which is what will let a campfire cook a fish anywhere
 * while a cauldron dish needs the cookhouse.
 *
 * Levels follow the ingredient's own source level, from docs/cooking-outline.md.
 * Deer is Hunting 1, so Roast Venison is an opening recipe; Cow is Husbandry 9,
 * so beef arrives mid-tier; Pig is 17, so pork is the top of the island.
 *
 * BURN: nothing consumes burn_base or burn_stop yet. The service work lands
 * with the composite dishes. Values are set here so the data is complete and
 * the manual can already print "burns until level X".
 */

type Cook = {
    /** raw input */
    from: string;
    /** cooked output */
    to: string;
    /** cooking level, matching the ingredient's own source level */
    level: number;
    /** flat HP restored, roughly 8 + 2.5 x level */
    heal: number;
    kind: 'fish' | 'meat';
};

const COOKS: Cook[] = [
    { from: 'Tiddle', to: 'Cooked Tiddle', level: 1, heal: 10, kind: 'fish' },
    { from: 'Whiting', to: 'Cooked Whiting', level: 1, heal: 10, kind: 'fish' },
    { from: 'Rabbit Meat', to: 'Roast Rabbit', level: 1, heal: 10, kind: 'meat' },
    { from: 'Chicken Meat', to: 'Roast Chicken', level: 1, heal: 11, kind: 'meat' },
    { from: 'Pheasant Meat', to: 'Roast Pheasant', level: 1, heal: 11, kind: 'meat' },
    { from: 'Venison', to: 'Roast Venison', level: 1, heal: 12, kind: 'meat' },
    { from: 'Brook Dace', to: 'Cooked Brook Dace', level: 2, heal: 13, kind: 'fish' },
    { from: 'Black Bream', to: 'Cooked Black Bream', level: 2, heal: 13, kind: 'fish' },
    { from: 'Perch', to: 'Cooked Perch', level: 3, heal: 15, kind: 'fish' },
    { from: 'Dawn Sprat', to: 'Cooked Dawn Sprat', level: 3, heal: 15, kind: 'fish' },
    { from: 'Burbot', to: 'Cooked Burbot', level: 4, heal: 18, kind: 'fish' },
    { from: 'Garfish', to: 'Cooked Garfish', level: 4, heal: 18, kind: 'fish' },
    { from: 'Chalkarp', to: 'Cooked Chalkarp', level: 5, heal: 20, kind: 'fish' },
    { from: 'John Dory', to: 'Cooked John Dory', level: 5, heal: 20, kind: 'fish' },
    { from: 'Gurnard', to: 'Cooked Gurnard', level: 6, heal: 23, kind: 'fish' },
    { from: 'Conger Eel', to: 'Cooked Conger Eel', level: 6, heal: 23, kind: 'fish' },
    { from: 'Pike', to: 'Cooked Pike', level: 7, heal: 25, kind: 'fish' },
    { from: 'Duskfin', to: 'Cooked Duskfin', level: 7, heal: 25, kind: 'fish' },
    { from: 'Frostgill', to: 'Cooked Frostgill', level: 8, heal: 28, kind: 'fish' },
    { from: 'Wolffish', to: 'Cooked Wolffish', level: 8, heal: 28, kind: 'fish' },
    { from: 'Stormer', to: 'Cooked Stormer', level: 9, heal: 30, kind: 'fish' },
    { from: 'Sabreling', to: 'Cooked Sabreling', level: 9, heal: 30, kind: 'fish' },
    { from: 'Beef', to: 'Roast Beef', level: 9, heal: 31, kind: 'meat' },
    { from: 'Boar Meat', to: 'Roast Boar', level: 9, heal: 31, kind: 'meat' },
    { from: 'Pork', to: 'Roast Pork', level: 17, heal: 46, kind: 'meat' },
    { from: 'Sloth Meat', to: 'Roast Sloth', level: 17, heal: 46, kind: 'meat' },
];

/** Tier band of a level, per the table in CLAUDE.md. */
const RUNGS = [1, 13, 25, 37, 50, 62, 75, 87, 100];
function tierOfLevel(level: number): number {
    let tier = 1;
    for (let i = 0; i < RUNGS.length; i++) if (level >= RUNGS[i]) tier = i + 1;
    return tier;
}

export async function up(knex: Knex): Promise<void> {
    // ── Burnt variants ────────────────────────────────────────────
    const burnt = [
        {
            name: 'Burnt Fish', type: 'food', subtype: 'burnt', tier: 1, level_required: 1,
            description: 'Black on the outside, dry to the bone. Not worth the eating.',
            heal_amount: null, is_active: true,
        },
        {
            name: 'Burnt Meat', type: 'food', subtype: 'burnt', tier: 1, level_required: 1,
            description: 'Charred through and gone to leather. The dogs might take it.',
            heal_amount: null, is_active: true,
        },
    ];
    for (const b of burnt) {
        const existing = await knex('items').where({ name: b.name }).first();
        if (!existing) await knex('items').insert(b);
    }

    // ── Cooked outputs ────────────────────────────────────────────
    for (const c of COOKS) {
        const existing = await knex('items').where({ name: c.to }).first();
        if (existing) continue;

        const source = await knex('items').where({ name: c.from }).first();
        if (!source) {
            throw new Error(`Cooking part 2: no raw item named "${c.from}". Check the fishing and hunting content shipped first.`);
        }

        await knex('items').insert({
            name: c.to,
            type: 'food',
            subtype: c.kind === 'fish' ? 'cooked_fish' : 'cooked_meat',
            tier: tierOfLevel(c.level),
            level_required: 1,
            heal_amount: c.heal,
            description: c.kind === 'fish'
                ? `${c.from} cooked through, the skin crisped and the flesh come away clean.`
                : `${c.from} roasted over the fire until the juices run clear.`,
            is_active: true,
        });
    }

    // ── Recipes ───────────────────────────────────────────────────
    //
    // XP per docs/xp-rebalance.md section 8, at the crafting policy of 1.8:
    //   target = 1.8 x 1.10 x 2000 x 1.33^((u-1)/12)
    //
    // Then corrected for burning. A burn pays half XP, so expected output at
    // the recipe's own level is (1 - burn/2) of the listed value. Setting xp
    // from the clean-cook figure would quietly underpay Cooking at every level.
    const rHat = (u: number) => 2000 * Math.pow(1.33, (u - 1) / 12);
    const targetFor = (u: number) => 1.8 * 1.10 * rHat(u);

    const TIMER = 30;        // quick by design: this is the volume recipe
    const BURN_BASE = 30;    // single ingredient, so the full base rate
    const BURN_SPAN = 20;    // burn reaches 1% twenty levels above the recipe

    for (const c of COOKS) {
        const existing = await knex('recipes').where({ name: c.to }).first();
        if (existing) continue;

        const expectedShare = 1 - (BURN_BASE / 100) / 2;
        const xp = Math.round((targetFor(c.level) * TIMER / 3600) / expectedShare);

        await knex('recipes').insert({
            skill: 'Cooking',
            name: c.to,
            output_item_name: c.to,
            output_qty: 1,
            inputs: JSON.stringify([{ itemName: c.from, qty: 1 }]),
            required_level: c.level,
            timer_seconds: TIMER,
            xp,
            station: 'cooking',
            required_tools: JSON.stringify([]), // no tools: a campfire can do this
            burn_base: BURN_BASE,
            burn_stop: c.level + BURN_SPAN,
            mode: 'active',
            for_skill: 'Cooking',
            flavor_text: c.kind === 'fish'
                ? `You are turning a ${c.from.toLowerCase()} over the heat.`
                : `You are roasting ${c.from.toLowerCase()} over the fire.`,
            is_active: true,
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    const names = COOKS.map(c => c.to);
    await knex('recipes').whereIn('name', names).delete();
    await knex('items').whereIn('name', names).delete();
    await knex('items').whereIn('name', ['Burnt Fish', 'Burnt Meat']).delete();
}
