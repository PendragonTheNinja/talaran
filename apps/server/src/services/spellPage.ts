import db from '../db';
import { castXp, spellCooldownWords, spellCostWords, spellIsLive, type SpellRow } from './spells';

// Spell pages: the Manual's page for one spell, beside the item pages.
//
// Spells are rows, not items, so the Manual's links (the Talar ledger names
// them next to stones and jewelry) landed on an empty item page. The item route
// falls back to this when no item has the name; spell and item names do not
// overlap (the writs are "Writ of …").

export interface SpellPage {
    kind: 'spell';
    name: string;
    description: string | null;
    level: number;
    cost: string;
    cast: string;
    xp: number;
    vigil: { minutes: number; offering: string | null; writ: string | null };
    /** Where it is taught: church and the place it stands. */
    taughtAt: { church: string; place: string }[];
}

export async function buildSpellPage(name: string): Promise<SpellPage | null> {
    const spell: SpellRow | undefined = await db('spells').whereRaw('lower(name) = lower(?)', [name]).where({ is_active: true }).first();
    if (!spell || !spellIsLive(spell.key)) return null;
    const churches = await db('churches as c').join('locations as l', 'l.id', 'c.location_id')
        .orderBy('c.name').select('c.name as church', 'l.name as place');
    const cast = spellCooldownWords(spell);
    return {
        kind: 'spell',
        name: spell.name,
        description: spell.description,
        level: spell.talar_level,
        cost: spellCostWords(spell),
        cast: cast.charAt(0).toUpperCase() + cast.slice(1),
        xp: castXp(spell),
        vigil: { minutes: spell.vigil_minutes, offering: spell.offering_item_name, writ: spell.writ_item_name },
        taughtAt: churches,
    };
}
