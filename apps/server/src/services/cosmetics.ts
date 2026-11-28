import db from '../db';
import { STORE_ITEMS, getUnlocks, hasUnlock, type SaleWindow } from './store';

// Supporter cosmetics (docs/taler-perks-ideas.md; Nathan, 2026-11-28): avatar
// frames, profile backdrops, shop signs and awnings, chat emotes, and bell
// packs. Each is a list here, turned into store items below, so a new frame or
// bell is one line. None of them does anything but look or sound different.
//
// The art arrives separately. Every picture and sound is a file at a fixed path
// (docs/art-list.md); until it exists, the client falls back to something
// drawn in CSS or to the default bell, so a purchase is never a broken image.

export interface Cosmetic {
    key: string;          // the part after the prefix: 'knotwork'
    name: string;
    description: string;
    price: number;        // Talers
    onSale?: SaleWindow;  // seasonal
}

/** Avatar frames: client draws /images/frames/<key>.png over the avatar. */
export const FRAMES: Cosmetic[] = [
    { key: 'knotwork', name: 'Knotwork Frame', description: 'Interlaced knotwork carved in dark wood, around your portrait.', price: 300 },
    { key: 'gilt', name: 'Gilt Frame', description: 'Gold leaf and corner flourishes, as a portrait in a great hall would have.', price: 400 },
    { key: 'driftwood', name: 'Driftwood Frame', description: 'Sea-gray driftwood lashed with rope at the corners.', price: 300 },
    { key: 'iron', name: 'Iron Frame', description: 'Black iron bands and rivets, forged rather than carved.', price: 300 },
    { key: 'holly', name: 'Holly Frame', description: 'A wreath of holly and red berries. Sold through December.', price: 300, onSale: { from: '12-01', until: '12-31' } },
    { key: 'annwn', name: 'Otherworld Frame', description: 'Pale bone and silver with a faint blue-green light.', price: 400 },
];

/** Profile backdrops: /images/backdrops/<key>.jpg behind the top of a profile. */
export const BACKDROPS: Cosmetic[] = [
    { key: 'harbor-dusk', name: 'Harbor at Dusk', description: 'Masts and lamplight on still water, behind your profile.', price: 300 },
    { key: 'forest-edge', name: 'Forest Edge', description: 'Where the trees give way to open fields.', price: 300 },
    { key: 'castle-hill', name: 'Castle on the Hill', description: 'Stone walls high above a valley.', price: 300 },
    { key: 'market-square', name: 'Market Square', description: 'Stalls, awnings, and a crowd on market day.', price: 300 },
    { key: 'tapestry-hunt', name: 'Tapestry Hunt', description: 'A hunting scene woven in wool and gold thread.', price: 300 },
    { key: 'sea-chart', name: 'Sea Chart', description: 'An old chart of coasts and compass roses.', price: 300 },
    { key: 'winter-village', name: 'Winter Village', description: 'Snow on thatched roofs and smoke from every chimney.', price: 300 },
    { key: 'starry-hills', name: 'Starry Hills', description: 'Dark hills under a sky full of stars.', price: 300 },
];

/** Shop signs: /images/shops/sign-<key>.png behind the shop's name. */
export const SHOP_SIGNS: Cosmetic[] = [
    { key: 'carved-oak', name: 'Carved Oak Sign', description: 'Your shop\'s name on a carved oak board.', price: 300 },
    { key: 'painted-board', name: 'Painted Board Sign', description: 'Bright paint on a plain board, easy to see from the street.', price: 300 },
    { key: 'iron-bound', name: 'Iron-bound Sign', description: 'A heavy plank banded with black iron.', price: 300 },
    { key: 'gilt-edged', name: 'Gilt-edged Sign', description: 'A dark board with a gold border.', price: 400 },
];

/** Awning colors, drawn in CSS: one perk gives every color. */
export const AWNING_COLORS = ['red', 'green', 'blue', 'gold', 'purple', 'white'] as const;

/** Chat emotes: :key: in a message, drawn from /images/emotes/<key>.png. */
export const EMOTES = ['wave', 'laugh', 'cheers', 'gg', 'rip', 'gold', 'heart', 'sweat', 'think', 'sleep', 'fire', 'squonk'] as const;

/** Bell pack sounds: /sounds/bells/<key>.mp3, chosen in the bell settings on this device. */
export const BELLS: { key: string; name: string }[] = [
    { key: 'anvil', name: 'Anvil' },
    { key: 'church-bell', name: 'Church Bell' },
    { key: 'gull', name: 'Gull' },
    { key: 'horn', name: 'Horn' },
];

for (const f of FRAMES) STORE_ITEMS.push({ key: `frame:${f.key}`, name: f.name, description: f.description, price: f.price, grants: [`frame:${f.key}`], available: true, onSale: f.onSale });
for (const b of BACKDROPS) STORE_ITEMS.push({ key: `backdrop:${b.key}`, name: `Backdrop: ${b.name}`, description: b.description, price: b.price, grants: [`backdrop:${b.key}`], available: true, onSale: b.onSale });
for (const s of SHOP_SIGNS) STORE_ITEMS.push({ key: `sign:${s.key}`, name: s.name, description: s.description, price: s.price, grants: [`sign:${s.key}`], available: true });
STORE_ITEMS.push({
    key: 'perk:awning', name: 'Shop Awning',
    description: 'A striped awning over your shop, in red, green, blue, gold, purple, or white. Change it whenever you like.',
    price: 300, grants: ['perk:awning'], available: true,
});
STORE_ITEMS.push({
    key: 'perk:emotes', name: 'Chat Emotes',
    description: 'Twelve small pictures for chat, seen by everyone: wave, laugh, cheers, gg, and more. Type them as :wave: and the like.',
    price: 300, grants: ['perk:emotes'], available: true,
});
STORE_ITEMS.push({
    key: 'perk:bell_pack', name: 'Bell Pack',
    description: 'Four more sounds for the timer bell: an anvil, a church bell, a gull, and a horn.',
    price: 200, grants: ['perk:bell_pack'], available: true,
});

