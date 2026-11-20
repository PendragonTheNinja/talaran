import { backdropClose } from '../lib/backdrop'
import RoundSection from './RoundSection'
import './TavernPanel.css'

// A tavern with no bard (the Gaster's Gaze, Wendhaven): no Chronicle and no
// ballads, only the taproom. Rounds and the keeper's ale (RoundSection).

export default function TaproomPanel({ name, description, onClose }: { name: string; description?: string | null; onClose: () => void }) {
    return (
        <div className="tavern-overlay" {...backdropClose(onClose)}>
            <div className="tavern-modal" onClick={e => e.stopPropagation()}>
                <div className="tavern-header">
                    <h2>{name}</h2>
                    <button className="tavern-close" onClick={onClose}>✕</button>
                </div>
                {description && <p className="tavern-scene">{description}</p>}
                <RoundSection />
            </div>
        </div>
    )
}
