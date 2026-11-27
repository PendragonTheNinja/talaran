import type { Knex } from 'knex';

// Invasions (docs/invasions-spec.md, Nathan 2026-11-27): staff open a tear
// somewhere on an island, and creatures from another world come through it.
// Schema only; the first two realms and their creatures are the next
// migration (20261127130000_invasion_realms).
//
//   realms                       a world a tear opens onto. Its lines are
//                                content (CLAUDE.md §2: text lives in the DB):
//                                said when a tear is warned of, when it opens,
//                                when it is held, and when it is lost.
//   creatures.realm_id           null for Talaran's own creatures; an invader's
//                                realm otherwise. Invaders live in no standing
//                                spot: a tear makes one for itself.
//   fighting_spots.world_event_id  the tear a spot belongs to. Set inactive when
//                                the tear closes, never deleted (fights point
//                                at it).
//   world_events                 an invasion is a world event of kind
//                                'invasion'. realm_id (the first realm sent,
//                                whose lines a tear onto two uses); warn_at (when the warning
//                                goes out, null for none); warned_at and
//                                opened_at (set by the sweep, once each);
//                                warning_text (the warning as sent, said at
//                                warn_at; the open line is announcement);
//                                min_kills (to place in the top three);
//                                rewards_paid_at (the top three's gold, paid
//                                once).
//   world_event_participation.last_at  when a player last added to their count:
//                                ties in the top three go to whoever got there
//                                first.
//   world_event_participation.invasion_xp  the XP a kill of every counted kill,
//                                summed: the top three are paid a fifth of it
//                                (the value rule's one kill's worth a kill).
//   invasion_rewards             the top three's gold, one row a player a tear.
//                                Its key is the gate (CLAUDE.md §4 rule 5): the
//                                payment inserts it and pays only what it
//                                inserted, so a retry after a crash, or two
//                                closers at once, pays nobody twice, and the
//                                event row is never held while players are
//                                locked (a settle locks the player first).
//   mod_permissions.can_run_events  a moderator who may send and run tears.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('realms'))) {
        await knex.schema.createTable('realms', (t) => {
            t.increments('id').primary();
            t.string('key', 50).notNullable().unique();
            t.string('name', 100).notNullable().unique();
            t.text('description').nullable();
            t.text('warning_line').notNullable();
            t.text('open_line').notNullable();
            t.text('held_line').notNullable();
            t.text('lost_line').notNullable();
            t.boolean('is_active').notNullable().defaultTo(true);
        });
    }

    if (!(await knex.schema.hasColumn('creatures', 'realm_id'))) {
        await knex.schema.alterTable('creatures', (t) => {
            t.integer('realm_id').nullable().references('id').inTable('realms').onDelete('SET NULL');
        });
    }

    if (!(await knex.schema.hasColumn('fighting_spots', 'world_event_id'))) {
        await knex.schema.alterTable('fighting_spots', (t) => {
            t.integer('world_event_id').nullable().references('id').inTable('world_events').onDelete('SET NULL');
            t.index(['world_event_id']);
        });
    }

    const eventColumns: [string, (t: Knex.AlterTableBuilder) => void][] = [
        ['realm_id', (t) => { t.integer('realm_id').nullable().references('id').inTable('realms').onDelete('SET NULL'); }],
        ['warn_at', (t) => { t.timestamp('warn_at', { useTz: true }).nullable(); }],
        ['warned_at', (t) => { t.timestamp('warned_at', { useTz: true }).nullable(); }],
        ['warning_text', (t) => { t.text('warning_text').nullable(); }],
        ['opened_at', (t) => { t.timestamp('opened_at', { useTz: true }).nullable(); }],
        ['min_kills', (t) => { t.integer('min_kills').nullable(); }],
        ['rewards_paid_at', (t) => { t.timestamp('rewards_paid_at', { useTz: true }).nullable(); }],
    ];
    for (const [column, add] of eventColumns) {
        if (!(await knex.schema.hasColumn('world_events', column))) await knex.schema.alterTable('world_events', add);
    }

    if (!(await knex.schema.hasColumn('world_event_participation', 'last_at'))) {
        await knex.schema.alterTable('world_event_participation', (t) => {
            t.timestamp('last_at', { useTz: true }).nullable();
        });
    }
    if (!(await knex.schema.hasColumn('world_event_participation', 'invasion_xp'))) {
        await knex.schema.alterTable('world_event_participation', (t) => {
            t.integer('invasion_xp').notNullable().defaultTo(0);
        });
    }

    if (!(await knex.schema.hasTable('invasion_rewards'))) {
        await knex.schema.createTable('invasion_rewards', (t) => {
            t.integer('event_id').notNullable().references('id').inTable('world_events').onDelete('CASCADE');
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.integer('place').notNullable();
            t.integer('kills').notNullable();
            t.integer('gold').notNullable();
            t.timestamp('paid_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.primary(['event_id', 'player_id']);
        });
        await knex.raw('ALTER TABLE invasion_rewards ADD CONSTRAINT invasion_rewards_place CHECK (place BETWEEN 1 AND 3)');
        await knex.raw('ALTER TABLE invasion_rewards ADD CONSTRAINT invasion_rewards_gold CHECK (gold >= 0)');
    }

    if (!(await knex.schema.hasColumn('mod_permissions', 'can_run_events'))) {
        await knex.schema.alterTable('mod_permissions', (t) => {
            t.boolean('can_run_events').defaultTo(false);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('mod_permissions', 'can_run_events')) {
        await knex.schema.alterTable('mod_permissions', (t) => { t.dropColumn('can_run_events'); });
    }
    await knex.schema.dropTableIfExists('invasion_rewards');
    for (const column of ['invasion_xp', 'last_at']) {
        if (await knex.schema.hasColumn('world_event_participation', column)) {
            await knex.schema.alterTable('world_event_participation', (t) => { t.dropColumn(column); });
        }
    }
    for (const column of ['rewards_paid_at', 'min_kills', 'opened_at', 'warning_text', 'warned_at', 'warn_at', 'realm_id']) {
        if (await knex.schema.hasColumn('world_events', column)) {
            await knex.schema.alterTable('world_events', (t) => { t.dropColumn(column); });
        }
    }
    if (await knex.schema.hasColumn('fighting_spots', 'world_event_id')) {
        await knex.schema.alterTable('fighting_spots', (t) => { t.dropColumn('world_event_id'); });
    }
    if (await knex.schema.hasColumn('creatures', 'realm_id')) {
        await knex.schema.alterTable('creatures', (t) => { t.dropColumn('realm_id'); });
    }
    await knex.schema.dropTableIfExists('realms');
}
