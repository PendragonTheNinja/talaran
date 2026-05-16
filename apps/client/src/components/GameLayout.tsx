import { useState, useCallback, useEffect } from 'react'
import TopNav from './TopNav'
import LeftPanel from './LeftPanel'
import GameView from './GameView'
import RightPanel from './RightPanel'
import ChatPanel from './ChatPanel'
import LocationPanel from './LocationPanel'
import { Player } from '../types'
import { apiFetch } from '../lib/api'
import './GameLayout.css'
import SmithingMenu from './SmithingMenu'
import GuildModal from './GuildModal'
import MessagesPanel from './MessagesPanel'
import ForumPanel from './ForumPanel'

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
}: GameLayoutProps) {
  const [travelStatus, setTravelStatus] = useState<{ message: string; seconds: number } | null>(null)
  const [gameViewAction, setGameViewAction] = useState<{ type: string; id: number } | null>(null)

  const [showKilnModal, setShowKilnModal] = useState(false)
const [showSmithingMenu, setShowSmithingMenu] = useState(false)

const [externalMessage, setExternalMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null)

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

const [showMessages, setShowMessages] = useState(false)
const [unreadMessages, setUnreadMessages] = useState(0)

const [showForum, setShowForum] = useState(false)

useEffect(() => {
  const loadCount = () => {
    apiFetch<{ count: number }>('/api/messages/unread/count')
      .then(data => setUnreadMessages(data.count))
      .catch(() => {})
  }
  loadCount()
  const interval = setInterval(loadCount, 60000)
  return () => clearInterval(interval)
}, [])

  return (
    <div className="game-root">
      <TopNav
      player={player}
      onLogout={onLogout}
      onGuildClick={() => setShowGuildModal(true)}
      onMessagesClick={() => setShowMessages(!showMessages)}
      onForumClick={() => setShowForum(!showForum)}
      unreadMessages={unreadMessages}
      />
      <div className="game-body">
        <LeftPanel
          inventoryData={inventoryData}
          equipmentData={equipmentData}
          onEquipmentUpdate={onEquipmentUpdate}
          onInventoryUpdate={onInventoryUpdate}
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
  <GuildModal
    onClose={() => setShowGuildModal(false)}
    playerUsername={player.username}
  />
)}

{showForum && (
  <ForumPanel
    onClose={() => setShowForum(false)}
    playerUsername={player.username}
    isAdmin={playerData?.player?.is_admin || false}
    isMod={playerData?.player?.is_mod || false}
  />
)}

{showMessages && (
  <MessagesPanel
    onClose={() => setShowMessages(false)}
    onUnreadChange={setUnreadMessages}
  />
)}

    </div>
  )
}