import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Quank, counted (docs/islets-plan.md §6a; Nathan, 2026-11-15 and 17): a feat
// for each island's Quank, and a line in Wenna's tidings when he is met.
//
//   feats 'quank_met'      criterion_target is the island; earned once
//                          player_quank_met holds a row for it. Hidden, and
//                          not told as a feat_rare deed: the deed below says it.
//   'quank_seen'           a Chronicle deed kind (services/isletFinds.ts notes it
//                          after the landing commits), with ten verses.
//
// The quiet count for bad luck needs no table: a landing among an island's
// islets is already counted (player_islets_found.landings), and once a player
// has made QUANK_OWED_LANDINGS there without meeting him, he is there on the
// next (services/isletFinds.ts).

const FEATS = [
    {
        slug: 'quank-taiar', name: 'Not Leaving the Square',
        description: 'Find Quank somewhere he says he is not, out among the islets off Taiar.',
        title: null, badge: null, badge_key: null,
        criterion_kind: 'quank_met', criterion_target: 'Taiar Island', criterion_value: 1,
        is_hidden: true, chronicle: false,
    },
];
const CATEGORY = 'Odd Corners';

const KIND = { key: 'quank_seen', section: 'island', base_weight: 35, max_per_page: 2, label: 'Quank met on the islets' };

const VERSES = [
    '{player} swears they saw Quank out on the islets off {island}. Quank, asked, says he has not left the square.',
    'Quank was seen fishing off one of the islets of {island} by {player}. He was also seen in the square all day. Wenna has stopped trying to make this add up.',
    '{player} came back from the islets with half a Tiddle and a story about Quank. The Tiddle, at least, is real.',
    'Out past the shore of {island}, {player} found Quank on an upturned bucket. Nobody else was there to see it, which is how Quank likes it.',
    '{player} says Quank gave them a tidbit at sea. Quank says he did no such thing, and then asked whether they still had it.',
    'Another sighting of Quank where Quank cannot possibly be: {player}, on the islets off {island}.',
    '{player} found Quank among the islets of {island} today. Wenna has written it down and will say no more about it.',
    'Ask {player} about Quank on the islets. Then ask Quank. Then decide which of them you believe.',
    '{player} rowed out to the islets of {island} and found Quank already there, fishing with no line on the rod. He did not explain. He never does.',
    'If you are missing half a Tiddle, {player} may know where it went. Quank certainly does.',
];

export async function up(knex: Knex): Promise<void> {
    await knex('chronicle_deed_kinds').insert(KIND).onConflict('key').merge();
    if (!(await hasContent(knex))) return;

    await knex('chronicle_verses').where({ kind: KIND.key }).delete();
    await knex('chronicle_verses').insert(VERSES.map(text => ({
        kind: KIND.key, text, needs: [...new Set((text.match(/\{(\w+)\}/g) ?? []).map(t => t.slice(1, -1)))], enabled: true,
    })));

    const [{ max }] = await knex('feats').where({ category: CATEGORY }).max('display_order as max');
    for (const [i, f] of FEATS.entries()) {
        const row = { ...f, category: CATEGORY, display_order: Number(max ?? 300) + 1 + i, is_active: true };
        const existing = await knex('feats').where({ slug: f.slug }).first('id', 'display_order');
        if (existing) await knex('feats').where({ id: existing.id }).update({ ...row, display_order: existing.display_order });
        else await knex('feats').insert(row);
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await hasContent(knex)) {
        const ids = await knex('feats').whereIn('slug', FEATS.map(f => f.slug)).pluck('id');
        if (ids.length) {
            await knex('player_feats').whereIn('feat_id', ids).delete();
            await knex('feats').whereIn('id', ids).delete();
        }
        await knex('chronicle_verses').where({ kind: KIND.key }).delete();
    }
    await knex('chronicle_deeds').where({ kind: KIND.key }).delete();
    await knex('chronicle_deed_kinds').where({ key: KIND.key }).delete();
}
