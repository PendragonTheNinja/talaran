import type { Knex } from 'knex';

// Raising a building is joinery, not bare hands. Both the farmstead and each new
// field now want a mallet and a saw held, matching how a Carpentry workstation
// already demands a sawhorse, saw, and plane. The tools are not consumed.
//
// The mallet is new. It joins the smithed tool family (hammer, saw, plane) and is
// defined in services/smithing.ts alongside them, since those are bespoke rather
// than rows in `recipes`.
//
// Georgic and the homestead also move into a 'farmstead' submenu at Novita, the way
// Verdale collects its trades under Workshop.

export async function up(knex: Knex): Promise<void> {
    const mallet = {
        name: 'Ambren Mallet',
        type: 'tool',
        subtype: 'mallet',
        tier: 1,
        quality: null,
        slot: null,
        level_required: 1,
        description: 'A heavy wooden mallet banded with Ambren. Drives a chisel without splitting the haft, and sets a beam without marring it.',
        stackable: false,
    };
    const existing = await knex('items').where({ name: mallet.name }).first();
    if (existing) await knex('items').where({ id: existing.id }).update(mallet);
    else await knex('items').insert(mallet);

    await knex('npcs').where({ name: 'Georgic' }).update({ submenu: 'farmstead' });
}

export async function down(knex: Knex): Promise<void> {
    await knex('npcs').where({ name: 'Georgic' }).update({ submenu: null });
}
