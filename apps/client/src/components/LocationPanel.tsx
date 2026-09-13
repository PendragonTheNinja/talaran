import { useState, useEffect, useCallback } from 'react'
import TallyBoardPanel from './TallyBoardPanel'
import { apiFetch } from '../lib/api'
import './LocationPanel.css'
import { getItemIcon } from '../lib/items'
import NPCDialogue from './NPCDialogue'
import Badge from './Badge'
import ConfirmModal from './ConfirmModal'
import MarketplaceMenu from './MarketplaceMenu'
import ShopsMenu from './ShopsMenu'
import MyShopMenu from './MyShopMenu'

interface GroundItem {
  id: number
  item_name: string
  quantity: number
  dropped_by: string
}

/** What the water is called, per place. Luxmere is a lake; Dawncrest is coast. */
const WATER_LABELS: Record<string, string> = {
  Luxmere: 'Fish the Lake',
  Dawncrest: 'Fish the Sea',
}

interface PlayerAtLocation {
  id: number
  username: string
  /** Same column chat reads, so a tag looks identical wherever a name appears. */
  guild_tag?: string | null
  badge_key?: string | null
  badge?: string | null
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
  const [marketplaceOpen, setMarketplaceOpen] = useState(false)
  const [shopsOpen, setShopsOpen] = useState(false)
  const [shopUnseen, setShopUnseen] = useState(0)
  const [myShopOpen, setMyShopOpen] = useState(false)

  /* Gold lives on playerData, so a purchase has to refresh it or the skills
     header keeps showing the old purse. Memoised because the marketplace panel
     would otherwise see a new function on every render of this one. */
  /* The badge is the whole notification system: passive, self-collapsing, and
     impossible to spam with. Opening History clears it. */
  const refreshShopBadge = useCallback(() => {
    apiFetch<{ count: number }>('/api/shops/mine/unseen')
      .then(r => setShopUnseen(r.count))
      .catch(() => { })
  }, [])

  const handleGoldChanged = useCallback(() => {
    onLocationRefresh?.()
    onInventoryUpdate?.()
  }, [onLocationRefresh, onInventoryUpdate])
  const [smithingStatus, setSmithingStatus] = useState<any>(null)

  const [carpentryStatus, setCarpentryStatus] = useState<any>(null)
  // The cookhouse uses the generic workstation endpoint rather than a bespoke
  // status route, since that already reports whether the rack is complete.
  const [cookingStation, setCookingStation] = useState<any>(null)
  const [cookQuestStatus, setCookQuestStatus] = useState<string | null>(null)
  const [workshopOpen, setWorkshopOpen] = useState(false)
  const [cookhouseOpen, setCookhouseOpen] = useState(false)
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
  const isPhoenwick = location?.name === 'Phoenwick'
  const isNovita = location?.name === 'Novita'
  const isTalador = location?.name === 'Talador'

  useEffect(() => {
    if (isTalador) refreshShopBadge()
  }, [isTalador, refreshShopBadge])

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

    refreshStations()

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
  const fishSpeciesCount = locationData?.fishSpeciesCount || 0

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

  /**
   * A workstation you have not been given the run of yet.
   *
   * The submenu still renders, because a town with no visible work reads as
   * broken rather than as locked. Clicking says who to ask instead of doing
   * nothing.
   */
  /**
   * Re-read whichever station this location has.
   *
   * Called on arrival and again after any NPC interaction, so accepting a quest
   * flips the links from (locked) to (her hearth) without a page refresh. This
   * used to refresh smithing only, which is why Verdale and Phoenwick sat stale
   * until you reloaded.
   */
  /**
   * A campfire burns for half an hour, so the link has to appear the moment it
   * is lit and go the moment it goes out. Counted down locally; the server is
   * the authority and sweeps the row on read, so this only has to look right.
   */
  const [fireLeft, setFireLeft] = useState<number | null>(null)

  useEffect(() => {
    setFireLeft(cookingStation?.isTemporary ? cookingStation.secondsLeft : null)
  }, [cookingStation?.isTemporary, cookingStation?.secondsLeft])

