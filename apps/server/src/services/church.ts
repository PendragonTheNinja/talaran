import db from '../db'

// Churches (docs/talar-spec.md §1): a building opened from its location's
// menu, on the museum's pattern (services/museum.ts). A lore building first;
// spells are learned at churches (Nathan, 2026-10-27), which step 4 adds.

/** The church standing where this player is, if any. */
export async function churchHere(playerId: number): Promise<{ id: number; name: string } | null> {
    const player = await db('players').where({ id: playerId }).select('current_location_id').first()
    if (!player?.current_location_id) return null
    return (await db('churches').where({ location_id: player.current_location_id }).select('id', 'name').first()) ?? null
}

/** One church: its name, what it is, and its writings in order. */
export async function churchState(churchId: number) {
    const church = await db('churches').where({ id: churchId }).first('id', 'name', 'faith', 'description')
    if (!church) return null
    const writings = await db('church_writings').where({ church_id: churchId })
        .orderBy([{ column: 'display_order' }, { column: 'id' }])
        .select('id', 'title', 'body')
    return { ...church, writings }
}
