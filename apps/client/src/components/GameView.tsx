import { useState } from 'react'
import './GameView.css'

export default function GameView() {
  const [isActing, setIsActing] = useState(false)

  return (
    <div className="game-view panel">
      <div className="game-view-location-bar">
        <span className="game-view-location gold-text">Talador</span>
        <div className="game-view-actions">
          <button className="btn">Mine Ore</button>
          <button className="btn" onClick={() => setIsActing(!isActing)}>
            Chop Trees
          </button>
          <button className="btn">Fish</button>
          <button className="btn">Local Pub</button>
        </div>
      </div>

      <div className="game-view-main">
        <div className="game-view-scene">
          {/* Scene art will go here — placeholder for now */}
          <div className="scene-placeholder">
            <span className="scene-placeholder-text">Talaran</span>
          </div>
        </div>

        {isActing && (
          <div className="game-view-action-log">
            <p className="action-text">You begin chopping a Lanai Tree.</p>
            <div className="action-timer">
              <div className="action-timer-bar">
                <div className="action-timer-fill" />
              </div>
              <span className="action-timer-label">30s</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}