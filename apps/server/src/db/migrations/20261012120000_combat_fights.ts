import type { Knex } from 'knex';

// Combat, step 4 (docs/combat-spec.md §9, docs/combat-build-plan.md).
//
// combat_fights: the state of one running fight, one row per player. The
// player_actions row is still the fight's action (the one-action-per-player
// gate and the tick's schedule); this row holds what does not fit in
// action_data, typed. It hangs off the action with ON DELETE CASCADE, so
// anything that deletes the action (travel, the absence cancel, an admin)
// ends the fight with it.
//
// Swings are settled on read (services/combat.ts): `settled_at` is how far the
// fight has been played, and the three clocks say when each side swings next
// and when the next creature closes in. Nothing lives only in a timer.
//
// Also:
//   player_settings.combat_continue_offline  fight on through a disconnect
//                                             (default off: a disconnect flees)
//   player_stats.total_creatures_killed / total_combat_deaths
//   action_presentation row for 'combat'

const PRESENTATION = {
    action_type: 'combat',
    kind: null,
    scene_text: 'You keep your guard up and your eyes on the next one.',
    cancel_label: 'Flee',
};

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('combat_fights'))) {
        await knex.schema.createTable('combat_fights', t => {
            t.increments('id').primary();
            t.integer('action_id').unsigned().notNullable().unique()
                .references('id').inTable('player_actions').onDelete('CASCADE');
            t.integer('player_id').unsigned().notNullable().unique()
                .references('id').inTable('players').onDelete('CASCADE');
            t.integer('spot_id').unsigned().notNullable()
                .references('id').inTable('fighting_spots').onDelete('CASCADE');
            // At a chosen spot, the creature picked; null at a drawn spot.
            t.integer('chosen_creature_id').unsigned().nullable()
                .references('id').inTable('creatures').onDelete('CASCADE');
            // The creature being fought, or closing in.
            t.integer('creature_id').unsigned().notNullable()
                .references('id').inTable('creatures').onDelete('CASCADE');
            t.double('enemy_hp').notNullable();
            // While in the future, the creature is still closing in: no swings.
            t.timestamp('engage_at', { useTz: true }).notNullable();
            t.timestamp('player_next_at', { useTz: true }).notNullable();
            t.timestamp('enemy_next_at', { useTz: true }).notNullable();
            t.timestamp('settled_at', { useTz: true }).notNullable();
            // This kill's ledger (§2): what armour stopped, what got through.
            t.integer('kill_absorbed').notNullable().defaultTo(0);
            t.integer('kill_landed').notNullable().defaultTo(0);
            t.integer('kills').notNullable().defaultTo(0);
            // Stopped between kills for a bot check; the clock restarts on the answer.
            t.boolean('frozen').notNullable().defaultTo(false);
            t.timestamp('started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        });
    }

    if (!(await knex.schema.hasColumn('player_settings', 'combat_continue_offline'))) {
        await knex.schema.alterTable('player_settings', t => {
            t.boolean('combat_continue_offline').notNullable().defaultTo(false);
        });
    }

    for (const column of ['total_creatures_killed', 'total_combat_deaths']) {
        if (!(await knex.schema.hasColumn('player_stats', column))) {
            await knex.schema.alterTable('player_stats', t => { t.integer(column).notNullable().defaultTo(0); });
        }
    }

    const existing = await knex('action_presentation').where({ action_type: PRESENTATION.action_type }).whereNull('kind').first();
    if (existing) {
        await knex('action_presentation').where({ id: existing.id })
            .update({ scene_text: PRESENTATION.scene_text, cancel_label: PRESENTATION.cancel_label, updated_at: knex.fn.now() });
    } else {
        await knex('action_presentation').insert(PRESENTATION);
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex('action_presentation').where({ action_type: PRESENTATION.action_type }).whereNull('kind').delete();
    for (const column of ['total_combat_deaths', 'total_creatures_killed']) {
        if (await knex.schema.hasColumn('player_stats', column)) {
            await knex.schema.alterTable('player_stats', t => { t.dropColumn(column); });
        }
    }
    if (await knex.schema.hasColumn('player_settings', 'combat_continue_offline')) {
        await knex.schema.alterTable('player_settings', t => { t.dropColumn('combat_continue_offline'); });
    }
    await knex('player_actions').where({ action_type: 'combat' }).delete();
    await knex.schema.dropTableIfExists('combat_fights');
}
