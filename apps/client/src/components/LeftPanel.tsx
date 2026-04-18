import './LeftPanel.css'

export default function LeftPanel() {
  return (
    <aside className="left-panel panel">
      <div className="panel-title">Equipment</div>

      <div className="equipment-grid">
        {/* Equipment slots — to be filled with real items later */}
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="equipment-slot panel-inset" />
        ))}
      </div>

      <div className="divider" />

      <div className="stat-bars">
        <div className="stat-bar-wrapper">
          <div className="stat-bar-label">
            <span>Health</span>
            <span>100 / 100</span>
          </div>
          <div className="stat-bar-track">
            <div className="stat-bar-fill health" style={{ width: '100%' }} />
          </div>
        </div>

        <div className="stat-bar-wrapper">
          <div className="stat-bar-label">
            <span>Mana</span>
            <span>50 / 50</span>
          </div>
          <div className="stat-bar-track">
            <div className="stat-bar-fill mana" style={{ width: '100%' }} />
          </div>
        </div>
      </div>

      <div className="divider" />

      <div className="combat-stats panel-inset">
        <div className="panel-title">Combat Stats</div>
        <div className="stat-row">
          <span>Armor</span><span>0</span>
        </div>
        <div className="stat-row">
          <span>Accuracy</span><span>0</span>
        </div>
        <div className="stat-row">
          <span>Power</span><span>0</span>
        </div>
      </div>
    </aside>
  )
}