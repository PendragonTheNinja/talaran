import type { Knex } from 'knex';

/** What every new character starts with, registered or guest. */
export const STARTER_ITEMS = ['Ambren Hatchet', 'Ambren Pickaxe', "Novice's Pony"];

/**
 * Give a just-inserted player everything a new character has: every skill at
 * zero XP, a stats row, and the starter items. Runs inside the caller's
 * transaction, so a failure part way leaves no account at all rather than one
 * without skills.
 *
 * Registration and guest creation each carried their own copy of this, and
 * registration ran its copy outside any transaction (audit L-4). One copy, so
 * a change to the starting kit reaches every new character.
 */
export async function setUpNewPlayerWithin(trx: Knex.Transaction, playerId: number): Promise<void> {
    const allSkills = await trx('skills').select('id');
    if (allSkills.length) {
        await trx('player_skills').insert(
            allSkills.map((skill: { id: number }) => ({ player_id: playerId, skill_id: skill.id, xp: 0 })),
        );
    }
    await trx('player_stats').insert({ player_id: playerId });

    for (const name of STARTER_ITEMS) {
        const item = await trx('items').where({ name }).first();
        if (item) await trx('player_inventory').insert({ player_id: playerId, item_id: item.id, quantity: 1 });
    }
}
