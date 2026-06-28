import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('travel_log', (t) => {
        t.increments('id').primary()
        t.integer('player_id').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE')
        t.string('from_location').notNullable()
        t.string('to_location').notNullable()
        t.string('skill_name').notNullable()        // Agility / Equitation / Sailing — how they traveled
        t.text('events').notNullable()              // JSON array of { message, itemName, quantity }
        t.timestamp('created_at').defaultTo(knex.fn.now())
        t.index(['player_id', 'created_at'])        // fast "newest per player" + pruning
    })
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('travel_log')
}