import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The Chronicle, step 7 (docs/chronicle-spec.md §5): the deed kinds the
// journal did not yet write.
//
//   road_firsts        one row per road (either way), made by the first to
//                      walk it to its end (services/chronicle.ts
//                      noteRoadWalked). Roads already walked are filled in
//                      here, with no name, so the first days after this ships
//                      do not hail every road on the island as new: a road
//                      counts as walked when both its ends have been reached.
//   items.cryptid      the rare tier's flag (§5 cryptid; never inferred from a
//                      name at runtime). Set here for the Squonk's drops.
//   feats.chronicle    which feats are told in the tidings when earned
//                      (feat_rare): the hidden ones and those with a title.
//   chronicle_deed_kinds   the new kinds and their weights.

const KINDS = [
    { key: 'gem_best_grade', section: 'island', base_weight: 12, max_per_page: null, label: 'Best grade off the lapidary wheel' },
    { key: 'first_craft_tier', section: 'island', base_weight: 40, max_per_page: null, label: 'First on the island to make a tier 3+ item' },
    { key: 'feat_rare', section: 'island', base_weight: 20, max_per_page: null, label: 'Hard or hidden feat earned' },
    { key: 'quest_first', section: 'island', base_weight: 25, max_per_page: null, label: 'First on the island to finish a quest' },
    { key: 'shop_big_sale', section: 'island', base_weight: 6, max_per_page: 2, label: 'A large sale from a player shop' },
];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('road_firsts'))) {
        await knex.schema.createTable('road_firsts', (t) => {
            t.string('road_key', 30).primary();   // "<lower id>-<higher id>"
            t.integer('player_id').nullable().references('id').inTable('players').onDelete('SET NULL');
            t.timestamp('first_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        });
    }
    if (!(await knex.schema.hasColumn('items', 'cryptid'))) {
        await knex.schema.alterTable('items', (t) => { t.boolean('cryptid').notNullable().defaultTo(false); });
    }
    if (!(await knex.schema.hasColumn('feats', 'chronicle'))) {
        await knex.schema.alterTable('feats', (t) => { t.boolean('chronicle').notNullable().defaultTo(false); });
    }
    for (const k of KINDS) await knex('chronicle_deed_kinds').insert(k).onConflict('key').ignore();

    // Roads walked before this: both ends reached by somebody.
    await knex.raw(`
        INSERT INTO road_firsts (road_key, player_id)
        SELECT DISTINCT least(c.from_location_id, c.to_location_id) || '-' || greatest(c.from_location_id, c.to_location_id), NULL::int
          FROM location_connections c
         WHERE EXISTS (SELECT 1 FROM player_exploration x WHERE x.discovery_type = 'location' AND x.discovery_key = 'location:' || c.from_location_id
                       UNION SELECT 1 FROM players p WHERE p.current_location_id = c.from_location_id)
           AND EXISTS (SELECT 1 FROM player_exploration x WHERE x.discovery_type = 'location' AND x.discovery_key = 'location:' || c.to_location_id
                       UNION SELECT 1 FROM players p WHERE p.current_location_id = c.to_location_id)
        ON CONFLICT (road_key) DO NOTHING`);

    if (!(await hasContent(knex))) return;
    await knex('items').whereILike('name', '%squonk%').update({ cryptid: true });
    await knex('feats')
        .where((q) => q.whereNotNull('title').orWhere('is_hidden', true))
        .whereNot('criterion_kind', 'chronicle_days')
        .update({ chronicle: true });
}

export async function down(knex: Knex): Promise<void> {
    await knex('chronicle_deed_kinds').whereIn('key', KINDS.map((k) => k.key)).delete();
    if (await knex.schema.hasColumn('feats', 'chronicle')) await knex.schema.alterTable('feats', (t) => { t.dropColumn('chronicle'); });
    if (await knex.schema.hasColumn('items', 'cryptid')) await knex.schema.alterTable('items', (t) => { t.dropColumn('cryptid'); });
    await knex.schema.dropTableIfExists('road_firsts');
}
