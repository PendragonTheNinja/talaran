import type { Knex } from 'knex';
import { exhibitFor } from '../../lib/museumPlacement';

// The Taiar Museum gains an exhibit for what only creatures carry (Nathan,
// 2026-10-12): the rare weapons, the Crabshell set and the combat trophies.
//
// Rare weapons and Crabshell are matched by kind (rare_weapon, shell_armor).
// The trophies share their kind with Hunting's and Foraging's, so they are
// matched by name (lib/museumPlacement.ts: a name beats any kind). A new
// combat trophy joins by adding its name to this exhibit's `match`.
//
// Cases already on another exhibit that now belong here are moved, donations
// and all. Every item the exhibit claims gets a case now, so its empty slots
// show from the start, as the museum's first fill did for everything else.

const MUSEUM_KEY = 'taiar';
const AFTER = 'Arms and Armour';
const EXHIBIT = {
    name: 'Spoils of the Fight',
    description: 'Taken from the creatures of the island, and had nowhere else.',
    match: [
        { type: 'weapon', subtype: 'rare_weapon' },
        { type: 'armor', subtype: 'shell_armor' },
        { name: 'Jackalope Antler' },
        { name: 'Wolf Fang' },
        { name: "Wrecker's Lantern" },
        { name: "Knocker's Hammer" },
        { name: 'Agropelter Knuckle' },
    ],
};

async function museum(knex: Knex) {
    return knex('museums').where({ key: MUSEUM_KEY }).first();
}

/** Move every case of this museum to where the current exhibits say it belongs, if `only` claims it. */
async function replace(knex: Knex, museumId: number, only: (from: number, to: number) => boolean) {
    const exhibits = await knex('museum_exhibits').where({ museum_id: museumId });
    const cases = await knex('museum_cases as c')
        .join('museum_exhibits as e', 'e.id', 'c.exhibit_id')
        .join('items as i', 'i.id', 'c.item_id')
        .where('e.museum_id', museumId)
        .orderBy([{ column: 'c.exhibit_id' }, { column: 'c.display_order' }])
        .select('c.id', 'c.exhibit_id', 'i.type', 'i.subtype', 'i.name');
    for (const c of cases) {
        const to = exhibitFor(c, exhibits);
        if (to === null || to === c.exhibit_id || !only(c.exhibit_id, to)) continue;
        const [{ max }] = await knex('museum_cases').where({ exhibit_id: to }).max('display_order as max');
        await knex('museum_cases').where({ id: c.id }).update({ exhibit_id: to, display_order: Number(max ?? -1) + 1 });
    }
}

export async function up(knex: Knex): Promise<void> {
    const m = await museum(knex);
    // A fresh database migrates before its content is imported; the import
    // brings the museum, this exhibit included.
    if (!m) return;

    let spoils = await knex('museum_exhibits').where({ museum_id: m.id, name: EXHIBIT.name }).first();
    if (!spoils) {
        const after = await knex('museum_exhibits').where({ museum_id: m.id, name: AFTER }).first();
        if (!after) throw new Error(`museum_spoils_of_the_fight: no exhibit named "${AFTER}" in the Taiar Museum`);
        const order = Number(after.display_order) + 1;
        await knex('museum_exhibits').where({ museum_id: m.id }).where('display_order', '>=', order).increment('display_order', 1);
        [spoils] = await knex('museum_exhibits').insert({
            museum_id: m.id, name: EXHIBIT.name, description: EXHIBIT.description, display_order: order,
            match: JSON.stringify(EXHIBIT.match), is_catch_all: false,
        }).returning('*');
    } else {
        await knex('museum_exhibits').where({ id: spoils.id })
            .update({ description: EXHIBIT.description, match: JSON.stringify(EXHIBIT.match), updated_at: knex.fn.now() });
    }

    // Cases elsewhere that belong here now.
    await replace(knex, m.id, (_from, to) => to === spoils.id);

    // A case for everything the exhibit claims that has none yet.
    const names = EXHIBIT.match.filter(p => 'name' in p).map(p => (p as { name: string }).name);
    const claimed = await knex('items')
        .where({ is_active: true })
        .where(q => q
            .where({ type: 'weapon', subtype: 'rare_weapon' })
            .orWhere({ type: 'armor', subtype: 'shell_armor' })
            .orWhereIn('name', names))
        .orderBy('name')
        .select('id', 'name');
    for (const n of names) {
        if (!claimed.some((i: { name: string }) => i.name === n)) throw new Error(`museum_spoils_of_the_fight: no item named "${n}"`);
    }
    for (const item of claimed) {
        if (await knex('museum_cases').where({ item_id: item.id }).first()) continue;
        const [{ max }] = await knex('museum_cases').where({ exhibit_id: spoils.id }).max('display_order as max');
        await knex('museum_cases').insert({ exhibit_id: spoils.id, item_id: item.id, display_order: Number(max ?? -1) + 1 });
    }
}

export async function down(knex: Knex): Promise<void> {
    const m = await museum(knex);
    if (!m) return;
    const spoils = await knex('museum_exhibits').where({ museum_id: m.id, name: EXHIBIT.name }).first();
    if (!spoils) return;
    // Its cases go back to where the other exhibits would put them, donations
    // and all; then the exhibit goes and the walls close up behind it.
    await knex('museum_exhibits').where({ id: spoils.id }).update({ match: JSON.stringify([]) });
    await replace(knex, m.id, from => from === spoils.id);
    if (await knex('museum_cases').where({ exhibit_id: spoils.id }).first()) {
        throw new Error('museum_spoils_of_the_fight: cases left on the exhibit with nowhere to go');
    }
    await knex('museum_exhibits').where({ id: spoils.id }).delete();
    await knex('museum_exhibits').where({ museum_id: m.id }).where('display_order', '>', spoils.display_order).decrement('display_order', 1);
}
