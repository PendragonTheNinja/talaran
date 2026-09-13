import { useState, useEffect, useMemo } from 'react'
import { getItemIcon } from '../lib/items'
import { apiFetch } from '../lib/api'

export interface TableRecipe {
    id: number
    skill: string
    forSkill: string
    name: string
    outputItemName: string
    outputQty: number
    /**
     * An input is either a named item or a subtype wildcard, and a wildcard has
     * no itemName at all. Rendering only itemName printed "2×" followed by
     * nothing on every fish dish.
     */
    inputs: { itemName?: string; subtype?: string; label?: string; qty: number }[]
    requiredLevel: number
    timerSeconds: number
    xp: number
    station: string | null
    requiredTools?: string[]
    /** Set when the output carries a buff, so provisions can be split out. */
    isProvision?: boolean
    /** Slots this recipe wants that the bench does not have. */
    missingTools?: string[]
    /** Server-computed: whose bench this would run at and how fast. The client
        cannot work this out from is_active, because a tool-less recipe like
        smelting runs at full speed on a half-finished bench of your own. */
    available?: boolean
    usingPublic?: boolean
    speedMultiplier?: number
    stationError?: string | null
}

interface RecipeListProps {
    /** Which skill gates and pays XP for these recipes (Carpentry, Crafting, Smithing...) */
    skill: string
    playerLevel: number
    /** The batch count comes from the global Action Limit bar, not from here. */
    onStartRecipe: (recipeId: number, batches: number | null) => void
    /** Retained for callers that still pass it; the per-recipe fields from the
        server take precedence when present. */
    stationActive?: boolean
    /** Group the tabs by the tool a dish needs rather than by skill.
        Cooking has 53 recipes all under one skill, so skill tabs collapse to a
        single flat wall. Grouping by tool also answers "what does a cauldron
        get me", which the flat list never did. */
    groupBy?: 'skill' | 'tool'
}

// Recipes from the `recipes` table, grouped into tabs by WHO THE OUTPUT SERVES
// (recipes.for_skill) rather than who makes it — a carpenter builds gear for
// four different skills, and this is what makes that legible. Mirrors the
// category tabs SmithingMenu already uses.
/** Which tab a recipe belongs in when grouping by tool. */
// Order matters: a dish naming several tools takes the first match. Hearth sits
// above mortar so a nut loaf files under Baking with the other breads rather
// than alone under Grinding, which is where it landed when mortar came first.
const TOOL_TABS: Array<{ slot: string; label: string }> = [
    { slot: 'cauldron', label: 'Pot' },
    { slot: 'skillet', label: 'Pan' },
    { slot: 'hearth', label: 'Baking' },
    { slot: 'mortar_pestle', label: 'Grinding' },
]

