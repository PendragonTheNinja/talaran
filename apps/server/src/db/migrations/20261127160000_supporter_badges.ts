import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Supporter badges (docs/taler-perks-ideas.md; Nathan, 2026-11-27): given by
// what a player has given in all, $5, $20, $50, $100, and $1,000, never sold.
// Feat rows of category 'Supporter' so every surface that draws a worn badge
// draws these; criterion_value is the threshold in US cents. services/supporter.ts
// grants and takes them back (a refund below a step), and the Feats list leaves
// them out. Badge art goes in apps/client/public/images/badges/<badge_key>.png;
// until then the glyph stands in, as it does for every feat badge.

const STEPS = [
    { slug: 'supporter-5', name: 'Friend of Talaran', cents: 500, badge: '🕯', description: 'Given to those who have supported Talaran with five dollars or more.' },
    { slug: 'supporter-20', name: 'Patron of Talaran', cents: 2000, badge: '🏮', description: 'Given to those who have supported Talaran with twenty dollars or more.' },
    { slug: 'supporter-50', name: 'Benefactor of Talaran', cents: 5000, badge: '🛡', description: 'Given to those who have supported Talaran with fifty dollars or more.' },
    { slug: 'supporter-100', name: 'Steward of Talaran', cents: 10000, badge: '👑', description: 'Given to those who have supported Talaran with a hundred dollars or more.' },
    { slug: 'supporter-1000', name: 'Pillar of Talaran', cents: 100000, badge: '🌟', description: 'Given to those who have supported Talaran with a thousand dollars or more.' },
];

export async function up(knex: Knex): Promise<void> {
    // Feats are content: a fresh database gets them from content:import.
    if (!(await hasContent(knex))) return;
    for (const [i, s] of STEPS.entries()) {
        const row = {
            slug: s.slug, name: s.name, description: s.description, title: null,
            badge: s.badge, badge_key: s.slug,
            criterion_kind: 'supporter', criterion_target: null, criterion_value: s.cents,
            category: 'Supporter', is_hidden: true, display_order: 900 + i, is_active: true,
        };
        const had = await knex('feats').where({ slug: s.slug }).first('id');
        if (had) await knex('feats').where({ id: had.id }).update(row);
        else await knex('feats').insert(row);
    }
}

export async function down(knex: Knex): Promise<void> {
    const slugs = STEPS.map(s => s.slug);
    await knex('players').whereIn('worn_badge', slugs).update({ worn_badge: null });
    await knex('feats').whereIn('slug', slugs).delete();
}
