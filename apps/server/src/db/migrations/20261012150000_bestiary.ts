import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Combat, step 9: the Bestiary (docs/combat-spec.md §8).
//
//   player_creature_kills  kills per player per creature; what the Bestiary
//                          shows grows with it (1 / 10 / 50 / 250 / 1,000)
//   creatures.lore         the line shown at 1,000 kills, with the mastery mark
//
// Lore is player-facing text, so it is content and lives here.

const LORE: [string, string][] = [
    ['dock_rat', 'Sailors say a ship with no rats aboard is a ship about to sink. The rats of Talador have never once been wrong about a ship.'],
    ['granary_rat', 'Novita leaves the first sheaf of every harvest in the barn for them. The rats take it, and the rest besides.'],
    ['jackalope', 'Men in their cups swear a jackalope can call in a human voice. Nobody sober has heard it.'],
    ['feral_dog', 'Every dog in the Stackyards pack once came to a name. Not one of them will come to a name now.'],
    ['shore_crab', 'Their shells wash up white along the Dawncrest strand, and the village children eat their porridge out of them.'],
    ['ol_shellback', "Some say Ol' Shellback is not one crab but a long line of them, each taking the name when the last one dies. The fishermen do not care for that story."],
    ['wrecker', 'No wrecker has ever been caught with a lantern in his hand. They are careful about that.'],
    ['sidehill_gouger', 'Put a gouger on flat ground and it falls over. The trick is getting it to flat ground.'],
    ['jumper', 'A jumper holds his claim until a bigger jumper comes along. Grundagr has seen a great many claims.'],
    ['grey_wolf', "The wolves of Eld Grove do not howl at the moon. They howl at the woodcutters' fires, and the woodcutters go home early."],
    ['knocker', 'Miners leave a crust of their dinner in the dark for the knockers. The ones who forget find their candles out.'],
    ['agropelter', 'No woodcutter has ever seen an agropelter climb. It is always already up there.'],
    ['hodag', 'The old men say a Hodag eats nothing but white bulldogs, and only on Sundays. There are no white bulldogs on Taiar.'],
];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('player_creature_kills'))) {
        await knex.schema.createTable('player_creature_kills', t => {
            t.integer('player_id').unsigned().notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.integer('creature_id').unsigned().notNullable().references('id').inTable('creatures').onDelete('CASCADE');
            t.integer('kills').notNullable().defaultTo(0);
            t.timestamp('first_killed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.primary(['player_id', 'creature_id']);
        });
    }
    if (!(await knex.schema.hasColumn('creatures', 'lore'))) {
        await knex.schema.alterTable('creatures', t => { t.text('lore').nullable(); });
    }
    // A fresh database before content:import (lib/migrationContent.ts): schema only.
    if (!(await hasContent(knex))) return;
    for (const [key, lore] of LORE) {
        const updated = await knex('creatures').where({ key }).update({ lore });
        if (updated !== 1) throw new Error(`bestiary: creature ${key} not found`);
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('creatures', 'lore')) {
        await knex.schema.alterTable('creatures', t => { t.dropColumn('lore'); });
    }
    await knex.schema.dropTableIfExists('player_creature_kills');
}
