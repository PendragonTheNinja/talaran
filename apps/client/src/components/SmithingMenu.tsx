import { useState } from 'react'
import { apiFetch } from '../lib/api'
import './SmithingMenu.css'

interface SmithRecipe {
  key: string
  name: string
  partType: string
  metalType: string
  ingredients: { name: string; quantity: number }[]
  requiredLevel: number
  canMake: boolean
}

interface SmithingMenuProps {
  onClose: () => void
  onStartSmithing: (recipe: string) => void
  playerSmithingLevel: number
}

const RECIPES: SmithRecipe[] = [
  {
    key: 'ambren_pickaxe',
    name: 'Ambren Pickaxe',
    partType: 'pickaxe',
    metalType: 'ambren',
    ingredients: [
      { name: 'Ambren Ingot', quantity: 2 },
      { name: 'Lanai Tool Rod', quantity: 1 },
      { name: 'Leather Strips', quantity: 1 },
    ],
    requiredLevel: 1,
    canMake: true,
  },
  {
    key: 'ambren_hatchet',
    name: 'Ambren Hatchet',
    partType: 'hatchet',
    metalType: 'ambren',
    ingredients: [
      { name: 'Ambren Ingot', quantity: 2 },
      { name: 'Lanai Tool Rod', quantity: 1 },
      { name: 'Leather Strips', quantity: 1 },
    ],
    requiredLevel: 1,
    canMake: true,
  },
  {
    key: 'ambren_hammer',
    name: 'Ambren Hammer',
    partType: 'hammer',
    metalType: 'ambren',
    ingredients: [
      { name: 'Ambren Ingot', quantity: 2 },
      { name: 'Lanai Tool Rod', quantity: 1 },
    ],
    requiredLevel: 1,
    canMake: true,
  },
  {
    key: 'ambren_tongs',
    name: 'Ambren Tongs',
    partType: 'tongs',
    metalType: 'ambren',
    ingredients: [{ name: 'Ambren Ingot', quantity: 1 }],
    requiredLevel: 1,
    canMake: true,
  },
  {
    key: 'ambren_anvil',
    name: 'Ambren Anvil',
    partType: 'anvil',
    metalType: 'ambren',
    ingredients: [{ name: 'Ambren Ingot', quantity: 5 }],
    requiredLevel: 1,
    canMake: true,
  },
]

export default function SmithingMenu({ onClose, onStartSmithing, playerSmithingLevel }: SmithingMenuProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('mining')

  const categories = [
  { key: 'mining', label: 'Mining' },
  { key: 'woodcutting', label: 'Woodcutting' },
  { key: 'smithing', label: 'Smithing' },
]

const filteredRecipes = RECIPES.filter(r => {
  if (selectedCategory === 'mining') return r.partType === 'pickaxe'
  if (selectedCategory === 'woodcutting') return r.partType === 'hatchet'
  if (selectedCategory === 'smithing') return ['hammer', 'tongs', 'anvil'].includes(r.partType)
  return true
})

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="smithing-menu-modal" onClick={e => e.stopPropagation()}>
        <div className="smithing-menu-header">
          <h3 className="gold-text">Smith Ambren Items</h3>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Category tabs */}
        <div className="smithing-categories">
          {categories.map(cat => (
            <button
              key={cat.key}
              className={`smithing-category-btn ${selectedCategory === cat.key ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat.key)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Recipe grid */}
        <div className="smithing-recipe-grid">
          {filteredRecipes.map(recipe => (
            <div
              key={recipe.key}
              className={`smithing-recipe-card ${playerSmithingLevel < recipe.requiredLevel ? 'locked' : ''}`}
              onClick={() => {
                if (playerSmithingLevel >= recipe.requiredLevel) {
                  onStartSmithing(recipe.key)
                  onClose()
                }
              }}
            >
              <div className="smithing-recipe-image">
                <img
                  src={`/images/items/${recipe.name.replace(/ /g, '_')}.png`}
                  alt={recipe.name}
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
                <span className="smithing-recipe-name">{recipe.name}</span>
              </div>
              <div className="smithing-recipe-ingredients">
                {recipe.ingredients.map((ing, i) => (
                  <span key={i} className="smithing-ingredient">
                    {ing.quantity}× {ing.name}
                  </span>
                ))}
              </div>
              {playerSmithingLevel < recipe.requiredLevel && (
                <div className="smithing-locked-label">Level {recipe.requiredLevel}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}