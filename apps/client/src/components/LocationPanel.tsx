import { useState, useEffect } from 'react'
import TallyBoardPanel from './TallyBoardPanel'
import { apiFetch } from '../lib/api'
import './LocationPanel.css'
import { getItemIcon } from '../lib/items'
import NPCDialogue from './NPCDialogue'

interface GroundItem {
  id: number
  item_name: string
  quantity: number
  dropped_by: string
}

interface PlayerAtLocation {
  id: number
  username: string
  combat_level?: number
  onRequestTrade?: (playerId: number) => void
}

interface LocationPanelProps {
  locationData: any
  currentAction: string | null
  onStartAction: (type: string, id: number | string) => void
  veins: any[]
  onKilnMaxLogs?: (max: number) => void
  onActionLimitChange?: (limit: number | null) => void
  onInventoryUpdate?: () => void
  groundItemsKey?: number
  onLocationRefresh?: () => void
  onViewProfile?: (playerId: number) => void
  currentPlayerId?: number
  smithingStatusKey?: number
  layout?: 'stacked' | 'columns'
}

export default function LocationPanel({ locationData, currentAction, onStartAction, veins, onKilnMaxLogs, onActionLimitChange, groundItemsKey, onInventoryUpdate, onLocationRefresh, onViewProfile, onRequestTrade, currentPlayerId, smithingStatusKey, layout = 'stacked' }: LocationPanelProps) {
  const [groundItems, setGroundItems] = useState<any[]>([])
  const [playersHere, setPlayersHere] = useState<PlayerAtLocation[]>([])
  const [forgeOpen, setForgeOpen] = useState(false)
  // Self-contained: the panel fetches its own state, so no props to thread.
  const [tallyOpen, setTallyOpen] = useState(false)
  const [smithingStatus, setSmithingStatus] = useState<any>(null)

  const [carpentryStatus, setCarpentryStatus] = useState<any>(null)
  const [workshopOpen, setWorkshopOpen] = useState(false)
  const [farmsteadOpen, setFarmsteadOpen] = useState(false)

  const [tanningStatus, setTanningStatus] = useState<any>(null)
  const [craftworksOpen, setCraftworksOpen] = useState(false)
  const [trapsCaught, setTrapsCaught] = useState(0)

  const location = locationData?.location
  const nodes = locationData?.nodes || []
  const connections = locationData?.connections || []

  const isEmberra = location?.name === 'Emberra'
  const isVerdale = location?.name === 'Verdale'
  const isCaliwen = location?.name === 'Caliwen'
  const isNovita = location?.name === 'Novita'

  const [questStatus, setQuestStatus] = useState<'not_started' | 'active' | 'completed'>('not_started')
  const [showBlacksmith, setShowBlacksmith] = useState(false)

  const [activeNpcId, setActiveNpcId] = useState<number | null>(null)
  const [npcs, setNpcs] = useState<any[]>([])

  const loadGroundItems = async () => {
    try {
      const data = await apiFetch<{ items: any[] }>('/api/ground-items')
      setGroundItems(data.items)
    } catch (err) { }
  }

  useEffect(() => {
    loadGroundItems()
  }, [locationData, groundItemsKey])

  useEffect(() => {
    setPlayersHere([])
    apiFetch<{ players: PlayerAtLocation[] }>('/api/location/players-here')
      .then(data => setPlayersHere(data.players))
      .catch(() => setPlayersHere([]))

    if (isEmberra) {
      apiFetch<any>('/api/smithing/status').then(data => {
        setSmithingStatus(data)
      })
      apiFetch<any>('/api/quests').then(data => {
        const blacksmithQuest = data.quests?.find((q: any) => q.name === "The Blacksmith's Bargain")
        if (blacksmithQuest) setQuestStatus(blacksmithQuest.status)
      })
    }

    if (isVerdale) {
      apiFetch<any>('/api/carpentry/status').then(data => {
        setCarpentryStatus(data)
      })
    }

    if (isCaliwen) {
      apiFetch<any>('/api/tanning/status').then(data => {
        setTanningStatus(data)
      }).catch(() => setTanningStatus(null))
    }

    // Sprung traps at this location — surfaces on the Hunting Grounds button
    apiFetch<any>('/api/trapping/traps')
      .then(data => setTrapsCaught((data.traps || []).filter((t: any) => t.sprung).length))
      .catch(() => setTrapsCaught(0))

    if (location?.id) {
      apiFetch<{ npcs: any[] }>(`/api/npcs/location/${location.id}`).then(data => {
        setNpcs(data.npcs || [])
      })
    }
  }, [locationData, smithingStatusKey])

  const woodcuttingNodes = nodes.filter((n: any) => n.skill === 'woodcutting')
  const miningNodes = nodes.filter((n: any) => n.skill === 'mining' && n.name.toLowerCase().includes('rock'))
  const huntableAnimals = locationData?.huntableAnimals || []
  const foragingHabitats = locationData?.foragingHabitats || []

  const handlePickup = async (groundItemId: number) => {
    try {
      const data = await apiFetch<{ itemName: string; quantity: number }>('/api/ground-items/pickup', {
        method: 'POST',
        body: JSON.stringify({ groundItemId }),
      })
      loadGroundItems()
      onInventoryUpdate?.()
    } catch (err: any) {
      console.error('Pickup failed:', err.message)
    }
  }

  const [showTallyLink, setShowTallyLink] = useState(true)

  useEffect(() => {
    apiFetch<{ show: boolean }>('/api/tally/link')
      .then(d => setShowTallyLink(d.show))
      .catch(() => setShowTallyLink(true))   // fail open
  }, [location?.id])

  return (
    <aside className={`location-panel panel location-panel--${layout}`}>

      {/* Location actions */}
      <div className="location-panel-section">
        <div className="panel-title" style={{ cursor: 'pointer' }} onClick={() => { console.log('Location refresh clicked'); onLocationRefresh?.() }}>
          {locationData?.location?.name || 'Location Menu'}
        </div>

        {woodcuttingNodes.map((node: any) => (
          <button
            key={node.id}
            className={`location-action-btn ${currentAction === 'woodcutting' ? 'active' : ''}`}
            onClick={() => onStartAction('woodcutting', node.id)}
          >
            Chop {node.name}
          </button>
        ))}

        {npcs.filter(npc => !npc.submenu).map(npc => (
          <button
            key={npc.id}
            className="location-action-btn npc"
            onClick={() => setActiveNpcId(npc.id)}
          >
            {npc.avatar} Speak with {npc.name}
          </button>
        ))}

        {miningNodes.map((node: any) => (
          <button
            key={node.id}
            className={`location-action-btn ${currentAction === 'mining_rock' ? 'active' : ''}`}
            onClick={() => onStartAction('mining_rock', node.id)}
          >
            Mine {node.name}
          </button>
        ))}

        {veins.map((vein: any) => (
          <button
            key={vein.id}
            className={`location-action-btn vein ${currentAction === 'mining_vein' ? 'active' : ''}`}
            onClick={() => onStartAction('mining_vein', vein.id)}
          >
            ⛏ {vein.ore_name} Vein ({vein.remaining_quantity})
          </button>
        ))}

        {huntableAnimals.length > 0 && (
          <button
            className={`location-action-btn`}
            onClick={() => onStartAction('hunting_menu', 0)}
          >
            Hunting Grounds →
            {trapsCaught > 0 && (
              <span className="gold-text"> ({trapsCaught} caught!)</span>
            )}
          </button>
        )}

        {foragingHabitats.length > 0 && (
          <button
            className={`location-action-btn ${currentAction === 'foraging' ? 'active' : ''}`}
            onClick={() => onStartAction('foraging_menu', 0)}
          >
            Forage the Forest →
          </button>
        )}

        {/* Tally board. Top level and unconditional: it reports work from
            everywhere, so it must be reachable everywhere, and it doubles as
            the prompt to raise one. */}
        {showTallyLink && (
          <button className="location-action-btn" onClick={() => setTallyOpen(true)}>
            Tally Board →
          </button>
        )}

        {isNovita && (
          <div className="location-submenu">
            <button
              className={`location-action-btn submenu-toggle ${farmsteadOpen ? 'open' : ''}`}
              onClick={() => setFarmsteadOpen(!farmsteadOpen)}
            >
              {farmsteadOpen ? '▼' : '▶'} Farmstead
            </button>
            {farmsteadOpen && (
              <div className="submenu-items">

                {npcs.filter(npc => npc.submenu === 'farmstead').map(npc => (
                  <button
                    key={npc.id}
                    className="location-action-btn sub npc"
                    onClick={() => setActiveNpcId(npc.id)}
                  >
                    {npc.avatar} Speak with {npc.name}
                  </button>
                ))}

                <button
                  className={`location-action-btn sub ${currentAction === 'farming' ? 'active' : ''}`}
                  onClick={() => onStartAction('farm_panel', 0)}
                >
                  Your Homestead →
                </button>

              </div>
            )}
          </div>
        )}

        {/* Smithing — Emberra only */}
        {isEmberra && (
          <div className="location-submenu">
            <button
              className={`location-action-btn submenu-toggle ${forgeOpen ? 'open' : ''}`}
              onClick={() => setForgeOpen(!forgeOpen)}
            >
              {forgeOpen ? '▼' : '▶'} Forge
            </button>
            {forgeOpen && (
              <div className="submenu-items">

                {/* NPCs in forge submenu */}
                {npcs.filter(npc => npc.submenu === 'forge').map(npc => (
                  <button
                    key={npc.id}
                    className="location-action-btn sub npc"
                    onClick={() => setActiveNpcId(npc.id)}
                  >
                    {npc.avatar} Speak with {npc.name}
                  </button>
                ))}

                {/* Workstation setup */}
                {smithingStatus && !smithingStatus.workstation && questStatus === 'completed' && (
                  <button
                    className="location-action-btn sub"
                    onClick={() => onStartAction('smithing_setup', 0)}
                  >
                    Set Up Workstation
                  </button>
                )}

                {/* Kiln */}
                {(questStatus === 'active' || questStatus === 'completed') && (
                  smithingStatus?.kilnStatus ? (
                    smithingStatus.kilnStatus.isReady ? (
                      <button
                        className="location-action-btn sub gold"
                        onClick={() => onStartAction('kiln_collect', 0)}
                      >
                        Collect Charc ({smithingStatus.kilnStatus.charcYield})
                      </button>
                    ) : (
                      <div className="location-action-info">
                        Kiln burning... {smithingStatus.kilnStatus.minutesRemaining}m
                      </div>
                    )
                  ) : (
                    <button
                      className="location-action-btn sub"
                      onClick={() => onStartAction('kiln_load', 0)}
                    >
                      Load Kiln
                    </button>
                  )
                )}

                {/* Smelt — available once quest started */}
                {(questStatus === 'active' || questStatus === 'completed' || smithingStatus?.workstation?.is_active) && (
                  <button
                    className={`location-action-btn sub ${currentAction === 'smelting' ? 'active' : ''}`}
                    onClick={() => onStartAction('smelting', 'ambren')}
                  >
                    Smelt Ambren Ingots
                    {!smithingStatus?.workstation?.is_active && (
                      <span className="muted-text" style={{ fontSize: '11px', marginLeft: '4px' }}>(slow)</span>
                    )}
                  </button>
                )}

                {/* Smith — available once quest complete */}
                {(questStatus === 'completed' || smithingStatus?.workstation?.is_active) && (
                  <button
                    className={`location-action-btn sub ${(currentAction === 'smithing' || currentAction === 'crafting') ? 'active' : ''}`}
                    onClick={() => onStartAction('smithing_menu', 0)}
                  >
                    Smith Ambren Items →
                  </button>
                )}

              </div>
            )}
          </div>
        )}

        {/* Carpentry — Verdale only */}
        {isVerdale && (
          <div className="location-submenu">
            <button
              className={`location-action-btn submenu-toggle ${workshopOpen ? 'open' : ''}`}
              onClick={() => setWorkshopOpen(!workshopOpen)}
            >
              {workshopOpen ? '▼' : '▶'} Workshop
            </button>
            {workshopOpen && (
              <div className="submenu-items">

                {npcs.filter(npc => npc.submenu === 'workshop').map(npc => (
                  <button
                    key={npc.id}
                    className="location-action-btn sub npc"
                    onClick={() => setActiveNpcId(npc.id)}
                  >
                    {npc.avatar} Speak with {npc.name}
                  </button>
                ))}

                {carpentryStatus?.questStatus === 'completed' && !carpentryStatus.workstation && (
                  <button
                    className="location-action-btn sub"
                    onClick={() => onStartAction('carpentry_setup', 0)}
                  >
                    Set Up Workstation
                  </button>
                )}

                {carpentryStatus?.canSaw && (
                  <button
                    className={`location-action-btn sub ${(currentAction === 'sawing' || currentAction === 'woodworking' || currentAction === 'crafting') ? 'active' : ''}`}
                    onClick={() => onStartAction('carpentry_menu', 0)}
                  >
                    Carpentry Workshop →
                    {!carpentryStatus?.workstation?.is_active && (
                      <span className="muted-text" style={{ fontSize: '11px', marginLeft: '4px' }}>(slow)</span>
                    )}
                  </button>
                )}

              </div>
            )}
          </div>
        )}

        {/* Crafting — Caliwen only */}
        {isCaliwen && (
          <div className="location-submenu">
            <button
              className={`location-action-btn submenu-toggle ${craftworksOpen ? 'open' : ''}`}
              onClick={() => setCraftworksOpen(!craftworksOpen)}
            >
              {craftworksOpen ? '▼' : '▶'} Craftworks
            </button>
            {craftworksOpen && (
              <div className="submenu-items">

                {npcs.filter(npc => npc.submenu === 'craftworks').map(npc => (
                  <button
                    key={npc.id}
                    className="location-action-btn sub npc"
                    onClick={() => setActiveNpcId(npc.id)}
                  >
                    {npc.avatar} Speak with {npc.name}
                  </button>
                ))}

                {/* Tanning rack */}
                {!tanningStatus?.hasRack ? (
                  tanningStatus?.canSetup ? (
                    <button
                      className="location-action-btn sub"
                      onClick={() => onStartAction('tanning_setup', 0)}
                    >
                      Set Up Tannery
                    </button>
                  ) : (
                    <div className="location-action-info">
                      No tannery here. Build a rack and a barrel in Verdale.
                    </div>
                  )
                ) : (
                  <>
                    {(tanningStatus?.vats || []).map((vat: any) => (
                      vat.isReady ? (
                        <button
                          key={vat.id}
                          className="location-action-btn sub gold"
                          onClick={() => onStartAction('tanning_collect', vat.id)}
                        >
                          Collect {vat.yield}× {vat.outputItemName}
                        </button>
                      ) : (
                        <div key={vat.id} className="location-action-info">
                          {vat.hideCount} hide{vat.hideCount > 1 ? 's' : ''} soaking... {vat.minutesRemaining}m
                        </div>
                      )
                    ))}

                    {tanningStatus && tanningStatus.vatsInUse < tanningStatus.maxVats && (
                      <button
                        className="location-action-btn sub"
                        onClick={() => onStartAction('tanning_load', 0)}
                      >
                        Fill a Vat ({tanningStatus.vatsInUse}/{tanningStatus.maxVats})
                      </button>
                    )}
                  </>
                )}

                {/* Bench */}
                <button
                  className={`location-action-btn sub ${currentAction === 'crafting' ? 'active' : ''}`}
                  onClick={() => onStartAction('crafting_menu', 0)}
                >
                  Crafting Bench →
                </button>

              </div>
            )}
          </div>
        )}
      </div>

      <div className="divider" />

      {/* Players at location */}
      <div className="location-panel-section">
        <div className="panel-title">Players Here</div>
        {playersHere.length === 0 ? (
          <p className="location-panel-empty">No other players here.</p>
        ) : (
          playersHere.map(p => (
            <div key={p.id} className="location-player">
              <span
                className="location-player-name gold-text"
                style={{ cursor: 'pointer' }}
                onClick={() => onViewProfile?.(p.id)}
              >
                {p.username}
              </span>
              {locationData?.location?.name === 'Talador' && p.id !== currentPlayerId && (
                <button
                  className="btn"
                  style={{ fontSize: '11px', padding: '2px 6px' }}
                  onClick={() => onRequestTrade?.(p.id)}
                >
                  Trade
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div className="divider" />

      {/* Ground items */}
      <div className="location-panel-section">
        <div className="panel-title">
          <span>On the Ground</span>
        </div>
        {groundItems.length === 0 ? (
          <p className="location-panel-empty">Nothing on the ground.</p>
        ) : (
          <div className="ground-items-grid">
            {groundItems.map(item => (
              <div
                key={item.id}
                className="ground-item-slot"
                title={`${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ''}\nClick to pick up`}
                onClick={() => handlePickup(item.id)}
              >
                <img
                  src={getItemIcon(item.name)}
                  alt={item.name}
                  className="inventory-item-icon"
                  onError={e => {
                    e.currentTarget.style.display = 'none'
                    e.currentTarget.nextElementSibling?.removeAttribute('style')
                  }}
                />
                <span className="inventory-item-text" style={{ display: 'none' }}>{item.name.split(' ')[0]}</span>
                {item.quantity > 1 && (
                  <span className="inventory-item-qty">{item.quantity}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {activeNpcId && (
        <NPCDialogue
          npcId={activeNpcId}
          onClose={() => setActiveNpcId(null)}
          onInteraction={() => {
            // Refresh quest status and smithing status
            apiFetch<any>('/api/smithing/status').then(data => setSmithingStatus(data))
            apiFetch<any>('/api/quests').then(data => {
              const blacksmithQuest = data.quests?.find((q: any) => q.name === "The Blacksmith's Bargain")
              if (blacksmithQuest) setQuestStatus(blacksmithQuest.status)
            })
          }}
        />
      )}

      {tallyOpen && <TallyBoardPanel onClose={() => setTallyOpen(false)} />}

    </aside>
  )
}