import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Two small tidies (Nathan, 2026-11-25).
//
//   items.museum_exempt   an item too rare to ask a completionist for; no
//                         museum case is made for it (services/museum.ts).
//                         The Four-Leaf Clover is the first. Its case goes, and
//                         anyone who gave one gets it back.
//   Gareth                the blacksmith of Emberra became Geoffrey months ago.
//                         Where an old Gareth row still stands beside a
//                         Geoffrey (a database that missed the rename), it is
//                         put away, so Players Here no longer shows both.

const EXEMPT = ['Four-Leaf Clover'];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('items', 'museum_exempt'))) {
        await knex.schema.alterTable('items', (t) => { t.boolean('museum_exempt').notNullable().defaultTo(false); });
    }
    if (!(await hasContent(knex))) return;

    for (const name of EXEMPT) {
        const item = await knex('items').where({ name }).first('id');
        if (!item) throw new Error(`museum_exempt_and_gareth: no item "${name}"`);
        await knex('items').where({ id: item.id }).update({ museum_exempt: true });
        const cases = await knex('museum_cases').where({ item_id: item.id }).pluck('id');
        if (!cases.length) continue;
        // Given ones come back to their givers, before the case (and its donations) go.
        for (const d of await knex('museum_donations').whereIn('case_id', cases).select('player_id')) {
            await knex.raw(
                `INSERT INTO player_inventory (player_id, item_id, quantity) VALUES (?, ?, 1)
                 ON CONFLICT (player_id, item_id) DO UPDATE SET quantity = player_inventory.quantity + 1`,
                [d.player_id, item.id]);
        }
        await knex('museum_cases').whereIn('id', cases).delete();
    }

    const geoffrey = await knex('npcs').where({ name: 'Geoffrey' }).first('id');
    if (geoffrey) await knex('npcs').where({ name: 'Gareth' }).update({ is_active: false });
}

export async function down(knex: Knex): Promise<void> {
    // The clover's case comes back by itself at the next start (fillMissingCases);
    // returned clovers stay returned, and Gareth stays put away.
    if (await knex.schema.hasColumn('items', 'museum_exempt')) {
        await knex.schema.alterTable('items', (t) => { t.dropColumn('museum_exempt'); });
    }
}
