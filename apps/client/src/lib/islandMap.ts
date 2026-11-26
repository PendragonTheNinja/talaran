/**
 * The full map picture for where the player stands (images/maps). An island's
 * own map is named for its island (Taiar_Island.jpg, Antura.jpg); on one of
 * its islets the island's islet chart is shown instead (Nathan, 2026-11-26),
 * named for the island without the word "Island": Taiar_Islets.jpg,
 * Antura_Islets.jpg. A later island follows the same two names.
 */
export function islandMapSrc(region: string | null | undefined, onIslet: boolean): string {
    const island = region || 'Taiar Island'
    if (onIslet) return `/images/maps/${island.replace(/ Island$/, '').replace(/ /g, '_')}_Islets.jpg`
    return `/images/maps/${island.replace(/ /g, '_')}.jpg`
}
