import type { Knex } from 'knex';

// The service, route and tick handlers are live, so Husbandry can come out of
// hiding. `is_implemented` is what the skills panel filters on.

export async function up(knex: Knex): Promise<void> {
    const updated = await knex('skills').where({ name: 'Husbandry' }).update({ is_implemented: true });
    if (!updated) throw new Error('Husbandry skill row not found — seeds/01_skills.ts has not run');
}

export async function down(knex: Knex): Promise<void> {
    await knex('skills').where({ name: 'Husbandry' }).update({ is_implemented: false });
}
