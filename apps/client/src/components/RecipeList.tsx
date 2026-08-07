import { useState, useEffect, useMemo } from 'react'
import { apiFetch } from '../lib/api'

export interface TableRecipe {
    id: number
    skill: string
    forSkill: string
    name: string
    outputItemName: string
    outputQty: number
    inputs: { itemName: string; qty: number }[]
    requiredLevel: number
    timerSeconds: number
    xp: number
    station: string | null
}

interface RecipeListProps {
    /** Which skill gates and pays XP for these recipes (Carpentry, Crafting, Smithing...) */
    skill: string
    playerLevel: number
    /** The batch count comes from the global Action Limit bar, not from here. */
    onStartRecipe: (recipeId: number, batches: number | null) => void
    /** False when the player has no active workstation here — station recipes take 2x as long. */
    stationActive?: boolean
}

// Recipes from the `recipes` table, grouped into tabs by WHO THE OUTPUT SERVES
// (recipes.for_skill) rather than who makes it — a carpenter builds gear for
// four different skills, and this is what makes that legible. Mirrors the
// category tabs SmithingMenu already uses.
export default function RecipeList({ skill, playerLevel, onStartRecipe, stationActive = true }: RecipeListProps) {
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

    useEffect(() => {
        if (!category && categories.length > 0) setCategory(categories[0])
    }, [categories, category])

    if (loading) return <p className="muted-text" style={{ textAlign: 'center', padding: '12px' }}>Looking over the bench…</p>
    if (recipes.length === 0) return <p className="muted-text" style={{ textAlign: 'center', padding: '12px' }}>Nothing can be made here yet.</p>

    const shown = recipes.filter(r => (r.forSkill || r.skill) === category)

    return (
        <>
            {categories.length > 1 && (
                <div className="smithing-categories">
                    {categories.map(cat => (
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
                    const slow = !!r.station && !stationActive
                    return (
                        <div
                            key={r.id}
                            className={`smithing-recipe-card ${locked ? 'locked' : ''}`}
                            onClick={() => { if (!locked) onStartRecipe(r.id, null) }}
                        >
                            <div className="smithing-recipe-image">
                                <img
                                    src={`/images/items/${r.outputItemName.replace(/ /g, '_')}.png`}
                                    alt={r.outputItemName}
                                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                                />
                                <span className="smithing-recipe-name">
                                    {r.outputItemName}{r.outputQty > 1 ? ` ×${r.outputQty}` : ''}
                                    {slow && <span className="muted-text" style={{ fontSize: '11px' }}> (slow)</span>}
                                </span>
                            </div>
                            <div className="smithing-recipe-ingredients">
                                {r.inputs.map((ing, i) => (
                                    <span key={i} className="smithing-ingredient">{ing.qty}× {ing.itemName}</span>
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
