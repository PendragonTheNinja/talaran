import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import RecipeList from './RecipeList'
import './SmithingMenu.css'
import { backdropClose } from '../lib/backdrop'
import { formatGameTime } from '../lib/time'
import { listWords } from '../lib/listWords'

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
    /** Passed to RecipeList: only this station's recipes (null: station-less). */
    station?: string | null
}

// Station bench menu. All recipe rendering lives in RecipeList so Caliwen's
// bench, Verdale's woodworking tab and Emberra's fletching share one UI.
export default function CraftingMenu({ onClose, onStartRecipe, skill, title, playerLevel, stationActive = true, groupBy = 'skill', keeperName, ownerName, stationType, station }: CraftingMenuProps) {
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
    // Tools in your own bench here that gave out (services/toolWear.ts). Said
    // up front, so a timer twice as long as usual is never a surprise.
    const [brokenTools, setBrokenTools] = useState<string[]>([])
    // The keeper's mealtime fire (server lib/keeperFires.ts): their hearth at
    // full speed while it burns. Said here, so the hour is known before it comes.
    const [keeperFire, setKeeperFire] = useState<{ keeper: string; until: string | null; next: string } | null>(null)

    useEffect(() => {
        if (!stationType) return
        apiFetch<{ exists: boolean; isTemporary: boolean; brokenTools?: string[]; keeperFire?: { keeper: string; until: string | null; next: string } | null }>(`/api/workstations/${stationType}`)
            .then(s => {
                setBrokenTools(s.brokenTools ?? [])
                setKeeperFire(s.keeperFire ?? null)
                if (keeperName && ownerName) setBorrowed(!(s.exists && !s.isTemporary))
            })
            .catch(() => setBorrowed(null))
    }, [stationType, keeperName, ownerName])

    const heading = keeperName && ownerName && borrowed !== null
        ? `${borrowed ? keeperName : ownerName}'s ${title}`
        : title

    return (
        <div className="modal-overlay" {...backdropClose(onClose)}>
            <div className="smithing-menu-modal" onClick={e => e.stopPropagation()}>
                <div className="smithing-menu-header">
                    <h3 className="gold-text">{heading}</h3>
                    <button className="modal-close-btn" onClick={onClose}>✕</button>
                </div>

                {brokenTools.length > 0 && (
                    <p className="station-broken-notice">
                        Your {listWords(brokenTools)} {brokenTools.length === 1 ? 'has' : 'have'} given out.
                        Work that needs {brokenTools.length === 1 ? 'it' : 'them'} goes at half speed until you fit {brokenTools.length === 1 ? 'a new one' : 'new ones'} in the bench.
                    </p>
                )}

                {keeperFire && borrowed === true && (
                    <p className="station-fire-notice">
                        {keeperFire.until
                            ? `${keeperFire.keeper}'s fire is lit for the meal. Her hearth works at full speed until ${formatGameTime(new Date(keeperFire.until))}.`
                            : `${keeperFire.keeper} cooks at breakfast, noon, and supper, and her hearth works at full speed while her fire burns. Next lit at ${formatGameTime(new Date(keeperFire.next))}.`}
                    </p>
                )}

                <RecipeList
                    skill={skill}
                    playerLevel={playerLevel}
                    stationActive={stationActive}
                    groupBy={groupBy}
                    station={station}
                    onStartRecipe={(recipeId, batches) => { onStartRecipe(recipeId, batches); onClose() }}
                />
            </div>
        </div>
    )
}
