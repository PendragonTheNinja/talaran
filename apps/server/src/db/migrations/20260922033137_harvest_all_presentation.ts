import type { Knex } from 'knex';

/**
 * What the scene says while every ripe field is brought in at once.
 *
 * One row in action_presentation, keyed like the other farming sub-actions.
 * Without it the action still works — the lookup falls back to the farming
 * default and a plain Stop — but it would read "You set to work on the land"
 * for a job that deserves its own sentence.
 */

const ROW = {
    action_type: 'farming',
    kind: 'harvest_all',
    scene_text: 'You work the fields one after another, filling basket after basket.',
    cancel_label: 'Stop Harvesting',
};

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('action_presentation'))) {
        throw new Error('harvest_all_presentation: action_presentation does not exist. Run 20260919014211 first.');
    }
    const existing = await knex('action_presentation')
        .where({ action_type: ROW.action_type, kind: ROW.kind }).first();
    if (existing) {
        await knex('action_presentation').where({ id: existing.id })
            .update({ scene_text: ROW.scene_text, cancel_label: ROW.cancel_label, updated_at: knex.fn.now() });
    } else {
        await knex('action_presentation').insert(ROW);
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex('action_presentation').where({ action_type: ROW.action_type, kind: ROW.kind }).delete();
}
