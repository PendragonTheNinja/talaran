import db from '../db';
import { logger } from '../lib/logger';
import { pushToPlayer } from '../lib/realtime';
import { getUnlocks } from './store';

// Pets (docs/pets-spec.md; Nathan, 2026-11-27/28): bragging rights only. One
// pet a skill, found on that skill's own actions at about 2,920 hours of it on
// average, never guaranteed and never counted toward; supporter pets given and
// taken back with the supporter steps; holiday pets sold in their season as a
// store unlock ('pet:<key>'). A worn pet shows beside the name.
//
// The roll is one random number per skill an action paid, against the pet's
// chance_one_in, made after the action has committed (gameTick
// emitActionComplete, which every action and every kill passes through). The
// first-find gate is the unique (player_id, pet_id) pair: two actions finishing
// together can both win the roll, and only one insert lands, so only one is
// ever announced.

interface PetRow {
    id: number; key: string; name: string; skill: string | null; kind: string;
    chance_one_in: number | null; supporter_cents: number | null; emoji: string;
    description: string; found_line: string | null;
}

let cache: { at: number; rows: PetRow[] } | null = null;
const CACHE_MS = 60_000;

/** The pet rows, re-read once a minute (staff may edit them as content). */
export async function allPets(): Promise<PetRow[]> {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
    const rows = await db('pets').where({ is_active: true }).orderBy('id');
    cache = { at: Date.now(), rows };
    return rows;
}

/** Every pet key this player has: found, given, or bought. */
export async function ownedPetKeys(playerId: number): Promise<string[]> {
    const [found, unlocks] = await Promise.all([
        db('player_pets as pp').join('pets as p', 'p.id', 'pp.pet_id').where('pp.player_id', playerId).pluck('p.key'),
        getUnlocks(playerId),
    ]);
    const bought = unlocks.filter(u => u.startsWith('pet:')).map(u => u.slice(4));
    return [...new Set([...found.map(String), ...bought])];
}

/**
 * Roll for the pet of each skill an action paid. Never throws: a failed roll
 * must not touch the action it followed.
 */
export async function rollPets(playerId: number, skills: string[], random: () => number = Math.random): Promise<void> {
    try {
        if (!skills.length) return;
        const pets = await allPets();
        for (const skill of new Set(skills)) {
            const pet = pets.find(p => p.kind === 'skill' && p.skill === skill && p.chance_one_in);
            if (!pet || random() * Number(pet.chance_one_in) >= 1) continue;
            await grantPet(playerId, pet, 'found');
        }
    } catch (err) {
        logger.error(`[pets] roll for player ${playerId} failed: ${err}`);
    }
}

/** Give a pet once; announce it only when this call was the one that gave it. */
async function grantPet(playerId: number, pet: PetRow, source: 'found' | 'supporter'): Promise<boolean> {
    const inserted = await db('player_pets').insert({ player_id: playerId, pet_id: pet.id, source })
        .onConflict(['player_id', 'pet_id']).ignore().returning('id');
    if (!inserted.length) return false;
    pushToPlayer(playerId, 'pet_found', { key: pet.key, name: pet.name, emoji: pet.emoji, source });
    if (source === 'found') {
        const player = await db('players').where({ id: playerId }).first('username');
        if (pet.found_line && player) {
            const { announceServer } = await import('./records');
            await announceServer(pet.found_line.replace(/\{player\}/g, player.username));
        }
        const { noteDeed } = await import('./chronicle');
        noteDeed(db, { kind: 'pet_found', playerId, subject: pet.key, data: { pet: pet.name.toLowerCase(), skill: pet.skill } });
        logger.info(`[pets] player ${playerId} found the ${pet.name}`);
    }
    return true;
}

/**
 * Bring a player's supporter pets into line with what they have given, as
 * their supporter badges are (services/supporter.ts syncSupporter). A pet no
 * longer earned is taken back, and comes off if it was worn.
 */
export async function syncSupporterPets(playerId: number, cents: number): Promise<void> {
    const pets = (await allPets()).filter(p => p.kind === 'supporter' && p.supporter_cents !== null);
    for (const pet of pets) {
        if (cents >= Number(pet.supporter_cents)) {
            await grantPet(playerId, pet, 'supporter');
        } else {
            const removed = await db('player_pets').where({ player_id: playerId, pet_id: pet.id, source: 'supporter' }).delete();
            if (removed) await db('players').where({ id: playerId, worn_pet: pet.key }).update({ worn_pet: null });
        }
    }
}

/** Every pet, with whether this player has it and when they got it. */
export async function petsFor(playerId: number) {
    const [pets, rows, owned, me] = await Promise.all([
        allPets(),
        db('player_pets').where({ player_id: playerId }).select('pet_id', 'found_at', 'source'),
        ownedPetKeys(playerId),
        db('players').where({ id: playerId }).first('worn_pet'),
    ]);
    const byId = new Map(rows.map((r: any) => [Number(r.pet_id), r]));
    const have = new Set(owned);
    return {
        worn: me?.worn_pet ?? null,
        pets: pets.map(p => ({
            key: p.key, name: p.name, skill: p.skill, kind: p.kind, emoji: p.emoji, description: p.description,
            owned: have.has(p.key),
            foundAt: byId.get(p.id)?.found_at ?? null,
        })),
    };
}

/** The pets a player has, for their profile: name, emoji, and when. */
export async function petsShownFor(playerId: number) {
    const all = await petsFor(playerId);
    return { worn: all.worn, pets: all.pets.filter(p => p.owned).map(({ key, name, emoji, skill, kind, foundAt }) => ({ key, name, emoji, skill, kind, foundAt })) };
}

/** Wear a pet the player has, or none. */
export async function wearPet(playerId: number, key: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
    if (key === null || key === undefined || key === '') {
        await db('players').where({ id: playerId }).update({ worn_pet: null });
        return { ok: true };
    }
    const k = String(key);
    if (!(await ownedPetKeys(playerId)).includes(k)) return { ok: false, error: 'You have not found that pet.' };
    await db('players').where({ id: playerId }).update({ worn_pet: k });
    return { ok: true };
}

/** key → emoji, for drawing worn pets beside names before their sprites exist. */
export async function petEmoji(): Promise<Map<string, string>> {
    return new Map((await allPets()).map(p => [p.key, p.emoji]));
}
