import RecipeList from './RecipeList'
import './SmithingMenu.css'

interface SmithingMenuProps {
  onClose: () => void
  onStartRecipe: (recipeId: number) => void
  playerSmithingLevel: number
  stationActive?: boolean
}

// Recipes now live in the `recipes` table (converge_smith_recipes) and render
// through the shared RecipeList, which builds its tabs from recipes.for_skill —
// the same Mining/Woodcutting/Smithing/Carpentry grouping this menu always had,
// now data-driven, and Fletch Arrows joins it under Hunting for free.
export default function SmithingMenu({ onClose, onStartRecipe, playerSmithingLevel, stationActive = true }: SmithingMenuProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="smithing-menu-modal" onClick={e => e.stopPropagation()}>
        <div className="smithing-menu-header">
          <h3 className="gold-text">Smith Ambren Items</h3>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <RecipeList
          skill="Smithing"
          playerLevel={playerSmithingLevel}
          stationActive={stationActive}
          onStartRecipe={(recipeId) => { onStartRecipe(recipeId); onClose() }}
        />
      </div>
    </div>
  )
}
