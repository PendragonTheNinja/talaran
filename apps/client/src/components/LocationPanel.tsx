import { useState, useEffect, useCallback } from 'react'
import TallyBoardPanel from './TallyBoardPanel'
import { apiFetch } from '../lib/api'
import './LocationPanel.css'
import { getItemIcon } from '../lib/items'
import NPCDialogue from './NPCDialogue'
import Badge from './Badge'
import ConfirmModal from './ConfirmModal'
import MarketplaceMenu from './MarketplaceMenu'
import TravellingMerchantMenu from './TravellingMerchantMenu'
import MuseumPanel from './MuseumPanel'
import ShopsMenu from './ShopsMenu'
import MyShopMenu from './MyShopMenu'
import { useItemTooltip } from './ItemTooltip'
import { useWorldEvents, isMerchant } from '../lib/worldEvents'
import './EventsPanel.css'

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
  const [merchantOpen, setMerchantOpen] = useState(false)
  // Ground items get the same tooltip the pack does.
  const { hoverProps, tooltipEl } = useItemTooltip()
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
  const [lapidaryStation, setLapidaryStation] = useState<{ exists: boolean; isActive: boolean } | null>(null)
  const [lapidaryQuestStatus, setLapidaryQuestStatus] = useState<string | null>(null)
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

  // Your own stacks here that only you can see yet: a death pile, taken back
  // in one go while it is still private (POST /api/ground-items/take-back).
  // Once the window closes the button goes, for you as for anyone, and stacks
  // are picked up one at a time (Nathan, 2026-10-12).
  // Read at once whenever the list changes, then every few seconds, while any
  // stack here is the player's own.
  const [groundClock, setGroundClock] = useState(0)
  const ownStacks = groundItems.filter(i => i.dropped_by_player_id === currentPlayerId)
  const ownPrivate = ownStacks.filter(i => new Date(i.visible_to_all_at).getTime() > groundClock)
  const privateUntil = ownPrivate.reduce((t, i) => Math.max(t, new Date(i.visible_to_all_at).getTime()), 0)
  const showTakeBack = groundClock > 0 && ownPrivate.length >= 2
  useEffect(() => {
    if (!ownStacks.length) return
    const tick = () => setGroundClock(Date.now())
    const first = window.setTimeout(tick, 0)
    const t = window.setInterval(tick, 5000)
    return () => { clearTimeout(first); clearInterval(t) }
  }, [ownStacks.length, groundItems])
  const [takingBack, setTakingBack] = useState(false)
  // Gear worn at death goes back on when its stack is taken back while still
  // private, by the button or one at a time (services/equipment.ts
  // restoreDeathLoadoutWithin). The paper doll refreshes from the server's
  // equipment_changed push; this only says so.
  const announceReequipped = (names?: string[]) => {
    if (!names?.length) return
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
    window.dispatchEvent(new CustomEvent('talaran:notice', {
      detail: { message: `You put your ${list} back on.`, type: 'success' },
    }))
  }
  const takeBack = async () => {
    setTakingBack(true)
    try {
      const data = await apiFetch<{ reequipped?: string[] }>('/api/ground-items/take-back', { method: 'POST' })
      announceReequipped(data.reequipped)
    } catch (err) {
      window.dispatchEvent(new CustomEvent('talaran:notice', {
        detail: { message: (err instanceof Error && err.message) || 'That did not work.', type: 'error' },
      }))
    } finally {
      setTakingBack(false)
      loadGroundItems()
    }
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
  const fightingSpots: { id: number; name: string }[] = locationData?.fightingSpots || []

  const handlePickup = async (groundItemId: number) => {
    try {
      const data = await apiFetch<{ itemName: string; quantity: number; reequipped?: string[] }>('/api/ground-items/pickup', {
        method: 'POST',
        body: JSON.stringify({ groundItemId }),
      })
      announceReequipped(data.reequipped)
      // The pack refreshes from the server's inventory_changed push.
      loadGroundItems()
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
    if (isCaliwen) {
      apiFetch<{ exists: boolean; isActive: boolean }>('/api/workstations/lapidary').then(setLapidaryStation).catch(() => setLapidaryStation(null))
      apiFetch<{ quests?: { name: string; status: string }[] }>('/api/quests').then(data => {
        const q = data.quests?.find(x => x.name === "The Lapidary's Lesson")
        if (q) setLapidaryQuestStatus(q.status)
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

  // Geosper's wheel is open from accepting his quest; a lapidary of your own
  // (any tool socketed) is yours whatever the quest says.
  const lapidaryUnlocked = lapidaryQuestStatus === 'active' || lapidaryQuestStatus === 'completed' || !!lapidaryStation?.exists

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

  // The museum standing here, if any: asked of the server, so a second
  // island's museum needs no change here.
  const [museum, setMuseum] = useState<{ id: number; name: string } | null>(null)
  const [museumOpen, setMuseumOpen] = useState(false)
  useEffect(() => {
    let cancelled = false
    apiFetch<{ museum: { id: number; name: string } | null }>('/api/museum/here')
      .then(d => { if (!cancelled) setMuseum(d.museum) })
      .catch(() => { if (!cancelled) setMuseum(null) })
    return () => { cancelled = true }
  }, [location?.id])

  const worldEvents = useWorldEvents()
  const eventsHere = worldEvents.live.filter(e => e.locationId === location?.id)
  const merchantHere = eventsHere.some(isMerchant)

  return (
    <aside className={`location-panel panel location-panel--${layout}`}>

      {/* Location actions */}
      <div className="location-panel-section">
        <div className="panel-title" style={{ cursor: 'pointer' }} onClick={() => onLocationRefresh?.()}>
          {locationData?.location?.name || 'Location Menu'}
        </div>
        {/* A world event on here: what it favours, and for how long. */}
        {eventsHere.map(e => (
          <div key={e.id} className="location-event">
            <span className="location-event-name">{e.name}</span>
            {e.skill && <> · +{e.bonusPercent}% {e.skill} XP here</>}
            {isMerchant(e) ? ' is here' : ''}
            {' · '}{e.poolLeft.toLocaleString()} {isMerchant(e) ? 'goods unsold' : 'left'}
          </div>
        ))}
        {merchantHere && (
          <button className="location-action-btn" onClick={() => setMerchantOpen(true)}>
            The Travelling Merchant →
          </button>
        )}

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

        {/* A rift: gems are filled here (services/talar.ts). The flag is the
            location row's own, so any later rift gets this with no client change. */}
        {location?.is_rift && (
          <button
            className={`location-action-btn ${currentAction === 'talar_fill' ? 'active' : ''}`}
            onClick={() => onStartAction('talar_fill_menu', 0)}
          >
            Fill a Gem →
          </button>
        )}

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

        {/* Places to fight (docs/combat-spec.md §8). Each opens its menu:
            take what comes, or pick a creature at a chosen spot. */}
        {fightingSpots.map(spot => (
          <button
            key={`fight-${spot.id}`}
            className={`location-action-btn ${currentAction === 'combat' ? 'active' : ''}`}
            onClick={() => onStartAction('fight_menu', spot.id)}
          >
            {spot.name} →
          </button>
        ))}

        {/* Tally board. Top level and unconditional: it reports work from
            everywhere, so it must be reachable everywhere, and it doubles as
            the prompt to raise one. */}
        {showTallyLink === true && (
          <button className="location-action-btn" onClick={() => setTallyOpen(true)}>
            Tally Board →
          </button>
        )}

        {museum && (
          <button className="location-action-btn" onClick={() => setMuseumOpen(true)}>
            {museum.name} →
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

                {/* Lapidary: gems are cut here, and later set into jewelry.
                    Gated on Geosper's quest like the other keepers' benches. */}
                {lapidaryUnlocked ? (
                  <>
                    <button
                      className="location-action-btn sub"
                      onClick={() => onStartAction('workstation_lapidary', 0)}
                    >
                      Your Lapidary
                      {!lapidaryStation?.isActive && (
                        <span className="station-tag warn">(incomplete)</span>
                      )}
                    </button>
                    <button
                      className={`location-action-btn sub ${currentAction === 'crafting' ? 'active' : ''}`}
                      onClick={() => onStartAction('lapidary_menu', 0)}
                    >
                      Lapidary →
                      {!lapidaryStation?.isActive && (
                        <span className="station-tag warn">(Geosper's wheel)</span>
                      )}
                    </button>
                  </>
                ) : (
                  <>
                    <button className="location-action-btn sub locked" onClick={locked('Geosper')}>
                      Your Lapidary
                      <span className="station-tag locked">(locked)</span>
                    </button>
                    <button className="location-action-btn sub locked" onClick={locked('Geosper')}>
                      Lapidary →
                      <span className="station-tag locked">(locked)</span>
                    </button>
                  </>
                )}

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
        {showTakeBack && (
          <div className="ground-take-back">
            <button className="btn btn-gold" disabled={takingBack} onClick={takeBack}>
              Take back your things ({ownPrivate.length})
            </button>
            <span className="muted-text">
              Only you can see these for {Math.max(1, Math.ceil((privateUntil - groundClock) / 60000))} more minute{Math.ceil((privateUntil - groundClock) / 60000) > 1 ? 's' : ''}.
            </span>
          </div>
        )}
        {groundItems.length === 0 ? (
          <p className="location-panel-empty">Nothing on the ground.</p>
        ) : (
          <div className="ground-items-grid">
            {groundItems.map(item => (
              <div
                key={item.id}
                className="ground-item-slot"
                {...hoverProps(item, 'Left-click to pick up')}
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

      {museumOpen && museum && (
        <MuseumPanel museumId={museum.id} onClose={() => setMuseumOpen(false)} />
      )}

      {merchantOpen && (
        <TravellingMerchantMenu
          onClose={() => setMerchantOpen(false)}
          onGoldChanged={handleGoldChanged}
        />
      )}

      {marketplaceOpen && (
        <MarketplaceMenu
          onClose={() => setMarketplaceOpen(false)}
          onGoldChanged={handleGoldChanged}
        />
      )}

      {tooltipEl}
    </aside>
  )
}