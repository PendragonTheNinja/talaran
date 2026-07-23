import type { Knex } from 'knex';

// The hoe is a real tool, not a pocket item — it must be EQUIPPED to till, the
// same way the hatchet gates woodcutting. Give it the mainhand slot.

export async function up(knex: Knex): Promise<void> {
    await knex('items').where({ name: 'Ambren Hoe' }).update({ slot: 'mainhand' });
}

export async function down(knex: Knex): Promise<void> {
    await knex('items').where({ name: 'Ambren Hoe' }).update({ slot: null });
}
