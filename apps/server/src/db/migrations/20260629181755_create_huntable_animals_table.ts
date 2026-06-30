import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('huntable_animals', (t) => {
        t.increments('id').primary()
        t.integer('location_id').unsigned().notNullable()
            .references('id').inTable('locations').onDelete('CASCADE')
        t.string('name', 100).notNullable()
        t.integer('required_level').notNullable().defaultTo(1)
        t.integer('base_timer').notNullable()          // total hunt seconds
        t.integer('min_timer').notNullable()           // floor after level reduction
        t.integer('base_catch_chance').notNullable()   // % at required level (e.g. 70)
        t.integer('xp_success').notNullable()
        t.integer('xp_failure').notNullable()
        t.text('drop_table').notNullable()             // JSON: [{ itemName, min, max, chance }]
        t.boolean('is_active').defaultTo(true)
        t.timestamps(true, true)
    })
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('huntable_animals')
}