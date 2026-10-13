import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Combat feats (Nathan, 2026-10-13). Upserted by slug.
//
// Three new criterion kinds, measured in services/feats.ts:
//   combat_level   combat level (the rounded average of the three combat skills)
//   bestiary_one   the most kills of any one creature, against criterion_value
//                  (1,000 is the Bestiary's last step: mastery)
//   bestiary_all   creatures with at least criterion_target kills, against
//                  every creature in the world today. A creature added later
//                  raises the bar for those still working on it; anyone who
//                  earned it keeps it.
//
// Kills and deaths were already counted (player_stats.total_creatures_killed,
// total_combat_deaths). Badge keys are the slug, as the masteries' are; the
// art goes in apps/client/public/images/badges/<key>.png.

const CATEGORY = 'Combat';

const FEATS = [
    { slug: 'the-thousandth', name: 'The Thousandth', description: 'Bring down a thousand creatures.', title: null, badge: null, badge_key: null, criterion_kind: 'stat', criterion_target: 'total_creatures_killed', criterion_value: 1000, is_hidden: false },
    { slug: 'ten-thousand-fallen', name: 'Ten Thousand Fallen', description: 'Bring down ten thousand creatures. The Docks are noticeably quieter.', title: null, badge: null, badge_key: null, criterion_kind: 'stat', criterion_target: 'total_creatures_killed', criterion_value: 10000, is_hidden: false },
    { slug: 'the-long-walk-back', name: 'The Long Walk Back', description: 'Fall in a fight, and walk back for your things.', title: null, badge: null, badge_key: null, criterion_kind: 'stat', criterion_target: 'total_combat_deaths', criterion_value: 1, is_hidden: true },
    { slug: 'blooded', name: 'Blooded', description: 'Reach combat level 10.', title: null, badge: null, badge_key: null, criterion_kind: 'combat_level', criterion_target: null, criterion_value: 10, is_hidden: false },
    { slug: 'seasoned', name: 'Seasoned', description: 'Reach combat level 25.', title: null, badge: null, badge_key: null, criterion_kind: 'combat_level', criterion_target: null, criterion_value: 25, is_hidden: false },
    { slug: 'old-soldier', name: 'Old Soldier', description: 'Reach combat level 50.', title: null, badge: null, badge_key: null, criterion_kind: 'combat_level', criterion_target: null, criterion_value: 50, is_hidden: false },
    { slug: 'shield-of-talaran', name: 'Shield of Talaran', description: 'Reach combat level 100.', title: 'the Warden', badge: '⚔', badge_key: 'shield-of-talaran', criterion_kind: 'combat_level', criterion_target: null, criterion_value: 100, is_hidden: false },
    { slug: 'every-scar-accounted-for', name: 'Every Scar Accounted For', description: 'Learn all there is to know about one creature.', title: null, badge: null, badge_key: null, criterion_kind: 'bestiary_one', criterion_target: null, criterion_value: 1000, is_hidden: false },
    { slug: 'the-full-tally', name: 'The Full Tally', description: 'Bring down a hundred of every creature in the Bestiary.', title: null, badge: null, badge_key: null, criterion_kind: 'bestiary_all', criterion_target: '100', criterion_value: 0, is_hidden: false },
    { slug: 'nothing-left-unwritten', name: 'Nothing Left Unwritten', description: 'Learn all there is to know about every creature in the Bestiary.', title: 'the Bestiarist', badge: '📖', badge_key: 'nothing-left-unwritten', criterion_kind: 'bestiary_all', criterion_target: '1000', criterion_value: 0, is_hidden: false },
];

export async function up(knex: Knex): Promise<void> {
    // Feats are content: a fresh database gets them from content:import.
    if (!(await hasContent(knex))) return;
    for (const [i, f] of FEATS.entries()) {
        const row = { ...f, category: CATEGORY, display_order: 500 + i, is_active: true };
        const existing = await knex('feats').where({ slug: f.slug }).first();
        if (existing) await knex('feats').where({ id: existing.id }).update(row);
        else await knex('feats').insert(row);
    }
}

export async function down(knex: Knex): Promise<void> {
    const slugs = FEATS.map(f => f.slug);
    const keys = FEATS.map(f => f.badge_key).filter((k): k is string => !!k);
    // Nobody wears a badge or title that no longer exists.
    if (keys.length) await knex('players').whereIn('worn_badge', keys).update({ worn_badge: null });
    const titles = FEATS.map(f => f.title).filter((t): t is string => !!t);
    if (titles.length) await knex('players').whereIn('worn_title', titles).update({ worn_title: null });
    await knex('feats').whereIn('slug', slugs).delete();
}
