import { useState, useCallback, useEffect } from 'react'
import TopNav from './TopNav'
import LeftPanel from './LeftPanel'
import GameView from './GameView'
import RightPanel from './RightPanel'
import ChatPanel from './ChatPanel'
import LocationPanel from './LocationPanel'
import { Player } from '../types'
import { apiFetch } from '../lib/api'
import { getSocket } from '../lib/socket'
import './GameLayout.css'
import SmithingMenu from './SmithingMenu'
import GuildPanel from './GuildPanel'
import MessagesPanel from './MessagesPanel'
import ForumPanel from './ForumPanel'
import NewsPanel from './NewsPanel'
import HighscoresPanel from './HighscoresPanel'
import AdminPanel from './AdminPanel'
import SettingsPanel from './SettingsPanel'

interface Skill {
  id: number
  name: string
  type: string
  xp: number
  level: number
  xpToNext: number
}

interface PlayerData {
  player: Player
  skills: Skill[]
  totalLevel: number
  totalXp: number
  currentAction: any
}

interface LocationData {
  location: {
    id: number
    name: string
    region: string
    type: string
    description: string
  } | null
  nodes: {
    id: number
    skill: string
    name: string
    required_level: number
    xp_reward: number
  }[]
  connections: any[]
  allLocations: any[]
}

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
  slot?: string
}

interface EquipmentData {
  head: any | null
  neck: any | null
  back: any | null
  chest: any | null
  mainhand: any | null
  offhand: any | null
  legs: any | null
  hands: any | null
  feet: any | null
  finger: any | null
  mount: any | null
  trophy: any | null
}

interface GameLayoutProps {
  player: Player
  playerData: PlayerData | null
  locationData: LocationData | null
  inventoryData: InventoryItem[]
  equipmentData: EquipmentData | null
  onLogout: () => void
  onPlayerDataUpdate: () => void
  onEquipmentUpdate: () => void
  onInventoryUpdate: () => void
  veinsData: any[]
  onLocationDataUpdate: () => void
}

