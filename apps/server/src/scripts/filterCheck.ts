/**
 * Checks the language filter (lib/wordFilter.ts) against the live word list:
 *
 *     pnpm filter:check                 tricks it must catch, words it must leave alone
 *     pnpm filter:check words.txt       also every word in a dictionary (one per line):
 *                                       anything changed that is not a listed word with
 *                                       an ending is a false positive to fix
 *
 * Run it after adding words in the admin content browser. A false positive is
 * fixed by marking the word not `embedded`, or by adding the innocent word to
 * filter_allow. A 274,000-word English list was used on 2026-11-07.
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import db from '../db';
import { compileFilter, filterText, nameRefusal, type FilterWord } from '../lib/wordFilter';

const MUST_CATCH = ['fuck', 'FUCK off', 'fuuuuck', 'f*ck', 'f**k', 'sh*t', 'fucked', 'motherfucker', 'fuckface', 'sh1t', 'b1tch', '$hit', 'a$$hole',
    'f u c k', 'f.u.c.k', 's-h-i-t', 'fцck', 'ѕhit', 'f​uck', 'shit!', 'bullshit', 'you dumbass', 'WTF', 'damn it', 'piss off'];
const MUST_REFUSE = ['n1gger', 'faggot', 'retard', 'kys'];
const MUST_PASS = ['Scunthorpe', 'classic', 'assassin', 'passing the cocktail', 'cumin and parsnips', 'Hancock', 'Dickens', 'Cockburn',
    'a chink in the armour', 'raccoon', 'cocoon', 'pass me the hatchet', 'scrap metal', 'Pakistan', 'spice rack', 'a cocky rooster',
    'he sniggered', 'swanky boots', 'shiitake', 'butterscotch', 'therapist', 'I will assess it', 'hell yes', 'Essex', 'Penistone', 'cockerel', 'grass', 'titmouse'];
const NAMES_REFUSED = ['xXfuckXx', 'ShitLord', 'Sh1tLord', 'Big Dick', 'n1gg3r'];
const NAMES_ALLOWED = ['Pendragon', 'Hancock', 'Dickens', 'Cassandra', 'Scunthorpe', 'Glasses', 'Bassist', 'Shiitake', 'Arsenal Fan'];

async function main() {
    const [words, subs, allow] = await Promise.all([
        db('filter_words').select('word', 'kind', 'embedded'),
        db('filter_substitutes').pluck('word'),
        db('filter_allow').pluck('word'),
    ]);
    const f = compileFilter(words as FilterWord[], subs.map(String), allow.map(String));
    let fails = 0;
    const bad = (m: string) => { fails++; console.log('FAIL ' + m); };
    for (const t of MUST_CATCH) { const r = filterText(f, t); if (r.text === t && !r.slurs.length) bad(`not caught: ${t}`); }
    for (const t of MUST_REFUSE) if (!filterText(f, t).slurs.length) bad(`not refused: ${t}`);
    for (const t of MUST_PASS) { const r = filterText(f, t); if (r.text !== t || r.slurs.length) bad(`changed: ${t} -> ${r.text}`); }
    for (const n of NAMES_REFUSED) if (!nameRefusal(f, n)) bad(`name allowed: ${n}`);
    for (const n of NAMES_ALLOWED) if (nameRefusal(f, n)) bad(`name refused: ${n}`);

    const dictPath = process.argv[2];
    if (dictPath) {
        const listed = words.map((w: any) => String(w.word).toLowerCase());
        const plain = (w: string) => listed.some((l: string) => new RegExp(`^${l}(s|es|ed|d|er|ers|ing|z)?$`).test(w));
        const dict = readFileSync(dictPath, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
        const odd = dict.filter(w => { const r = filterText(f, w); return (r.text !== w || r.slurs.length) && !plain(w.toLowerCase()); });
        console.log(`dictionary: ${dict.length} words; changed beyond the list itself: ${odd.length}`);
        for (const w of odd) console.log('  ' + w);
    }
    console.log(fails ? `${fails} failures` : 'filter:check passed');
    await db.destroy();
    process.exit(fails ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