// Holiday pets (docs/pets-spec.md): bought in their season, kept for good, never
// tradeable. Owning one is the unlock 'pet:<key>' (services/pets.ts ownedPetKeys).
STORE_ITEMS.push({
    key: 'pet:snow-robin', name: 'Pet: Snow Robin',
    description: 'A robin with a red breast and a dusting of snow, to walk beside your name. Sold through December.',
    price: 500, grants: ['pet:snow-robin'], available: true, onSale: { from: '12-01', until: '12-31' },
});

/** What a player has chosen, and what they may choose from. */
export async function cosmeticsState(playerId: number) {
    const [unlocks, me, shop] = await Promise.all([
        getUnlocks(playerId),
        db('players').where({ id: playerId }).first('avatar_frame', 'profile_backdrop'),
        db('player_shops as s').join('player_properties as p', 'p.id', 's.property_id')
            .where('p.player_id', playerId).first('s.sign_style', 's.awning_color').catch(() => null),
    ]);
    const owned = (prefix: string, list: Cosmetic[]) => list.filter(c => hasUnlock(unlocks, `${prefix}:${c.key}`)).map(c => ({ key: c.key, name: c.name }));
    return {
        frames: owned('frame', FRAMES),
        backdrops: owned('backdrop', BACKDROPS),
        signs: owned('sign', SHOP_SIGNS),
        awnings: hasUnlock(unlocks, 'perk:awning') ? [...AWNING_COLORS] : [],
        emotes: hasUnlock(unlocks, 'perk:emotes') ? [...EMOTES] : [],
        bells: hasUnlock(unlocks, 'perk:bell_pack') ? BELLS : [],
        frame: me?.avatar_frame ?? null,
        backdrop: me?.profile_backdrop ?? null,
        sign: shop?.sign_style ?? null,
        awning: shop?.awning_color ?? null,
    };
}

type Wear = { ok: true } | { ok: false; error: string };

/**
 * Wear a cosmetic, or take it off with null. Only what the player owns, and
 * only from the lists above. A shop's sign and awning go on every shop the
 * player owns, one on each island.
 */
export async function wearCosmetic(playerId: number, kind: unknown, key: unknown): Promise<Wear> {
    const choice = key === null || key === undefined || key === '' ? null : String(key);
    const unlocks = await getUnlocks(playerId);
    const check = (prefix: string, list: readonly { key: string }[] | readonly string[]): Wear | null => {
        if (choice === null) return null;
        const keys = (list as readonly any[]).map(x => typeof x === 'string' ? x : x.key);
        if (!keys.includes(choice)) return { ok: false, error: 'That is not one of the choices.' };
        const unlock = prefix === 'perk:awning' ? 'perk:awning' : `${prefix}:${choice}`;
        if (!hasUnlock(unlocks, unlock)) return { ok: false, error: 'You do not own that yet.' };
        return null;
    };
    const shopIds = () => db('player_shops as s').join('player_properties as p', 'p.id', 's.property_id')
        .where('p.player_id', playerId).pluck('s.id');
    switch (kind) {
        case 'frame': {
            const bad = check('frame', FRAMES); if (bad) return bad;
            await db('players').where({ id: playerId }).update({ avatar_frame: choice });
            return { ok: true };
        }
        case 'backdrop': {
            const bad = check('backdrop', BACKDROPS); if (bad) return bad;
            await db('players').where({ id: playerId }).update({ profile_backdrop: choice });
            return { ok: true };
        }
        case 'sign': {
            const bad = check('sign', SHOP_SIGNS); if (bad) return bad;
            const ids = await shopIds();
            if (!ids.length) return { ok: false, error: 'You have no shop yet.' };
            await db('player_shops').whereIn('id', ids).update({ sign_style: choice });
            return { ok: true };
        }
        case 'awning': {
            const bad = check('perk:awning', AWNING_COLORS); if (bad) return bad;
            const ids = await shopIds();
            if (!ids.length) return { ok: false, error: 'You have no shop yet.' };
            await db('player_shops').whereIn('id', ids).update({ awning_color: choice });
            return { ok: true };
        }
        default:
            return { ok: false, error: 'Choose what to change.' };
    }
}

/**
 * The emote keys a chat line may draw: those written in it as :key: that its
 * sender owns, through the emote perk or as a pet's own emote (:pet-stoat:).
 * Fixed on the line when sent, so a later refund changes nothing already said.
 */
export async function emotesFor(playerId: number, message: string): Promise<string[] | null> {
    const used = [...new Set([...message.matchAll(/:([a-z0-9-]{2,30}):/g)].map(m => m[1]))];
    if (!used.length) return null;
    const unlocks = await getUnlocks(playerId);
    const allowed: string[] = [];
    if (hasUnlock(unlocks, 'perk:emotes')) for (const k of used) if ((EMOTES as readonly string[]).includes(k)) allowed.push(k);
    const petKeys = used.filter(k => k.startsWith('pet-')).map(k => k.slice(4));
    if (petKeys.length) {
        const { ownedPetKeys } = await import('./pets');
        const mine = new Set(await ownedPetKeys(playerId));
        for (const k of petKeys) if (mine.has(k)) allowed.push(`pet-${k}`);
    }
    return allowed.length ? allowed : null;
}