export default function GameLayout({
  player,
  playerData,
  locationData,
  inventoryData,
  equipmentData,
  onLogout,
  onPlayerDataUpdate,
  onEquipmentUpdate,
  onInventoryUpdate,
  veinsData,
  onLocationDataUpdate,
}: GameLayoutProps) {
  const [travelStatus, setTravelStatus] = useState<{ message: string; seconds: number } | null>(null)

  // Restore travel status on refresh
  useEffect(() => {
    if (!playerData?.currentAction) return
    if (playerData.currentAction.action_type !== 'traveling') return

    const now = new Date().getTime()
    const completesAt = new Date(playerData.currentAction.completes_at).getTime()
    const secondsLeft = Math.max(0, Math.round((completesAt - now) / 1000))

    if (secondsLeft > 0) {
      const destination = playerData.currentAction.location_id
      // Fetch destination name
      apiFetch<{ location: { name: string } }>(`/api/location/${destination}`)
        .then(data => {
          setTravelStatus({
            message: `Traveling to ${data.location?.name || 'destination'}...`,
            seconds: secondsLeft,
          })
        })
        .catch(() => {
          setTravelStatus({
            message: 'Traveling...',
            seconds: secondsLeft,
          })
        })
    }
  }, [playerData])

  const [gameViewAction, setGameViewAction] = useState<{ type: string; id: number } | null>(null)

  const [showKilnModal, setShowKilnModal] = useState(false)
  const [showSmithingMenu, setShowSmithingMenu] = useState(false)

  const [externalMessage, setExternalMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null)

  const [dropMode, setDropMode] = useState(false)
  const [dropAmount, setDropAmount] = useState(1)
  const [groundItemsKey, setGroundItemsKey] = useState(0)

  const [showAdmin, setShowAdmin] = useState(false)
  const [adminClosing, setAdminClosing] = useState(false)

  const [showSettings, setShowSettings] = useState(false)
  const [settingsClosing, setSettingsClosing] = useState(false)

  const handleTravel = async (toLocationId: number, toLocationName: string, _travelTime: number) => {
    try {
      const res = await apiFetch<{ travelTime: number; message: string }>('/api/travel/start', {
        method: 'POST',
        body: JSON.stringify({ toLocationId }),
      })
      setTravelStatus({ message: `Traveling to ${toLocationName}...`, seconds: res.travelTime })
    } catch (err: any) {
      setTravelStatus({ message: err.message || 'Could not travel there', seconds: 0 })
    }
  }

  const handleKilnCollect = async () => {
    try {
      const res = await apiFetch<{ timerSeconds: number }>('/api/smithing/kiln/collect/start', {
        method: 'POST',
      })
      setExternalMessage({ text: 'Collecting Charc...', type: 'info' })
      setGameViewAction({ type: 'kiln_collecting', id: res.timerSeconds })
    } catch (err: any) {
      setExternalMessage({ text: err.message || 'Could not collect Charc.', type: 'error' })
    }
  }

  const handleSmithingSetup = async () => {
    try {
      await apiFetch('/api/smithing/workstation/setup', { method: 'POST' })
      setExternalMessage({ text: 'Workstation set up! You can now smelt and smith at Emberra.', type: 'success' })
      onInventoryUpdate()
    } catch (err: any) {
      setExternalMessage({ text: err.message || 'Could not set up workstation.', type: 'error' })
    }
  }

  const handleLocationAction = useCallback((type: string, id: number | string) => {
    if (type === 'travel') {
      const conn = locationData?.connections.find((c: any) => c.to_location_id === id)
      if (conn) handleTravel(id as number, conn.to_location_name, conn.base_travel_time)
    } else if (type === 'kiln_load') {
      setKilnError(null)
      setShowKilnModal(true)
    } else if (type === 'kiln_collect') {
      handleKilnCollect()
    } else if (type === 'smithing_setup') {
      handleSmithingSetup()
    } else if (type === 'smithing_menu') {
      setShowSmithingMenu(true)
    } else {
      setGameViewAction({ type, id })
    }
  }, [locationData])

  const [kilnLogCount, setKilnLogCount] = useState(20)
  const [kilnMaxLogs, setKilnMaxLogs] = useState(20)

  const [kilnError, setKilnError] = useState<string | null>(null)

  const handleKilnLoad = async () => {
    try {
      const res = await apiFetch<any>('/api/smithing/kiln/load', {
        method: 'POST',
        body: JSON.stringify({ logCount: kilnLogCount }),
      })
      setShowKilnModal(false)
      setKilnLogCount(20)
      setExternalMessage({ text: `Kiln loaded with ${kilnLogCount} logs. Charc ready in 3 hours!`, type: 'success' })
      onInventoryUpdate()
    } catch (err: any) {
      setKilnError(err.message || 'Could not load kiln.')
    }
  }

  const [actionLimit, setActionLimit] = useState<number | null>(null)

  const [showGuildModal, setShowGuildModal] = useState(false)
  const [guildClosing, setGuildClosing] = useState(false)

  const [showMessages, setShowMessages] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)

  const [showForum, setShowForum] = useState(false)

  const [showNews, setShowNews] = useState(false)

  const [messagesClosing, setMessagesClosing] = useState(false)
  const [newsClosing, setNewsClosing] = useState(false)
  const [forumClosing, setForumClosing] = useState(false)

  useEffect(() => {
    const loadCount = () => {
      apiFetch<{ count: number }>('/api/messages/unread/count')
        .then(data => {
          console.log('Unread count:', data.count)
          setUnreadMessages(data.count)
        })
        .catch(() => { })
    }
    loadCount()
    const interval = setInterval(loadCount, 10000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      const socket = getSocket()
      if (!socket) return
      clearInterval(interval)
      socket.on('new_message', () => {
        apiFetch<{ count: number }>('/api/messages/unread/count')
          .then(data => setUnreadMessages(data.count))
          .catch(() => { })
      })
    }, 100)
    return () => clearInterval(interval)
  }, [])

  const closePanel = (setClosing: (v: boolean) => void, setShow: (v: boolean) => void, duration = 200) => {
    setClosing(true)
    setTimeout(() => {
      setShow(false)
      setClosing(false)
    }, duration)
  }

  const closeAllPanels = () => {
    if (showMessages) closePanel(setMessagesClosing, setShowMessages)
    if (showNews) closePanel(setNewsClosing, setShowNews)
    if (showForum) closePanel(setForumClosing, setShowForum, 400)
    if (showHighscores) closePanel(setHighscoresClosing, setShowHighscores)
    if (showGuildModal) closePanel(setGuildClosing, setShowGuildModal)
    if (showAdmin) closePanel(setAdminClosing, setShowAdmin)
    if (showSettings) closePanel(setSettingsClosing, setShowSettings)
  }

  const [showHighscores, setShowHighscores] = useState(false)
  const [highscoresClosing, setHighscoresClosing] = useState(false)

  const handleDropItem = async (itemId: number, quantity: number) => {
    try {
      await apiFetch('/api/ground-items/drop', {
        method: 'POST',
        body: JSON.stringify({ itemId, quantity }),
      })
      onInventoryUpdate()
      setGroundItemsKey(k => k + 1)
    } catch (err: any) {
      console.error('Drop failed:', err.message)
    }
  }

  return (
    <div className="game-root">
      <TopNav
        player={player}
        onLogout={onLogout}
        unreadMessages={unreadMessages}
        onGuildClick={() => { closeAllPanels(); setShowGuildModal(true) }}
        onMessagesClick={() => {
          if (showMessages) closePanel(setMessagesClosing, setShowMessages)
          else { closeAllPanels(); setShowMessages(true) }
        }}
        onForumClick={() => {
          if (showForum) closePanel(setForumClosing, setShowForum, 400)
          else { closeAllPanels(); setShowForum(true) }
        }}
        onNewsClick={() => {
          if (showNews) closePanel(setNewsClosing, setShowNews)
          else { closeAllPanels(); setShowNews(true) }
        }}
        onHighscoresClick={() => {
          if (showHighscores) closePanel(setHighscoresClosing, setShowHighscores)
          else { closeAllPanels(); setShowHighscores(true) }
        }}
        isAdmin={playerData?.player?.is_admin || false}
        isMod={playerData?.player?.is_mod || false}
        onAdminClick={() => {
          if (showAdmin) closePanel(setAdminClosing, setShowAdmin)
          else { closeAllPanels(); setShowAdmin(true) }
        }}
        unreadMessages={unreadMessages}
        onSettingsClick={() => {
          if (showSettings) closePanel(setSettingsClosing, setShowSettings)
          else { closeAllPanels(); setShowSettings(true) }
        }}
      />
      <div className="game-body">
        <LeftPanel
          inventoryData={inventoryData}
          equipmentData={equipmentData}
          onEquipmentUpdate={onEquipmentUpdate}
          onInventoryUpdate={onInventoryUpdate}
          dropMode={dropMode}
          onToggleDropMode={() => setDropMode(d => !d)}
          onDropItem={handleDropItem}
          dropMode={dropMode}
          dropAmount={dropAmount}
        />
        <div className="game-center">
          <div className="game-scene-wrapper">
            <GameView
              locationData={locationData}
              playerData={playerData}
              onPlayerDataUpdate={onPlayerDataUpdate}
              travelStatus={travelStatus}
              onClearTravel={() => setTravelStatus(null)}
              onTravel={handleTravel}
              externalAction={gameViewAction}
              onExternalActionHandled={() => setGameViewAction(null)}
              externalMessage={externalMessage}
              onExternalMessageHandled={() => setExternalMessage(null)}
              actionLimit={actionLimit}
              onActionLimitChange={setActionLimit}
            />
            <LocationPanel
              locationData={locationData}
              currentAction={playerData?.currentAction?.action_type || null}
              onStartAction={handleLocationAction}
              veins={veinsData}
              onKilnMaxLogs={(max) => setKilnMaxLogs(max)}
              onActionLimitChange={(limit) => {
                console.log('Action limit set to:', limit)
                setActionLimit(limit)
              }}
              onInventoryUpdate={onInventoryUpdate}
              onDropModeChange={(active, amount) => {
                setDropMode(active)
                if (amount !== undefined) setDropAmount(amount)
              }}
              groundItemsKey={groundItemsKey}
              onLocationRefresh={() => {
                onPlayerDataUpdate()
                onLocationDataUpdate()
              }}
            />
          </div>
          <ChatPanel />
        </div>
        <RightPanel
          player={player}
          playerData={playerData}
          currentLocationId={locationData?.location?.id || null}
          locationName={locationData?.location?.name || ''}
          allLocations={locationData?.allLocations || []}
          connections={locationData?.connections || []}
          onTravel={handleTravel}
        />
      </div>

      {showKilnModal && (
        <div className="modal-overlay" onClick={() => setShowKilnModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 className="gold-text">Load Kiln</h3>
            <p className="muted-text">Add logs in multiples of 20. Each batch of 20 logs produces 60 Charc over 3 hours.</p>
            <p className="muted-text">Max {kilnMaxLogs} logs at your Smithing level.</p>
            <div className="modal-input-row">
              <button className="btn" onClick={() => setKilnLogCount(Math.max(20, kilnLogCount - 20))}>−</button>
              <span className="modal-count gold-text">{kilnLogCount} logs → {(kilnLogCount / 20) * 60} Charc</span>
              <button
                className="btn"
                onClick={() => setKilnLogCount(Math.min(kilnMaxLogs, kilnLogCount + 20))}
                disabled={kilnLogCount >= kilnMaxLogs}
              >+</button>
            </div>
            {kilnError && (
              <p style={{ color: 'var(--color-red-glow)', fontSize: '13px' }}>{kilnError}</p>
            )}
            <div className="modal-actions">
              <button className="btn btn-gold" onClick={handleKilnLoad}>Load Kiln</button>
              <button className="btn" onClick={() => setShowKilnModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {showSmithingMenu && (
        <SmithingMenu
          onClose={() => setShowSmithingMenu(false)}
          onStartSmithing={(recipe) => {
            setShowSmithingMenu(false)
            setGameViewAction({ type: 'smithing', id: recipe })
          }}
          playerSmithingLevel={playerData?.skills?.find((s: any) => s.name === 'Smithing')?.level || 1}
        />
      )}

      {showGuildModal && (
        <GuildPanel
          onClose={() => closePanel(setGuildClosing, setShowGuildModal)}
          closing={guildClosing}
          playerUsername={player.username}
        />
      )}

      {showMessages && (
        <MessagesPanel
          onClose={() => closePanel(setMessagesClosing, setShowMessages)}
          onUnreadChange={setUnreadMessages}
          closing={messagesClosing}
        />
      )}

      {showNews && (
        <NewsPanel
          onClose={() => closePanel(setNewsClosing, setShowNews)}
          isAdmin={playerData?.player?.is_admin || false}
          closing={newsClosing}
        />
      )}

      {showForum && (
        <ForumPanel
          onClose={() => closePanel(setForumClosing, setShowForum, 400)}
          playerUsername={player.username}
          isAdmin={playerData?.player?.is_admin || false}
          isMod={playerData?.player?.is_mod || false}
          closing={forumClosing}
        />
      )}

      {showHighscores && (
        <HighscoresPanel
          onClose={() => closePanel(setHighscoresClosing, setShowHighscores)}
          closing={highscoresClosing}
        />
      )}

      {showAdmin && (
        <AdminPanel
          onClose={() => closePanel(setAdminClosing, setShowAdmin)}
          closing={adminClosing}
          isAdmin={playerData?.player?.is_admin || false}
          isMod={playerData?.player?.is_mod || false}
        />
      )}

      {showSettings && (
        <SettingsPanel
          onClose={() => closePanel(setSettingsClosing, setShowSettings)}
          closing={settingsClosing}
        />
      )}

    </div>
  )
}