import { apiFetch } from '../lib/api'
import './WelcomeModal.css'

interface WelcomeModalProps {
  username: string
  onClose: () => void
}

export default function WelcomeModal({ username, onClose }: WelcomeModalProps) {
  const handleClose = async () => {
    try {
      await apiFetch('/api/player/welcome-seen', { method: 'POST' })
    } catch (err) {
      console.error('Failed to mark welcome seen:', err)
    }
    onClose()
  }

  return (
    <div className="welcome-overlay">
      <div className="welcome-modal">
        <div className="welcome-header">
          <h1 className="welcome-title gold-text">Welcome to Talaran</h1>
          <p className="welcome-subtitle">{username}</p>
        </div>

        <div className="welcome-body">
          <p className="welcome-text">
            You have arrived on the shores of Taiar Island — a land of new beginnings.
            You carry a hatchet and a pickaxe, and little else.
          </p>
          <p className="welcome-text">
            The forests to the west hold Lanai trees ready to be felled. The mountains
            hide ore veins waiting to be discovered. The forge at Emberra grows cold
            without a smith's hand.
          </p>
          <p className="welcome-text">
            Chop. Mine. Smith. Explore. Your story starts here.
          </p>

          <div className="welcome-hints">
            <div className="welcome-hint">
              <span className="welcome-hint-icon">🪓</span>
              <span>Travel to <strong>Lanaivale</strong> to chop your first logs</span>
            </div>
            <div className="welcome-hint">
              <span className="welcome-hint-icon">⛏</span>
              <span>Visit <strong>Grundagr</strong> or <strong>Origrund</strong> to mine ore</span>
            </div>
            <div className="welcome-hint">
              <span className="welcome-hint-icon">🔨</span>
              <span>Bring ore and logs to <strong>Emberra</strong> to smelt and smith</span>
            </div>
          </div>
        </div>

        <button className="btn btn-gold welcome-btn" onClick={handleClose}>
          Begin Your Journey
        </button>
      </div>
    </div>
  )
}