/** Slot keys are snake_case; a player should read words. */
function toolLabel(slot: string): string {
    return slot.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

const TOOL_TAB_ORDER = ['Over the Fire', 'Pot', 'Pan', 'Baking', 'Provisions', 'Grinding', 'Other']

function toolTabFor(r: TableRecipe): string {
    // Provisions come first, before any tool grouping: they are not food and
    // mixing them into Pot and Baking buries them among fifty heals.
    if (r.isProvision) return 'Provisions'
    const tools = r.requiredTools
    if (!tools || tools.length === 0) return 'Over the Fire'
    for (const t of TOOL_TABS) if (tools.includes(t.slot)) return t.label
    return 'Other'
}

export default function RecipeList({ skill, playerLevel, onStartRecipe, stationActive = true, groupBy = 'skill' }: RecipeListProps) {
    const [recipes, setRecipes] = useState<TableRecipe[]>([])
    const [loading, setLoading] = useState(true)
    const [category, setCategory] = useState<string | null>(null)

    useEffect(() => {
        apiFetch<{ recipes: TableRecipe[] }>('/api/recipes')
            .then(data => setRecipes((data.recipes || []).filter(r => r.skill === skill)))
            .catch(() => setRecipes([]))
            .finally(() => setLoading(false))
    }, [skill])

    // Tab order: the making skill first (its own gear), then the rest alphabetically
    const categories = useMemo(() => {
        const found = Array.from(new Set(recipes.map(r => r.forSkill || r.skill)))
        return found.sort((a, b) => {
            if (a === skill) return -1
            if (b === skill) return 1
            return a.localeCompare(b)
        })
    }, [recipes, skill])

    // Tool grouping keeps the tabs in a fixed order rather than alphabetical, so
    // "Over the Fire" is always first: it is the only tab a new cook can use.
    const toolCategories = useMemo(() => {
        if (groupBy !== 'tool') return []
        const found = new Set(recipes.map(toolTabFor))
        return TOOL_TAB_ORDER.filter(t => found.has(t))
    }, [recipes, groupBy])

    const tabs = groupBy === 'tool' ? toolCategories : categories

    useEffect(() => {
        if (!category && tabs.length > 0) setCategory(tabs[0])
    }, [tabs, category])

    if (loading) return <p className="muted-text" style={{ textAlign: 'center', padding: '12px' }}>Looking over the bench…</p>
    if (recipes.length === 0) return <p className="muted-text" style={{ textAlign: 'center', padding: '12px' }}>Nothing can be made here yet.</p>

    const shown = groupBy === 'tool'
        ? recipes.filter(r => toolTabFor(r) === category)
        : recipes.filter(r => (r.forSkill || r.skill) === category)

    return (
        <>
            {tabs.length > 1 && (
                <div className="smithing-categories">
                    {tabs.map(cat => (
                        <button
                            key={cat}
                            className={`smithing-category-btn ${category === cat ? 'active' : ''}`}
                            onClick={() => setCategory(cat)}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            )}

            <div className="smithing-recipe-grid">
                {shown.map(r => {
                    const locked = playerLevel < r.requiredLevel
                    // Prefer the server's answer; fall back to the old guess
                    // only for callers that have not been updated.
                    const blocked = r.available === false
                    // The station error says you cannot; this says what to go
                    // and get. A rack with nothing in it should read as a
                    // shopping list rather than a wall of refusals.
                    // Prefer the tool list, which is precise and reads as a
                    // shopping list. The server error is the fallback for
                    // refusals that are not about a missing tool at all.
                    const wants = (r.missingTools ?? []).map(toolLabel)
                    const tip = !blocked
                        ? undefined
                        : wants.length
                            ? `Needs ${wants.join(', ')}.`
                            : r.stationError ?? undefined
                    return (
                        <div
                            key={r.id}
                            className={`smithing-recipe-card ${locked || blocked ? 'locked' : ''}`}
                            title={tip}
                            onClick={() => { if (!locked && !blocked) onStartRecipe(r.id, null) }}
                        >
                            <div className="smithing-recipe-image">
                                <img
                                    src={getItemIcon(r.outputItemName)}
                                    alt={r.outputItemName}
                                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                                />
                            </div>
                            {/* The name used to live inside the image div, which is
                                64px wide, so every name wrapped inside a 64px box.
                                "Cooked Black Bream" came out on three lines. */}
                            <span className="smithing-recipe-name">
                                {r.outputItemName}{r.outputQty > 1 ? ` ×${r.outputQty}` : ''}
                            </span>
                            {/* On the card, not only in a native tooltip. A title
                                attribute waits a second, shows nothing on touch,
                                and is the first thing a player misses. If a dish
                                is greyed out, the reason should be readable
                                without hovering at all. */}
                            {blocked && wants.length > 0 && (
                                <span className="station-tag locked">Needs {wants.join(', ')}</span>
                            )}

                            <div className="smithing-recipe-ingredients">
                                {r.inputs.map((ing, i) => (
                                    <span key={i} className="smithing-ingredient">
                                        {ing.qty}× {ing.itemName ?? ing.label ?? ing.subtype ?? '?'}
                                    </span>
                                ))}
                            </div>
                            {locked && <div className="smithing-locked-label">Level {r.requiredLevel}</div>}
                        </div>
                    )
                })}
            </div>
        </>
    )
}
