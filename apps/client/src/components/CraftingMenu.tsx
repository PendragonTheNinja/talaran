import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import RecipeList from './RecipeList'
import './SmithingMenu.css'

interface CraftingMenuProps {
    onClose: () => void
    onStartRecipe: (recipeId: number, batches: number | null) => void
    skill: string
    title: string
    playerLevel: number
    stationActive?: boolean
    groupBy?: 'skill' | 'tool'
    /** Which workstation this bench is, so ownership can be asked directly. */
    stationType?: string
    /** Whose bench this is. Given both names, the header says which one you are
        standing at instead of tagging every recipe card with it. */
    keeperName?: string
    ownerName?: string
}

// Station bench menu. All recipe rendering lives in RecipeList so Caliwen's
// bench, Verdale's woodworking tab and Emberra's fletching share one UI.
export default function CraftingMenu({ onClose, onStartRecipe, skill, title, playerLevel, stationActive = true, groupBy = 'skill', keeperName, ownerName, stationType }: CraftingMenuProps) {
    /**
     * Whose bench this is, asked of the station itself.
     *
     * This used to be inferred from whether any recipe reported usingPublic,
     * which was wrong twice over: the endpoint returns every skill's recipes
     * rather than this bench's, and a per-recipe flag answers "where would THIS
     * job run", not "whose building am I in". Someone with their own hearth and
     * an empty rack was told they were still at Geomima's.
     *
     * A temporary station is a campfire, which is nobody's building.
     */
    const [borrowed, setBorrowed] = useState<boolean | null>(null)

    useEffect(() => {
        if (!stationType || !keeperName || !ownerName) return
        apiFetch<{ exists: boolean; isTemporary: boolean }>(`/api/workstations/${stationType}`)
            .then(s => setBorrowed(!(s.exists && !s.isTemporary)))
            .catch(() => setBorrowed(null))
    }, [stationType, keeperName, ownerName])

    const heading = keeperName && ownerName && borrowed !== null
        ? `${borrowed ? keeperName : ownerName}'s ${title}`
        : title

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="smithing-menu-modal" onClick={e => e.stopPropagation()}>
                <div className="smithing-menu-header">
                    <h3 className="gold-text">{heading}</h3>
                    <button className="modal-close-btn" onClick={onClose}>✕</button>
                </div>

                <RecipeList
                    skill={skill}
                    playerLevel={playerLevel}
                    stationActive={stationActive}
                    groupBy={groupBy}
                    onStartRecipe={(recipeId, batches) => { onStartRecipe(recipeId, batches); onClose() }}
                />
            </div>
        </div>
    )
}
