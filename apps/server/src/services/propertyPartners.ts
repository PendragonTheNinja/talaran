import db from '../db';
import { logger } from '../lib/logger';
import { SERVER_ERROR } from '../lib/serviceResult';
import { pushToPlayer } from '../lib/realtime';
import { trustOf } from '../lib/trust';
import { notifyInventoryChanged } from './inventory';
import { settleWards } from './husbandry';
import { moveIntoStorageWithin, moveOutOfStorageWithin, noteSharedMoveWithin, announceSharedChange } from './property';

// ── Shared houses (forum "Sharing Houses", 2026-11-15; Nathan, 2026-11-25) ──
//
// A homestead's owner names ONE other player as its partner. The partner may
// put into and take out of that homestead's storage, standing at it, and do
// nothing else there: the fields, pens, and building stay the owner's. Either
// may end it at any time, from anywhere: the owner by taking the name off,
// the partner by giving the key back. What is in store stays in store.
//
// Borrowed from the guild hall: a named outsider (guild_hall_hands) and a
// ledger of every move (guild_storage_ledger), so each of the two can see what
// the other did. The partner moves goods through the same locked helpers the
// owner's storage uses (services/property.ts); the partnership row is read
// FOR SHARE inside the move's transaction, so a partnership taken away mid-move
// either lands before the move or refuses it, never half of each.
//
// Only farmsteads are shared. A shop's back room is stock for sale, with its
// own escrow, and is not lent.
//
// Both must be trusted accounts (lib/trust.ts): sharing a store moves goods
// between accounts, as a trade does.

class ShareAbort extends Error {
    constructor(message: string, public status = 400) { super(message); }
}

type Ok<T> = { ok: true } & T;
type Refused = { ok: false; error: string; status: number };

function refuse(err: unknown, context: string): Refused {
    if (err instanceof ShareAbort) return { ok: false, error: err.message, status: err.status };
    if ((err as { code?: string })?.code === '23505') return { ok: false, error: 'This homestead is already shared with someone.', status: 409 };
    logger.error(`propertyPartners ${context}: ${err}`);
    return { ok: false, error: SERVER_ERROR, status: 500 };
}

/** How many ledger lines a shared store shows. */
const LEDGER_LINES = 50;

function asId(raw: unknown): number {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < 1) throw new ShareAbort('That is not a homestead.');
    return n;
}

async function ledgerOf(propertyId: number) {
    const rows = await db('property_storage_ledger as l').leftJoin('items as i', 'i.id', 'l.item_id')
        .where('l.property_id', propertyId).orderBy('l.id', 'desc').limit(LEDGER_LINES)
        .select('l.player_name', 'i.name as item', 'l.delta', 'l.created_at');
    return rows.map((r: any) => ({ player: r.player_name, item: r.item ?? 'something since lost', delta: Number(r.delta), at: r.created_at }));
}

/**
 * What the player shares and is shared: their own homestead here and its
 * partner, the homesteads here they hold a key to, and those elsewhere.
 */
