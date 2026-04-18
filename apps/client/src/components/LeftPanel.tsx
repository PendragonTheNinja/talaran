import { getItemIcon, getQualityColor } from '../lib/items'
import './LeftPanel.css'

interface InventoryItem {
  id: number
  item_id: number
  name: string
  type: string
  subtype: string | null
  quality: string | null
  tier: number
  description: string
  stackable: boolean
  quantity: number
}

interface LeftPanelProps {
  inventoryData: InventoryItem[]
}

export default function LeftPanel({ inventoryData }: LeftPanelProps) {
    const INVENTORY_SLOTS = Math.max(16, inventoryData.length)
  
    return (
    <aside className="left-panel panel">

      {/* Inventory */}
      <div className="panel-title">Inventory</div>
      <div className="inventory-grid panel-inset">
        {Array.from({ length: INVENTORY_SLOTS }).map((_, i) => {
          const item = inventoryData[i]
          const icon = item ? getItemIcon(item.name) : null
          const qualityColor = item ? getQualityColor(item.quality) : null

          return (
            <div
              key={i}
              className={`inventory-slot ${item ? 'occupied' : ''}`}
              title={item ? `${item.name}${item.quantity > 1 ? ` (${item.quantity})` : ''}\n${item.description}` : ''}
              style={item && qualityColor ? { borderColor: qualityColor } : {}}
            >
              {item && (
                <>
                  {icon ? (
                    <img
                      src={icon}
                      alt={item.name}
                      className="inventory-item-icon"
                    />
                  ) : (
                    <span className="inventory-item-text">{item.name.split(' ')[0]}</span>
                  )}
                  {item.quantity > 1 && (
                    <span className="inventory-item-qty">{item.quantity}</span>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      <div className="divider" />

      {/* Equipment */}
      <div className="panel-title">Equipment</div>
      <div className="equipment-grid">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="equipment-slot panel-inset" />
        ))}
      </div>

      <div className="divider" />

      {/* Combat stats */}
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

      <div className="divider" />

      {/* Health & Mana */}
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

    </aside>
  )
}