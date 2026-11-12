import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Bad-luck protection for the rare weapons (forum "Progressive Rewards to
// Offset RNG Grind Depression", 2026-10-23; Nathan, 2026-11-12).
//
//   drop_table_entries.bad_luck_kills   kills without the drop after which the
//                                       next kill gives it for certain; null
//                                       for a drop with no protection. Set at
//                                       twice the drop's odds, so 2,500 for a
//                                       1 in 1,250 Wrecker's Cutlass.
//   player_drop_luck                    each player's kills since their last of
//                                       that drop. Any drop of it, by luck or
//                                       by protection, empties it.
//
// The Bestiary shows it as a bar beside the drop (services/bestiary.ts), with
// no number, so a drop's chance is never shown. Only the rare weapons: not
// trophies, and not Crabshell, which is common enough without it (Nathan).
//
// Players who have killed the creature but never had the drop start with
// those kills counted, held one short of the mark: their next kill pays if
// their luck has already run past it.

const MULTIPLE = 2;

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('drop_table_entries', 'bad_luck_kills'))) {
        await knex.schema.alterTable('drop_table_entries', (t) => {
            t.integer('bad_luck_kills').nullable();
        });
    }
    if (!(await knex.schema.hasTable('player_drop_luck'))) {
        await knex.schema.createTable('player_drop_luck', (t) => {
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.integer('entry_id').notNullable().references('id').inTable('drop_table_entries').onDelete('CASCADE');
            t.integer('kills').notNullable().defaultTo(0);
            t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.primary(['player_id', 'entry_id']);
        });
        await knex.raw('ALTER TABLE player_drop_luck ADD CONSTRAINT player_drop_luck_kills_nonnegative CHECK (kills >= 0)');
    }
    if (!(await hasContent(knex))) return;

    const entries = await knex('drop_table_entries as d')
        .join('items as i', 'i.id', 'd.item_id')
        .where('d.source_key', 'like', 'combat:%').where('i.subtype', 'rare_weapon').where('d.is_active', true)
        .select('d.id', 'd.source_key', 'd.chance_one_in', 'd.chance_percent', 'i.name', 'i.id as item_id');
    if (!entries.length) throw new Error('bad_luck_trail: no rare weapon drops found among the combat drop tables');

    for (const e of entries) {
        const oneIn = e.chance_one_in ? Number(e.chance_one_in) : 100 / Math.max(0.0001, Number(e.chance_percent));
        const mark = Math.ceil(MULTIPLE * oneIn);
        await knex('drop_table_entries').where({ id: e.id }).update({ bad_luck_kills: mark });

        const creatureKey = String(e.source_key).slice('combat:'.length).split('@')[0];
        const creature = await knex('creatures').where({ key: creatureKey }).first('id');
        if (!creature) throw new Error(`bad_luck_trail: no creature ${creatureKey} for ${e.name}`);
        // Past kills, for those who never had it, one short of the mark at most.
        await knex.raw(`
            INSERT INTO player_drop_luck (player_id, entry_id, kills)
            SELECT k.player_id, ?, LEAST(k.kills, ?)
              FROM player_creature_kills k
             WHERE k.creature_id = ? AND k.kills > 0
               AND NOT EXISTS (SELECT 1 FROM player_item_firsts f WHERE f.player_id = k.player_id AND f.item_id = ?)
            ON CONFLICT (player_id, entry_id) DO NOTHING`,
            [e.id, mark - 1, creature.id, e.item_id]);
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('player_drop_luck');
    if (await knex.schema.hasColumn('drop_table_entries', 'bad_luck_kills')) {
        await knex.schema.alterTable('drop_table_entries', (t) => {
            t.dropColumn('bad_luck_kills');
        });
    }
}