export async function shareState(playerId: number) {
    const me = await db('players').where({ id: playerId }).first('current_location_id');
    const here = Number(me?.current_location_id);
    const own = await db('player_properties as p')
        .leftJoin('property_partners as pp', 'pp.property_id', 'p.id')
        .leftJoin('players as partner', 'partner.id', 'pp.partner_id')
        .join('locations as l', 'l.id', 'p.location_id')
        .where({ 'p.player_id': playerId, 'p.type': 'farmstead' })
        .orderBy('p.id')
        .select('p.id', 'p.location_id', 'l.name as location_name', 'partner.username as partner_name');
    const held = await db('property_partners as pp')
        .join('player_properties as p', 'p.id', 'pp.property_id')
        .join('players as owner', 'owner.id', 'p.player_id')
        .join('locations as l', 'l.id', 'p.location_id')
        .where('pp.partner_id', playerId)
        .orderBy('owner.username')
        .select('p.id', 'p.location_id', 'l.name as location_name', 'owner.username as owner_name');
    const ownHere = own.find((o: any) => Number(o.location_id) === here) ?? null;
    return {
        // The homestead the player owns here, if any, with its partner.
        ownHere: ownHere ? {
            propertyId: ownHere.id,
            partner: ownHere.partner_name ?? null,
            ledger: ownHere.partner_name ? await ledgerOf(ownHere.id) : [],
        } : null,
        // Every homestead the player owns that is shared, wherever it is.
        sharing: own.filter((o: any) => o.partner_name).map((o: any) => ({ propertyId: o.id, partner: o.partner_name, locationName: o.location_name })),
        // Keys the player holds to other people's homesteads.
        keys: held.map((h: any) => ({ propertyId: h.id, owner: h.owner_name, locationName: h.location_name, here: Number(h.location_id) === here })),
    };
}

/** Name a partner for the owner's homestead where they stand. */
export async function namePartner(ownerId: number, usernameRaw: unknown): Promise<Ok<{ name: string }> | Refused> {
    try {
        const username = typeof usernameRaw === 'string' ? usernameRaw.trim() : '';
        if (!username) throw new ShareAbort('Name the player you want to share this homestead with.');
        const me = await db('players').where({ id: ownerId }).first('current_location_id', 'username');
        const property = await db('player_properties')
            .where({ player_id: ownerId, location_id: me?.current_location_id, type: 'farmstead' }).first('id');
        if (!property) throw new ShareAbort('Stand at your homestead to share it.');
        const partner = await db('players').whereRaw('lower(username) = lower(?)', [username])
            .first('id', 'username', 'is_guest', 'email_verified_at', 'guest_expires_at');
        if (!partner) throw new ShareAbort(`There is nobody called ${username}.`);
        if (Number(partner.id) === ownerId) throw new ShareAbort('It is already yours.');
        if (!trustOf(partner).trusted) throw new ShareAbort(`${partner.username} cannot hold a key to someone else's homestead until their account is claimed.`);
        const existing = await db('property_partners as pp').join('players as p', 'p.id', 'pp.partner_id')
            .where('pp.property_id', property.id).first('p.username');
        if (existing) throw new ShareAbort(`This homestead is already shared with ${existing.username}. Take their name off first.`);
        // The unique key on property_id is the gate; two names at once, one wins (refuse() turns 23505 into a refusal).
        await db('property_partners').insert({ property_id: property.id, partner_id: partner.id });
        pushToPlayer(Number(partner.id), 'property_shared', { owner: me?.username, propertyId: property.id });
        return { ok: true, name: partner.username };
    } catch (err) {
        return refuse(err, 'namePartner');
    }
}

/**
 * End a partnership: the owner taking the name off, or the partner giving the
 * key back. Either may do it from anywhere.
 */
export async function endPartnership(playerId: number, propertyIdRaw: unknown): Promise<Ok<{}> | Refused> {
    try {
        const propertyId = asId(propertyIdRaw);
        const row = await db('property_partners as pp').join('player_properties as p', 'p.id', 'pp.property_id')
            .where('pp.property_id', propertyId).first('pp.id', 'p.player_id as owner', 'pp.partner_id as partner');
        if (!row || (Number(row.owner) !== playerId && Number(row.partner) !== playerId)) {
            throw new ShareAbort('That homestead is not shared with you.');
        }
        await db('property_partners').where({ id: row.id }).delete();
        const other = Number(row.owner) === playerId ? Number(row.partner) : Number(row.owner);
        pushToPlayer(other, 'property_shared', { propertyId, ended: true });
        pushToPlayer(other, 'property_storage_changed', { propertyId });
        return { ok: true };
    } catch (err) {
        return refuse(err, 'endPartnership');
    }
}