  useEffect(() => {
    if (fireLeft === null) return
    const t = setInterval(() => {
      setFireLeft(v => {
        if (v === null) return null
        if (v <= 1) { setCookingStation(null); return null }
        return v - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [fireLeft === null])

  useEffect(() => {
    const onLit = () => {
      apiFetch<any>('/api/workstations/cooking').then(setCookingStation).catch(() => {})
    }
    window.addEventListener('talaran:campfire-lit', onLit)
    return () => window.removeEventListener('talaran:campfire-lit', onLit)
  }, [])

  /**
   * Build a hearth. Asks the server for the cost first so the prompt names real
   * materials rather than the client keeping its own copy of the list.
   */
  const [confirmHearth, setConfirmHearth] = useState<
    { cost: { itemName: string; qty: number }[]; seconds: number; tool?: string } | null
  >(null)

  const buildHearth = async () => {
    try {
      const q = await apiFetch<{ cost: { itemName: string; qty: number }[]; seconds: number; tool?: string }>(
        '/api/workstations/hearth/cost',
      )
      setConfirmHearth(q)
    } catch (err: any) {
      window.dispatchEvent(new CustomEvent('talaran:notice', {
        detail: { message: err.message || 'That did not work.', type: 'error' },
      }))
    }
  }

  const refreshStations = () => {
    if (isEmberra) {
      apiFetch<any>('/api/smithing/status').then(setSmithingStatus).catch(() => {})
      apiFetch<any>('/api/quests').then(data => {
        const q = data.quests?.find((x: any) => x.name === "The Blacksmith's Bargain")
        if (q) setQuestStatus(q.status)
      }).catch(() => {})
    }
    if (isVerdale) {
      apiFetch<any>('/api/carpentry/status').then(setCarpentryStatus).catch(() => {})
    }
    // Fetched everywhere, not just Phoenwick: a campfire can be lit anywhere,
    // and it is the same cooking station row.
    apiFetch<any>('/api/workstations/cooking').then(setCookingStation).catch(() => setCookingStation(null))

    if (isPhoenwick) {
      apiFetch<any>('/api/quests').then(data => {
        const q = data.quests?.find((x: any) => x.name === "The Cook's Conundrum")
        if (q) setCookQuestStatus(q.status)
      }).catch(() => {})
    }
  }

  /**
   * A hearth is a PERMANENT station. Not merely a row.
   *
   * `exists` is true for any cooking workstation, and two things create one
   * that is not a hearth: socketing a tool back when the hearth was a slot, and
   * lighting a campfire, which is a cooking row with an expiry on it. Gating
   * the build button on `exists` alone therefore hid it from exactly the people
   * who needed it.
   */
  const hasHearth = !!cookingStation?.exists && !cookingStation?.isTemporary

  const cookUnlocked = cookQuestStatus === 'active' || cookQuestStatus === 'completed' || !!cookingStation?.exists

  const locked = (npcName: string) => () => {
    window.dispatchEvent(new CustomEvent('talaran:notice', {
      detail: { message: `Speak to ${npcName} for the use of this place.`, type: 'error' },
    }))
  }

  // null means "not answered yet", and nothing renders until it is.
  //
  // This used to start at true, so the link painted on the first frame and then
  // vanished once the server said to hide it. A player who had turned it off
  // saw it flash on every refresh, which is worse than a slightly late link.
  // Failure still opens the link, just after the request settles rather than
  // before it is sent.
  const [showTallyLink, setShowTallyLink] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    apiFetch<{ show: boolean }>('/api/tally/link')
      .then(d => { if (!cancelled) setShowTallyLink(d.show) })
      .catch(() => { if (!cancelled) setShowTallyLink(true) })   // fail open
    // Travelling remounts this with a new location before the old request
    // lands; without the guard the stale answer wins and the flash returns.
    return () => { cancelled = true }
  }, [location?.id])

  return (
    <aside className={`location-panel panel location-panel--${layout}`}>

      {/* Location actions */}
      <div className="location-panel-section">
        <div className="panel-title" style={{ cursor: 'pointer' }} onClick={() => onLocationRefresh?.()}>
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

        {fishSpeciesCount > 0 && (
          <button
            className={`location-action-btn ${String(currentAction || '').startsWith('fishing_') ? 'active' : ''}`}
            onClick={() => onStartAction('fishing_menu', 0)}
          >
            {/* Named for what is actually out there. Anywhere not listed keeps
                the generic label. */}
            {WATER_LABELS[locationData?.location?.name ?? ''] ?? 'Fish the Water'} →
          </button>
        )}

        {/* Tally board. Top level and unconditional: it reports work from
            everywhere, so it must be reachable everywhere, and it doubles as
            the prompt to raise one. */}
        {showTallyLink === true && (
          <button className="location-action-btn" onClick={() => setTallyOpen(true)}>
            Tally Board →
          </button>
        )}

        {isTalador && (
          <button className="location-action-btn" onClick={() => setMarketplaceOpen(true)}>
            Taiar Marketplace →
          </button>
        )}

        {isTalador && (
          <button className="location-action-btn" onClick={() => setShopsOpen(true)}>
            Player Shops
            {shopUnseen > 0 && <span className="location-badge">{shopUnseen > 99 ? '99+' : shopUnseen}</span>}
            {' →'}
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
                {/* Your own bench. Opens the tool rack whether or not anything
                    is on it: fitting the first tool is what sets it up, so
                    there is no separate "set up workstation" step any more. */}
                {questStatus === 'completed' ? (
                  <button
                    className="location-action-btn sub"
                    onClick={() => onStartAction('workstation_smithing', 0)}
                  >
                    Your Tool Rack
                    {!smithingStatus?.workstation?.is_active && (
                      <span className="station-tag warn">(incomplete)</span>
                    )}
                  </button>
                ) : (
                  <button className="location-action-btn sub locked" onClick={locked('Geoffrey')}>
                    Your Tool Rack
                    <span className="station-tag locked">(locked)</span>
                  </button>
                )}

                {/* Kiln: its own entry in the submenu, above the bench. */}
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

                {/* One bench, two halves. Smelting needs only the quest started;
                    the anvil needs it finished, so the menu opens either way and
                    the Anvil tab is simply empty until the player qualifies. */}
                {(questStatus === 'active' || questStatus === 'completed' || smithingStatus?.workstation?.is_active) ? (
                  <button
                    className={`location-action-btn sub ${(currentAction === 'smelting' || currentAction === 'smithing' || currentAction === 'crafting') ? 'active' : ''}`}
                    onClick={() => onStartAction('forge_menu', 0)}
                  >
                    Work the Forge →
                    {!smithingStatus?.workstation?.is_active && (
                      <span className="station-tag warn">(smith's forge)</span>
                    )}
                  </button>
                ) : (
                  <button className="location-action-btn sub locked" onClick={locked('Geoffrey')}>
                    Work the Forge →
                    <span className="station-tag locked">(locked)</span>
                  </button>
                )}

              </div>
            )}
          </div>
        )}

        {/* A campfire, wherever it was lit. Temporary by nature, so it sits on
            its own rather than inside a town's submenu, and it reuses the same
            cookhouse menu: only the plain roasting recipes will run on it. */}
        {fireLeft !== null && (
          <button
            className={`location-action-btn ${currentAction === 'crafting' ? 'active' : ''}`}
            onClick={() => onStartAction('campfire_menu', 0)}
          >
            Your Campfire →
            <span className="station-tag warn">
              ({Math.floor(fireLeft / 60)}m {String(fireLeft % 60).padStart(2, '0')}s)
            </span>
          </button>
        )}

        {/* Cooking — Phoenwick only. Gated on Geomima's quest the same way the
            forge and workshop are gated on theirs: her hearth is a favour, not
            a public amenity. */}
        {isPhoenwick && (
          <div className="location-submenu">
            <button
              className={`location-action-btn submenu-toggle ${cookhouseOpen ? 'open' : ''}`}
              onClick={() => setCookhouseOpen(!cookhouseOpen)}
            >
              {cookhouseOpen ? '▼' : '▶'} Cookhouse
            </button>
            {cookhouseOpen && (
              <div className="submenu-items">
                {/* A hearth is mortared stone, so it is built once and never
                    carried. Until it exists there is no rack to open. */}
                {cookUnlocked && !hasHearth && (
                  <button
                    className="location-action-btn sub"
                    onClick={() => buildHearth()}
                  >
                    Build Your Hearth
                  </button>
                )}

                {cookUnlocked && hasHearth ? (
                  <button
                    className="location-action-btn sub"
                    onClick={() => onStartAction('workstation_cooking', 0)}
                  >
                    Your Tool Rack
                    {!cookingStation?.isActive && (
                      <span className="station-tag warn">(incomplete)</span>
                    )}
                  </button>
                ) : cookUnlocked ? null : (
                  <button className="location-action-btn sub locked" onClick={locked('Geomima')}>
                    Your Tool Rack
                    <span className="station-tag locked">(locked)</span>
                  </button>
                )}

                {cookUnlocked ? (
                  <button
                    className={`location-action-btn sub ${currentAction === 'crafting' ? 'active' : ''}`}
                    onClick={() => onStartAction('cooking_menu', 0)}
                  >
                    Cook →
                    {/* No hearth of your own means you are on hers, whatever
                        stray workstation row may exist. */}
                    {!hasHearth && (
                      <span className="station-tag warn">(her hearth)</span>
                    )}
                  </button>
                ) : (
                  <button className="location-action-btn sub locked" onClick={locked('Geomima')}>
                    Cook →
                    <span className="station-tag locked">(locked)</span>
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

                {carpentryStatus?.questStatus === 'completed' ? (
                  <button
                    className="location-action-btn sub"
                    onClick={() => onStartAction('workstation_carpentry', 0)}
                  >
                    Your Tool Rack
                    {!carpentryStatus?.workstation?.is_active && (
                      <span className="station-tag warn">(incomplete)</span>
                    )}
                  </button>
                ) : (
                  <button className="location-action-btn sub locked" onClick={locked('Geossica')}>
                    Your Tool Rack
                    <span className="station-tag locked">(locked)</span>
                  </button>
                )}

                {carpentryStatus?.canSaw ? (
                  <button
                    className={`location-action-btn sub ${(currentAction === 'sawing' || currentAction === 'woodworking' || currentAction === 'crafting') ? 'active' : ''}`}
                    onClick={() => onStartAction('carpentry_menu', 0)}
                  >
                    Carpentry Workshop →
                    {!carpentryStatus?.workstation?.is_active && (
                      <span className="station-tag warn">(carpenter's bench)</span>
                    )}
                  </button>
                ) : (
                  <button className="location-action-btn sub locked" onClick={locked('Geossica')}>
                    Carpentry Workshop →
                    <span className="station-tag locked">(locked)</span>
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

        {/* NPCs are people standing in the room, so they belong in the list of
            people standing in the room — pinned above the players and sorted
            among themselves. Clicking one opens their dialogue. */}
        {[...npcs].sort((a, b) => a.name.localeCompare(b.name)).map(npc => (
          <div key={`npc-${npc.id}`} className="location-player location-npc">
            {/* Name first, so NPC names sit on the same left edge as player
                names. The tag trails the name as a label rather than leading it
                as a bullet, which would indent every NPC out of line. */}
            <span
              className="location-player-name npc-name"
              style={{ cursor: 'pointer' }}
              onClick={() => setActiveNpcId(npc.id)}
              title={npc.title ? `${npc.name}, ${npc.title}` : npc.name}
            >
              {npc.name}
            </span>
            <span className="location-npc-tag">NPC</span>
          </div>
        ))}

        {playersHere.length === 0 ? (
          npcs.length === 0 && <p className="location-panel-empty">No other players here.</p>
        ) : (
          playersHere.map(p => (
            <div key={p.id} className="location-player">
              <span
                className="location-player-name gold-text"
                style={{ cursor: 'pointer' }}
                onClick={() => onViewProfile?.(p.id)}
              >
                {p.username}
                {/* Inside the name span, so it sits against the last letter.
                    The guild tag is pushed to the far right by its own margin,
                    and a badge out there reads as another tag rather than as
                    part of who you are. */}
                <Badge badgeKey={p.badge_key} glyph={p.badge} size={20} title="A feat badge" />
              </span>
              {/* Trails the name, matching chat and the highscores. Outside the
                  clickable name so it does not read as part of the profile
                  link. */}
              {p.guild_tag && <span className="location-guild-tag">[{p.guild_tag}]</span>}
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
      {confirmHearth && (
        <ConfirmModal
          message={`Build a hearth here? It takes ${confirmHearth.cost.map(c => `${c.qty} ${c.itemName.toLowerCase()}`).join(', ')}${confirmHearth.tool ? `, a ${confirmHearth.tool.toLowerCase()} in hand` : ''}, and about ${Math.round(confirmHearth.seconds / 60)} minutes. Once it is set it stays here for good.`}
          confirmLabel="Build It"
          onConfirm={async () => {
            setConfirmHearth(null)
            try {
              const res = await apiFetch<{ message: string; timerSeconds: number }>(
                '/api/workstations/hearth', { method: 'POST' },
              )
              // The action exists server-side now, but nothing on screen knows
              // it. Hand the timer up the same way husbandry does, or the
              // player sees nothing happen and tries again.
              onStartAction('build_hearth', res.timerSeconds)
            } catch (err: any) {
              window.dispatchEvent(new CustomEvent('talaran:notice', {
                detail: { message: err.message || 'That did not work.', type: 'error' },
              }))
            }
          }}
          onCancel={() => setConfirmHearth(null)}
        />
      )}

      {activeNpcId && (
        <NPCDialogue
          npcId={activeNpcId}
          onClose={() => setActiveNpcId(null)}
          onInteraction={refreshStations}
        />
      )}

      {tallyOpen && <TallyBoardPanel onClose={() => setTallyOpen(false)} />}

      {shopsOpen && (
        <ShopsMenu
          onClose={() => setShopsOpen(false)}
          onChanged={handleGoldChanged}
          onManage={() => setMyShopOpen(true)}
          onActionStarted={(secs) => { setShopsOpen(false); onStartAction('shop_build', secs) }}
        />
      )}

      {myShopOpen && (
        <MyShopMenu
          onClose={() => { setMyShopOpen(false); refreshShopBadge() }}
          onChanged={handleGoldChanged}
        />
      )}

      {marketplaceOpen && (
        <MarketplaceMenu
          onClose={() => setMarketplaceOpen(false)}
          onGoldChanged={handleGoldChanged}
        />
      )}

    </aside>
  )
}