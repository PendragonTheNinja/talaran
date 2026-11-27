import db from '../db';

// ── Islands (docs/antura-plan.md §14) ────────────────────────────────────────
//
// Each island's facts are a row in `islands`, keyed by the `locations.region`
// its places carry: its tier, where its homestead and player shops stand, and
// how many fields a homestead there may hold. What a player can do with their
// homestead or a shop is decided by the island they stand on, so a player on
// Taiar deals with Novita and Talador, and on Antura with Farefield and
// Wendhaven, each holding its own property (CLAUDE.md §8).
//
// Taiar's values are also the fallbacks, so a database without the row (a
// fresh one before content:import, or race:check's) behaves as it did when
// these were constants.

export const TAIAR = { name: 'Taiar Island', tier: 1, homestead_place: 'Novita', shop_town: 'Talador', plot_max: 20 };

export interface Island {
    name: string
    tier: number
    homestead_place: string
    shop_town: string
    plot_max: number
}

function asIsland(row: any, region: string | null): Island {
    if (!row) return { ...TAIAR, name: region || TAIAR.name };
    return {
        name: row.name,
        tier: Number(row.tier) || 1,
        homestead_place: row.homestead_place || TAIAR.homestead_place,
        shop_town: row.shop_town || TAIAR.shop_town,
        plot_max: Number(row.plot_max) || TAIAR.plot_max,
    };
}

/** The island the player is standing on. */
export async function islandHere(x: any, playerId: number): Promise<Island> {
    const here = await x('players as p').join('locations as l', 'l.id', 'p.current_location_id')
        .where('p.id', playerId).first('l.region');
    const region = here?.region ?? null;
    const row = region ? await x('islands').where({ name: region }).first() : null;
    return asIsland(row, region);
}

/** The place on the player's island where its homestead stands, or null if it is not in the world. */
export async function homesteadPlace(x: any, playerId: number): Promise<any | null> {
    const island = await islandHere(x, playerId);
    return (await x('locations').where({ name: island.homestead_place }).first()) ?? null;
}

/** The port on the player's island where its player shops stand, or null if it is not in the world. */
export async function shopTown(x: any, playerId: number): Promise<any | null> {
    const island = await islandHere(x, playerId);
    return (await x('locations').where({ name: island.shop_town }).first()) ?? null;
}

/** Every island's homestead places and shop towns, for marking places in the location payload. */
export async function islandTowns(x: any = db): Promise<{ homesteads: Set<string>; shops: Set<string> }> {
    const rows = await x('islands').select('homestead_place', 'shop_town');
    const homesteads = new Set<string>(rows.map((r: any) => r.homestead_place).filter(Boolean));
    const shops = new Set<string>(rows.map((r: any) => r.shop_town).filter(Boolean));
    if (!homesteads.size) homesteads.add(TAIAR.homestead_place);
    if (!shops.size) shops.add(TAIAR.shop_town);
    return { homesteads, shops };
}

/**
 * Whether players may trade at this place: every island's port, where its
 * shops stand (islands.shop_town), Talador and Wendhaven today. Trading was
 * Talador's alone by name until Antura (Nathan, 2026-11-27).
 */
export async function isTradingPlace(locationId: number, x: any = db): Promise<boolean> {
    const loc = await x('locations').where({ id: locationId }).first('name');
    if (!loc) return false;
    return (await islandTowns(x)).shops.has(loc.name);
}

/** The trading ports in words, for a refusal ("Talador or Wendhaven"). */
export async function tradingPlaces(x: any = db): Promise<string> {
    return [...(await islandTowns(x)).shops].join(' or ');
}
