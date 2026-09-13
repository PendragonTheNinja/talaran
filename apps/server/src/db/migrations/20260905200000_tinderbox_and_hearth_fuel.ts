import type { Knex } from 'knex';

/**
 * Fire, properly.
 *
 * Three changes that belong together:
 *
 * 1. The Campfire item is gone. It was a bundle you put down that lit itself,
 *    and once a tinderbox exists the bundle has no job: you light logs. One
 *    fewer item and one fewer recipe for the same fiction.
 *
 * 2. A tinderbox, held in the main hand, is what lights anything. Equipped
 *    rather than carried, following TOOL_SLOT_COLUMN: you stop woodcutting to
 *    cook, and swapping the hatchet out is the small deliberate pause that makes
 *    lighting a fire feel like a thing you did.
 *
 * 3. A hearth burns fuel. Cooking at your own bench needs a lit fire, and a
 *    fire needs wood. Fuel buys TIME rather than being spent per dish: one
 *    decision at the start of a session instead of an inventory check on every
 *    fish. It also refuels itself from the pack, so a cook carrying logs never
 *    thinks about it at all.
 *
 * Geomima's hearth is not affected. She keeps her own fire in.
 */

export async function up(knex: Knex): Promise<void> {
    // ── The bundle goes ───────────────────────────────────────────
    await knex('recipes').where({ name: 'Campfire' }).delete();
    await knex('items').where({ name: 'Campfire' }).delete();

    // ── Tinderbox ─────────────────────────────────────────────────
    const existing = await knex('items').where({ name: 'Ambren Tinderbox' }).first();
    if (!existing) {
        await knex('items').insert({
            name: 'Ambren Tinderbox',
            type: 'tool',
            subtype: 'tinderbox',
            tier: 1,
            level_required: 1,
            slot: 'mainhand',
            description: 'A small hinged box of char cloth and struck steel. Keeps a spark dry in weather that would kill one.',
            is_active: true,
        });
    }

    const recipe = await knex('recipes').where({ name: 'Ambren Tinderbox' }).first();
    if (!recipe) {
        const rHat = (u: number) => 2000 * Math.pow(1.33, (u - 1) / 12);
        const timer = 45;
        await knex('recipes').insert({
            skill: 'Smithing',
            name: 'Ambren Tinderbox',
            output_item_name: 'Ambren Tinderbox',
            output_qty: 1,
            // A wooden box with a steel striker, so it costs both.
            inputs: JSON.stringify([
                { itemName: 'Ambren Ingot', qty: 1 },
                { itemName: 'Lanai Planks', qty: 1 },
            ]),
            required_level: 1,
            timer_seconds: timer,
            xp: Math.round(1.8 * 1.10 * rHat(1) * timer / 3600),
            station: 'smithing',
            required_tools: JSON.stringify(['anvil', 'hammer', 'tongs']),
            mode: 'active',
            for_skill: 'Smithing',
            flavor_text: 'You are fitting a steel striker into a small wooden box.',
            is_active: true,
        });
    }

    // ── Hearth fuel ───────────────────────────────────────────────
    if (!(await knex.schema.hasColumn('workstations', 'fuel_until'))) {
        await knex.schema.alterTable('workstations', (t) => {
            // When the fire goes out. Null on a bench that needs none, which is
            // every station except cooking.
            t.timestamp('fuel_until').nullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('workstations', 'fuel_until')) {
        await knex.schema.alterTable('workstations', (t) => t.dropColumn('fuel_until'));
    }
    await knex('recipes').where({ name: 'Ambren Tinderbox' }).delete();
    await knex('items').where({ name: 'Ambren Tinderbox' }).delete();

    // The bundle is NOT restored. Nothing would light it, and re-creating a
    // dead item to satisfy a rollback is worse than leaving it gone.
}
