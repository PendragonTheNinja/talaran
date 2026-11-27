import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Tears in the Chronicle and the feats (docs/invasions-spec.md §6).
//
//   invasion_held   noted when a tear's last kill closes it (services/invasions.ts
//                   finishTear), about whoever killed most: {player}, {place},
//                   {realm} (a slot of its own since this pass), {n} their kills.
//   invasion_lost   noted when a tear closes on its own with fighters there; it
//                   names nobody. Written kindly (chronicle-spec §6).
//   Feats           tears_held (held tears a player placed in), tears_first
//                   (tears they topped), invaders_all (one of every invader in
//                   the world today), measured in services/feats.ts.

const KINDS = [
    { key: 'invasion_held', section: 'island', base_weight: 40, max_per_page: 3, enabled: true, label: 'A tear held (top killer)' },
    { key: 'invasion_lost', section: 'island', base_weight: 15, max_per_page: 2, enabled: true, label: 'A tear lost' },
];

const VERSES: { kind: string; text: string }[] = [
    { kind: 'invasion_held', text: 'A tear opened over {place}, and {player} stood in front of it until it closed, with {n} kills to show for it.' },
    { kind: 'invasion_held', text: '{realm} sent its worst through the sky over {place}. {player} sent most of it back.' },
    { kind: 'invasion_held', text: 'The tear over {place} is shut. Ask anyone there who did the most, and they will point at {player}.' },
    { kind: 'invasion_held', text: '{player} brought down {n} of them at {place} before the air went still again.' },
    { kind: 'invasion_held', text: 'There was a hole in the sky over {place} today. It is mended now, and {player} did the most mending.' },
    { kind: 'invasion_held', text: 'They held {place}. {player} held it hardest.' },
    { kind: 'invasion_held', text: 'When the tear over {place} closed, the ground was littered with what had come through, and {player} had put {n} of them there.' },
    { kind: 'invasion_held', text: '{place} kept its own today. {player} saw to {n} of the things that tried to take it.' },
    { kind: 'invasion_held', text: 'The folk of {place} will be buying {player} a drink for a while yet. {n} kills, and the tear shut behind the last.' },
    { kind: 'invasion_held', text: 'Whatever lives on the far side of the tear over {place} has learned the name {player}, or ought to have.' },

    { kind: 'invasion_lost', text: 'A tear opened over {place} and closed again in its own time, and most of what came through went back the way it came.' },
    { kind: 'invasion_lost', text: '{place} did not hold. The tear shut on its own, and the far side kept what it had sent.' },
    { kind: 'invasion_lost', text: 'The tear over {place} outlasted the folk who stood against it. It closed at last and took its horde home.' },
    { kind: 'invasion_lost', text: 'Nobody drove the horde back at {place}. The sky closed over it anyway, which is a mercy and nothing more.' },
    { kind: 'invasion_lost', text: '{realm} came through over {place} and went back when it pleased. Next time, more swords.' },
    { kind: 'invasion_lost', text: 'They fought at {place} until the tear gave up of its own accord. Not a rout, Wenna says. Not a win either.' },
    { kind: 'invasion_lost', text: 'The tear over {place} closed on a field still full of strangers, and the strangers went with it.' },
    { kind: 'invasion_lost', text: 'There were not enough hands at {place}. The tear shut by itself, and the town went out to count its fences.' },
    { kind: 'invasion_lost', text: 'Something from far off walked {place} today, and nobody quite saw it off. The air is quiet again now.' },
    { kind: 'invasion_lost', text: 'The horde at {place} thinned but never broke. When the tear closed, the rest stepped back through as if they had somewhere to be.' },

    // Wenna's tab, before the page is set: no names (chronicle-spec §8).
    { kind: 'today:invasion_held', text: 'Word from {place}: the tear there is shut, and the town is buying drinks.' },
    { kind: 'today:invasion_held', text: 'They held {place} this afternoon. I am told it was loud.' },
    { kind: 'today:invasion_held', text: 'The sky over {place} is whole again. Somebody there did a great deal of work.' },
    { kind: 'today:invasion_lost', text: 'The tear over {place} closed by itself. Nobody is boasting about it.' },
    { kind: 'today:invasion_lost', text: 'Whatever came through at {place} has gone home. I would not ask the folk there about it yet.' },
    { kind: 'today:invasion_lost', text: '{place} is quiet again. Quiet is not the same as won.' },
];

/** The slots a verse names, as the Chronicle's verse migrations record them. */
function needs(text: string): string[] {
    return [...new Set([...text.matchAll(/\{([a-z0-9 ]+)\}/g)].map(m => m[1].replace(/^a /, '')))];
}

const CATEGORY = 'Combat';
const FEATS = [
    { slug: 'held-the-line', name: 'Held the Line', description: 'Stand at a tear until it closes, and bring down your share of what came through.', title: null, badge: null, badge_key: null, criterion_kind: 'tears_held', criterion_target: null, criterion_value: 1, is_hidden: false },
    { slug: 'ten-tears-mended', name: 'Ten Tears Mended', description: 'Help hold ten tears.', title: null, badge: null, badge_key: null, criterion_kind: 'tears_held', criterion_target: null, criterion_value: 10, is_hidden: false },
    { slug: 'the-mender', name: 'The Mender', description: 'Help hold fifty tears. The sky owes you a good deal.', title: 'the Mender', badge: '🌀', badge_key: 'the-mender', criterion_kind: 'tears_held', criterion_target: null, criterion_value: 50, is_hidden: false },
    { slug: 'top-of-the-tally', name: 'Top of the Tally', description: 'Bring down more at a tear than anyone else there.', title: null, badge: null, badge_key: null, criterion_kind: 'tears_first', criterion_target: null, criterion_value: 1, is_hidden: false },
    { slug: 'between-worlds', name: 'Between Worlds', description: 'Bring down one of every creature that has come through a tear.', title: null, badge: null, badge_key: null, criterion_kind: 'invaders_all', criterion_target: '1', criterion_value: 0, is_hidden: false },
];

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;

    for (const k of KINDS) {
        await knex('chronicle_deed_kinds').insert(k).onConflict('key').merge();
    }
    for (const v of VERSES) {
        const had = await knex('chronicle_verses').where({ kind: v.kind, text: v.text }).first('id');
        if (!had) await knex('chronicle_verses').insert({ kind: v.kind, text: v.text, needs: needs(v.text), enabled: true });
    }
    for (const [i, f] of FEATS.entries()) {
        const row = { ...f, category: CATEGORY, display_order: 520 + i, is_active: true };
        const existing = await knex('feats').where({ slug: f.slug }).first('id');
        if (existing) await knex('feats').where({ id: existing.id }).update(row);
        else await knex('feats').insert(row);
    }
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    const keys = FEATS.map(f => f.badge_key).filter((k): k is string => !!k);
    if (keys.length) await knex('players').whereIn('worn_badge', keys).update({ worn_badge: null });
    const titles = FEATS.map(f => f.title).filter((t): t is string => !!t);
    if (titles.length) await knex('players').whereIn('worn_title', titles).update({ worn_title: null });
    await knex('feats').whereIn('slug', FEATS.map(f => f.slug)).delete();
    for (const v of VERSES) await knex('chronicle_verses').where({ kind: v.kind, text: v.text }).delete();
    // The kinds stay switched off: deeds already noted point at them.
    await knex('chronicle_deed_kinds').whereIn('key', KINDS.map(k => k.key)).update({ enabled: false });
}
