import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import RecipeList from './RecipeList'
import './SmithingMenu.css'

interface SmeltRecipe {
  key: string
  name: string
  ingredients: { name: string; quantity: number }[]
  outputQuantity: number
  requiredLevel: number
  canMake: boolean
}

interface ForgeMenuProps {
  onClose: () => void
  onStartRecipe: (recipeId: number) => void
  onStartSmelt: (metalKey: string) => void
  playerSmithingLevel: number
  stationActive?: boolean
  inventory: { name: string; quantity: number }[]
}

// The Forge bench, in two halves: ore into ingots (Smeltery), ingots into goods
// (Anvil). Carpentry has had this shape since launch (Sawing / Woodworking) and
// Caliwen crafting followed it; smithing was the last bench still scattered
// across the location panel.
//
// The Kiln deliberately stays OUT here. It burns on real time whether the player
// is present or not, so its state is news about the town and belongs on the
// location panel where it can be read at a glance while passing through.
export default function ForgeMenu({
  onClose, onStartRecipe, onStartSmelt, playerSmithingLevel, stationActive = true, inventory,
}: ForgeMenuProps) {
  const [tab, setTab] = useState<'smeltery' | 'anvil'>('smeltery')
  const [smeltRecipes, setSmeltRecipes] = useState<SmeltRecipe[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<{ recipes: { smelt: SmeltRecipe[] } }>('/api/smithing/recipes')
      .then(d => setSmeltRecipes(d.recipes?.smelt || []))
      .catch(() => setSmeltRecipes([]))
      .finally(() => setLoading(false))
  }, [])

  const held = (name: string) => inventory.find(i => i.name === name)?.quantity || 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="smithing-menu-modal" onClick={e => e.stopPropagation()}>
        <div className="smithing-menu-header">
          <h3 className="gold-text">The Forge</h3>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="forge-tabs">
          <button
            className={`forge-tab ${tab === 'smeltery' ? 'active' : ''}`}
            onClick={() => setTab('smeltery')}
          >
            Smeltery
          </button>
          <button
            className={`forge-tab ${tab === 'anvil' ? 'active' : ''}`}
            onClick={() => setTab('anvil')}
          >
            Anvil
          </button>
        </div>

        {tab === 'smeltery' && (
          <>
            <p className="muted-text forge-tab-blurb">
              Ore and charcoal in, ingots out. Set an Action Limit before you begin
              if you want to stop at a certain number.
            </p>

            {loading && <p className="muted-text">Raking over the coals…</p>}
            {!loading && smeltRecipes.length === 0 && (
              <p className="muted-text">Nothing can be smelted here yet.</p>
            )}

            <div className="smithing-recipe-grid">
              {smeltRecipes.map(r => {
                const locked = playerSmithingLevel < r.requiredLevel
                const short = r.ingredients.some(ing => held(ing.name) < ing.quantity)
                return (
                  <div
                    key={r.key}
                    className={`smithing-recipe-card ${locked || short ? 'locked' : ''}`}
                    onClick={() => { if (!locked && !short) { onStartSmelt(r.key); onClose() } }}
                  >
                    <div className="smithing-recipe-image">
                      <img
                        src={`/images/items/${r.name.replace(/ /g, '_')}.png`}
                        alt={r.name}
                        onError={e => { e.currentTarget.style.display = 'none' }}
                      />
                      <span className="smithing-recipe-name">
                        {r.name}{r.outputQuantity > 1 ? ` ×${r.outputQuantity}` : ''}
                        {!stationActive && (
                          <span className="muted-text" style={{ fontSize: '11px' }}> (slow)</span>
                        )}
                      </span>
                    </div>
                    <div className="smithing-recipe-ingredients">
                      {/* Same shape RecipeList uses, with a held/needed count
                          added since smelting is the one bench where running dry
                          mid-batch is the common case. */}
                      {r.ingredients.map(ing => {
                        const have = held(ing.name)
                        return (
                          <span
                            key={ing.name}
                            className="smithing-ingredient"
                            style={have < ing.quantity ? { color: 'var(--color-red-glow)' } : undefined}
                          >
                            {ing.quantity}× {ing.name} ({have})
                          </span>
                        )
                      })}
                    </div>
                    {locked && (
                      <div className="smithing-locked-label">Level {r.requiredLevel}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {tab === 'anvil' && (
          <RecipeList
            skill="Smithing"
            playerLevel={playerSmithingLevel}
            stationActive={stationActive}
            onStartRecipe={(recipeId) => { onStartRecipe(recipeId); onClose() }}
          />
        )}
      </div>
    </div>
  )
}
