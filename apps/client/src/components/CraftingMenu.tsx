import RecipeList from './RecipeList'
import './SmithingMenu.css'

interface CraftingMenuProps {
    onClose: () => void
    onStartCraft: (recipeId: number) => void
    skill: string
    title: string
    playerLevel: number
    stationActive?: boolean
}

// Station bench menu. All recipe rendering lives in RecipeList so Caliwen's
// bench, Verdale's woodworking tab and Emberra's fletching share one UI.
export default function CraftingMenu({ onClose, onStartCraft, skill, title, playerLevel, stationActive = true }: CraftingMenuProps) {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="smithing-menu-modal" onClick={e => e.stopPropagation()}>
                <div className="smithing-menu-header">
                    <h3 className="gold-text">{title}</h3>
                    <button className="modal-close-btn" onClick={onClose}>✕</button>
                </div>

                <RecipeList
                    skill={skill}
                    playerLevel={playerLevel}
                    stationActive={stationActive}
                    onStartCraft={(recipeId) => { onStartCraft(recipeId); onClose() }}
                />
            </div>
        </div>
    )
}