/** The shared store, for its partner standing at it, in getStorage's shape. */
export async function sharedStorage(playerId: number, propertyIdRaw: unknown) {
    const propertyId = asId(propertyIdRaw);
    const found = await db('property_partners as pp')
        .join('player_properties as p', 'p.id', 'pp.property_id')
        .join('players as owner', 'owner.id', 'p.player_id')
        .join('players as me', 'me.id', 'pp.partner_id')
        .where({ 'pp.property_id': propertyId, 'pp.partner_id': playerId })
        .first('p.id', 'p.type', 'p.storage_slots', 'p.location_id', 'owner.username as owner', 'me.current_location_id as here');
    if (!found) return { hasProperty: false as const, shared: true, slots: 0, used: 0, items: [] as any[] };
    if (Number(found.here) !== Number(found.location_id)) {
        return { hasProperty: false as const, shared: true, owner: found.owner, away: true, slots: 0, used: 0, items: [] as any[] };
    }
    const items = await db('property_storage')
        .join('items', 'property_storage.item_id', 'items.id')
        .where('property_storage.property_id', propertyId)
        .where('property_storage.quantity', '>', 0)
        .select('property_storage.item_id as itemId', 'property_storage.quantity as quantity', 'items.name as name', 'items.type as type', 'items.subtype as subtype')
        .orderBy('items.name', 'asc');
    return {
        hasProperty: true as const,
        shared: true,
        owner: found.owner,
        propertyId,
        propertyType: found.type,
        slots: found.storage_slots ?? 50,
        used: items.length,
        items,
        ledger: await ledgerOf(propertyId),
    };
}

/** A partner's move into or out of the shared store, standing at it. */
export async function sharedMove(playerId: number, propertyIdRaw: unknown, itemIdRaw: unknown, qtyRaw: unknown, dir: 'in' | 'out'): Promise<Ok<{ message: string }> | Refused> {
    try {
        const propertyId = asId(propertyIdRaw);
        const itemId = Math.floor(Number(itemIdRaw));
        const qty = Math.floor(Number(qtyRaw));
        if (!Number.isFinite(itemId) || itemId < 1) throw new ShareAbort('Unknown item.');
        if (!Number.isFinite(qty) || qty < 1) throw new ShareAbort('Move at least one.');

        const owner = await db('player_properties').where({ id: propertyId }).first('player_id', 'type');
        // A Larder Ward feeds the owner's pens from this store: settle it first,
        // as the owner's own deposit does (services/property.ts).
        if (owner?.type === 'farmstead') await settleWards(Number(owner.player_id));

        const moved = await db.transaction(async (trx) => {
            const share = await trx('property_partners').where({ property_id: propertyId, partner_id: playerId }).forShare().first('id');
            if (!share) throw new ShareAbort('That homestead is not shared with you.');
            const property = await trx('player_properties').where({ id: propertyId }).first('id', 'location_id', 'storage_slots', 'type');
            const me = await trx('players').where({ id: playerId }).first('current_location_id');
            if (!property || property.type !== 'farmstead') throw new ShareAbort('That homestead is not shared with you.');
            if (Number(me?.current_location_id) !== Number(property.location_id)) throw new ShareAbort('Stand at the homestead to use its store.');
            const r = dir === 'in'
                ? await moveIntoStorageWithin(trx, playerId, property, itemId, qty)
                : await moveOutOfStorageWithin(trx, playerId, property, itemId, qty);
            if (!r.ok) throw new ShareAbort(r.error);
            await noteSharedMoveWithin(trx, propertyId, playerId, itemId, dir === 'in' ? r.quantity : -r.quantity);
            return r;
        });
        notifyInventoryChanged(playerId);
        await announceSharedChange(propertyId, playerId);
        return { ok: true, message: `${dir === 'in' ? 'Stored' : 'Took'} ${moved.quantity} × ${moved.name}.` };
    } catch (err) {
        return refuse(err, 'sharedMove');
    }
}
