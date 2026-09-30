import db from '../db';
import { logger } from '../lib/logger';
import { SERVER_ERROR } from '../lib/serviceResult';
import { exhibitFor } from '../lib/museumPlacement';
import { takeItemsWithin, notifyInventoryChanged } from './inventory';
import { announceMuseumFirst } from './records';

// Island Museums (docs/WORLD-EVENTS-AND-MUSEUMS.md, Part 2).
//
// Everyone fills their own collection; the plaque on each case names who gave
// one first. Donating takes one of the item from the pack for good: the museum
// is a sink. Every item found on an island belongs in that island's museum,
// and a new item places itself the first time anyone finds it
// (placeNewItem, called from recordItemFirst).

export interface MuseumCase {
    caseId: number
    itemId: number
    name: string
    donated: boolean
    /** How many the player carries, so the panel can offer to donate. */
    held: number
    firstDonor: string | null
    firstDonatedAt: string | null
}

export interface MuseumExhibit {
    id: number
    name: string
    description: string | null
    cases: MuseumCase[]
    /** Islanders who have filled every case here. */
    completedBy: number
}

/**
 * Each case's plaque: its earliest donation. Donations to one case are made
 * under that case's row lock, so ids order them and the first is unique.
 */
function firstDonations() {
    return db('museum_donations').distinctOn('case_id').orderBy([{ column: 'case_id' }, { column: 'id' }])
        .select('case_id', 'player_id', 'donated_at');
}

/** The museum whose building the player stands in, if any. */
export async function museumHere(playerId: number): Promise<{ id: number; name: string } | null> {
    const player = await db('players').where({ id: playerId }).select('current_location_id').first();
    if (!player?.current_location_id) return null;
    return (await db('museums').where({ location_id: player.current_location_id }).select('id', 'name').first()) ?? null;
}

/** A museum as one player sees it: every case, theirs filled in, and the island's progress. */
export async function museumState(playerId: number, museumId: number) {
    const museum = await db('museums as m').leftJoin('locations as l', 'l.id', 'm.location_id')
        .where('m.id', museumId).select('m.id', 'm.name', 'm.island', 'l.name as town').first();
    if (!museum) return null;

    const exhibits = await db('museum_exhibits').where({ museum_id: museumId }).orderBy([{ column: 'display_order' }, { column: 'id' }]);
    const cases = await db('museum_cases as c')
        .join('museum_exhibits as e', 'e.id', 'c.exhibit_id')
        .join('items as i', 'i.id', 'c.item_id')
        .leftJoin(firstDonations().as('f'), 'f.case_id', 'c.id')
        .leftJoin('players as p', 'p.id', 'f.player_id')
        .leftJoin('museum_donations as d', function () {
            this.on('d.case_id', 'c.id').andOn('d.player_id', db.raw('?', [playerId]));
        })
        .leftJoin('player_inventory as inv', function () {
            this.on('inv.item_id', 'c.item_id').andOn('inv.player_id', db.raw('?', [playerId]));
        })
        .where('e.museum_id', museumId)
        .orderBy([{ column: 'c.display_order' }, { column: 'i.name' }])
        .select('c.id', 'c.exhibit_id', 'c.item_id', 'i.name', 'd.id as donation_id', 'inv.quantity as held',
            'p.username as first_donor', 'f.donated_at as first_donated_at');

    // Islanders who have filled each exhibit: players whose donations there
    // number the exhibit's cases.
    const completed = await db.raw(`
        SELECT e.id AS exhibit_id, count(*)::int AS players
        FROM museum_exhibits e
        JOIN (
            SELECT c.exhibit_id, d.player_id, count(*) AS n
            FROM museum_donations d JOIN museum_cases c ON c.id = d.case_id
            GROUP BY c.exhibit_id, d.player_id
        ) given ON given.exhibit_id = e.id
        WHERE e.museum_id = ?
          AND given.n = (SELECT count(*) FROM museum_cases c2 WHERE c2.exhibit_id = e.id)
        GROUP BY e.id`, [museumId]);
    const completedBy = new Map<number, number>(completed.rows.map((r: any) => [r.exhibit_id, r.players]));

    const shaped: MuseumExhibit[] = exhibits.map((e: any) => ({
        id: e.id,
        name: e.name,
        description: e.description,
        completedBy: completedBy.get(e.id) ?? 0,
        cases: cases.filter((c: any) => c.exhibit_id === e.id).map((c: any) => ({
            caseId: c.id, itemId: c.item_id, name: c.name,
            donated: c.donation_id !== null,
            held: Number(c.held ?? 0),
            firstDonor: c.first_donor ?? null,
            firstDonatedAt: c.first_donated_at ?? null,
        })),
    })).filter((e: MuseumExhibit) => e.cases.length > 0);

    const total = shaped.reduce((n, e) => n + e.cases.length, 0);
    const given = shaped.reduce((n, e) => n + e.cases.filter((c) => c.donated).length, 0);
    return { id: museum.id, name: museum.name, island: museum.island, town: museum.town, total, given, exhibits: shaped };
}

