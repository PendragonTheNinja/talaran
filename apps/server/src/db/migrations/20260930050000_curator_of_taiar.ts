import type { Knex } from 'knex';

// Curator of Taiar (docs/WORLD-EVENTS-AND-MUSEUMS.md, step 5): every case in
// the Taiar Museum filled. A new criterion kind, 'museum_complete', whose
// target is the museum's key; the number of cases is read from the museum
// each time (services/feats.ts), so it rises as new items are first found and
// no migration is needed to keep it honest. Once earned, it is kept.
//
// The badge falls back to its glyph until /images/badges/curator-of-taiar.png exists.

const FEAT = {
    slug: 'curator-of-taiar', name: 'Curator of Taiar',
    description: 'Fill every case in the Taiar Museum.',
    title: 'Curator of Taiar', badge: '⚱', badge_key: 'curator-of-taiar',
    criterion_kind: 'museum_complete', criterion_target: 'taiar', criterion_value: 0,
    category: 'Collections', is_hidden: false, display_order: 400,
};

export async function up(knex: Knex): Promise<void> {
    if (!await knex('feats').where({ slug: FEAT.slug }).first()) await knex('feats').insert(FEAT);
}

export async function down(knex: Knex): Promise<void> {
    const feat = await knex('feats').where({ slug: FEAT.slug }).first();
    if (!feat) return;
    await knex('players').where({ worn_title: FEAT.title }).update({ worn_title: null });
    await knex('players').where({ worn_badge: FEAT.badge_key }).update({ worn_badge: null });
    await knex('player_feats').where({ feat_id: feat.id }).delete();
    await knex('feats').where({ id: feat.id }).delete();
}
