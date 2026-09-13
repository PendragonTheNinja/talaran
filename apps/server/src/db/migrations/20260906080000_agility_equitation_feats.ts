import type { Knex } from 'knex';

/**
 * Agility and Equitation were left out.
 *
 * Both are live and implemented, and players have been levelling them since
 * long before feats existed. They had no apprentice feat, no mastery feat and
 * no badge, which made the Mastery category quietly wrong: it claimed to cover
 * every trade and covered eleven of thirteen.
 *
 * It also broke the breadth ladder. "Every Trade in Talaran" asked for fifty in
 * eleven skills, so it could be earned while two were untouched.
 *
 * THIRTEEN is the number now. Combat adds four more and Sailing, Thieving,
 * Exploration and Talar are still to come, so this will need revisiting; the
 * count lives in one row rather than in code, which is the reason that is an
 * edit and not a release.
 */

const NEW_FEATS = [
    {
        slug: 'apprentice-runner', name: 'Apprentice Runner',
        description: 'Reach Agility 25.', title: null, badge: null, badge_key: null,
        criterion_kind: 'skill', criterion_target: 'Agility', criterion_value: 25,
        category: 'Mastery', is_hidden: false, display_order: 111,
    },
    {
        slug: 'apprentice-rider', name: 'Apprentice Rider',
        description: 'Reach Equitation 25.', title: null, badge: null, badge_key: null,
        criterion_kind: 'skill', criterion_target: 'Equitation', criterion_value: 25,
        category: 'Mastery', is_hidden: false, display_order: 112,
    },
    {
        slug: 'master-runner', name: 'Master of the Road',
        description: 'Reach Agility 100.', title: 'Master of the Road',
        // Not the stockman's flower, which is already taken.
        badge: '❈', badge_key: 'master-runner',
        criterion_kind: 'skill', criterion_target: 'Agility', criterion_value: 100,
        category: 'Mastery', is_hidden: false, display_order: 131,
    },
    {
        slug: 'master-rider', name: 'Master of the Saddle',
        description: 'Reach Equitation 100.', title: 'Master of the Saddle',
        badge: '⚘', badge_key: 'master-rider',
        criterion_kind: 'skill', criterion_target: 'Equitation', criterion_value: 100,
        category: 'Mastery', is_hidden: false, display_order: 132,
    },
];

export async function up(knex: Knex): Promise<void> {
    for (const feat of NEW_FEATS) {
        const existing = await knex('feats').where({ slug: feat.slug }).first();
        if (!existing) await knex('feats').insert(feat);
    }

    // Thirteen trades, not eleven.
    await knex('feats').where({ slug: 'every-trade-in-talaran' }).update({
        criterion_value: 13,
        description: 'Reach level 50 in all thirteen trades.',
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex('feats').whereIn('slug', NEW_FEATS.map(f => f.slug)).delete();
    await knex('feats').where({ slug: 'every-trade-in-talaran' }).update({
        criterion_value: 11,
        description: 'Reach level 50 in every trade there is.',
    });
}
