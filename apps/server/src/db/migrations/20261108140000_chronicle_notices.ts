import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The Chronicle, step 4 (docs/chronicle-spec.md §2 Elsewhere, §13).
//
//   players.chronicle_seen_day   the newest page whose "Wenna sang of you"
//                                notice this player has put away, so a player
//                                named while away hears of it at next login,
//                                once (services/chronicleBook.ts).
//   feats                        criterion kind 'chronicle_days': distinct days
//                                named in a page's own lines (the long roll
//                                does not count). Title for ten (locked).

const CATEGORY = 'Chronicle';

const FEATS = [
    { slug: 'set-down-in-the-tidings', name: 'Set Down in the Tidings', description: "Earn a line of your own in Wenna Halloway's tidings.", title: null, badge: null, badge_key: null, criterion_kind: 'chronicle_days', criterion_target: null, criterion_value: 1, is_hidden: false },
    { slug: 'sung-of-in-talador', name: 'Sung of in Talador', description: 'Earn a line in the tidings on ten different days.', title: 'Sung of in Talador', badge: null, badge_key: null, criterion_kind: 'chronicle_days', criterion_target: null, criterion_value: 10, is_hidden: false },
];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('players', 'chronicle_seen_day'))) {
        await knex.schema.alterTable('players', (t) => { t.string('chronicle_seen_day', 10).nullable(); });
    }
    if (!(await hasContent(knex))) return;
    for (const [i, f] of FEATS.entries()) {
        const row = { ...f, category: CATEGORY, display_order: 600 + i, is_active: true };
        const existing = await knex('feats').where({ slug: f.slug }).first();
        if (existing) await knex('feats').where({ id: existing.id }).update(row);
        else await knex('feats').insert(row);
    }
}

export async function down(knex: Knex): Promise<void> {
    const titles = FEATS.map(f => f.title).filter((t): t is string => !!t);
    if (titles.length) await knex('players').whereIn('worn_title', titles).update({ worn_title: null });
    await knex('feats').whereIn('slug', FEATS.map(f => f.slug)).delete();
    if (await knex.schema.hasColumn('players', 'chronicle_seen_day')) {
        await knex.schema.alterTable('players', (t) => { t.dropColumn('chronicle_seen_day'); });
    }
}