/** A refusal inside the donation: thrown so it rolls back, answered in words. */
class DonateAbort extends Error {}

/**
 * Give one of an item to its case. One transaction: the case row locked (so
 * exactly one donor is ever first), the donation recorded once per player,
 * and the item taken from the pack. Presence is checked here.
 */
export async function donate(playerId: number, caseIdRaw: unknown): Promise<
    { ok: true; name: string; first: boolean; museum: string } | { error: string }
> {
    const caseId = Math.floor(Number(caseIdRaw));
    if (!Number.isFinite(caseId) || caseId <= 0) return { error: 'There is no such case.' };
    try {
        const result = await db.transaction(async (trx) => {
            const theCase = await trx('museum_cases').where({ id: caseId }).forUpdate().first();
            if (!theCase) throw new DonateAbort('There is no such case.');
            const museum = await trx('museum_exhibits as e').join('museums as m', 'm.id', 'e.museum_id')
                .where('e.id', theCase.exhibit_id).select('m.id', 'm.name', 'm.location_id').first();
            const player = await trx('players').where({ id: playerId }).select('current_location_id').first();
            if (!museum || !player || player.current_location_id !== museum.location_id) {
                throw new DonateAbort(`You must be at the ${museum?.name ?? 'museum'} to give to it.`);
            }
            const item = await trx('items').where({ id: theCase.item_id }).select('name').first();

            // Under the case's lock: nobody else can be giving to it right now.
            const first = !(await trx('museum_donations').where({ case_id: caseId }).first());
            const [given] = await trx('museum_donations')
                .insert({ player_id: playerId, case_id: caseId })
                .onConflict(['player_id', 'case_id']).ignore()
                .returning('id');
            if (!given) throw new DonateAbort(`You have already given ${item.name} to the museum.`);

            const taken = await takeItemsWithin(trx, playerId, [{ name: item.name, quantity: 1 }]);
            if (!taken.ok) throw new DonateAbort(`You have no ${item.name} to give.`);

            return { name: item.name as string, first, museum: museum.name as string };
        });
        notifyInventoryChanged(playerId);
        if (result.first) await announceMuseumFirst(playerId, result.name, result.museum);
        return { ok: true, ...result };
    } catch (err) {
        if (err instanceof DonateAbort) return { error: err.message };
        logger.error(`[museum] donate failed for player ${playerId}, case ${caseId}: ${err}`);
        return { error: SERVER_ERROR };
    }
}

/**
 * A new item found for the first time anywhere is added to the museum of the
 * island it was found on, on the exhibit its kind belongs to, at the end.
 * Nothing happens if it already has a case (in any museum), is gold or
 * inactive, came only from a quest, or the island has no museum yet.
 */
export async function placeNewItem(itemId: number, playerId: number, source?: string | null): Promise<void> {
    try {
        if (source === 'quest') return;
        const item = await db('items').where({ id: itemId }).first();
        if (!item || !item.is_active || item.name === 'Gold') return;
        if (await db('museum_cases').where({ item_id: itemId }).first()) return;
        const where = await db('players as p').join('locations as l', 'l.id', 'p.current_location_id')
            .where('p.id', playerId).select('l.region').first();
        const museum = where?.region ? await db('museums').where({ island: where.region }).first() : null;
        if (!museum) return;
        const exhibits = await db('museum_exhibits').where({ museum_id: museum.id });
        const exhibitId = exhibitFor(item, exhibits);
        if (exhibitId === null) return;
        const [{ max }] = await db('museum_cases').where({ exhibit_id: exhibitId }).max('display_order as max');
        await db('museum_cases')
            .insert({ exhibit_id: exhibitId, item_id: itemId, display_order: Number(max ?? -1) + 1 })
            .onConflict('item_id').ignore();
        logger.info(`[museum] ${item.name} placed in ${museum.name}`);
    } catch (err) {
        // Bookkeeping, like the firsts it rides on: never let it break an award.
        logger.error(`[museum] placing item ${itemId} failed: ${err}`);
    }
}
