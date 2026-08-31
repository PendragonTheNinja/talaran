import type { Knex } from 'knex';

// Tally board licences.
//
// How many boards a player may keep used to follow Carpentry: one at level 5,
// another every ten levels after. Players objected, and the objection was
// sound. A tally board grants no ability at all, only information, and gating
// information behind ten levels of an unrelated trade reads as arbitrary
// because it is.
//
// Two things replace it.
//
// Gold, because information is exactly what a currency sink should buy: it
// drains coin without inflating power, which is the hard part of designing one.
//
// And total level, because the players a tally board actually helps are the
// ones with animals in one place, crops in another and a kiln somewhere else.
// Total level measures breadth, and it measures it sharply: spreading evenly
// across the twelve skills reaches total 60 in about sixty hours, while taking
// a single skill to 50 takes three hundred and sixty hours and reaches total
// 61. The specialist gets fewer boards and needs fewer.
//
// Carpentry 5 still gates building one at all, and the materials still cost.
// What Carpentry no longer decides is how many.

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('players', (table) => {
        // Everyone starts able to keep one, as before.
        table.integer('tally_licences').notNullable().defaultTo(1);
    });

    // Nobody loses a board they already have. Anyone whose Carpentry had earned
    // more than one keeps that number, so the change can only ever give.
    const players = await knex('players as p')
        .leftJoin('player_skills as ps', 'ps.player_id', 'p.id')
        .leftJoin('skills as s', function () {
            this.on('s.id', '=', 'ps.skill_id').andOn(knex.raw("LOWER(s.name) = 'carpentry'"));
        })
        .whereNotNull('s.id')
        .select('p.id', 'ps.xp');

    let raised = 0;
    for (const row of players) {
        // The old rule: 1 + floor(carpentry / 10). Recomputed here rather than
        // imported, so a later change to the live formula cannot rewrite history.
        const xp = Number(row.xp || 0);
        let level = 1;
        let total = 0;
        for (let i = 1; i < 200; i++) {
            total += Math.round(0.081 * Math.pow(i + 30, 3) * Math.pow(Math.pow(1.33, 1 / 12), i - 1));
            if (total <= xp) level = i + 1; else break;
        }
        const earned = 1 + Math.floor(level / 10);
        if (earned > 1) {
            await knex('players').where({ id: row.id }).update({ tally_licences: earned });
            raised++;
        }
    }

    // eslint-disable-next-line no-console
    console.log(`[tally_licences] kept existing allowances for ${raised} player(s)`);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('players', (table) => {
        table.dropColumn('tally_licences');
    });
}
