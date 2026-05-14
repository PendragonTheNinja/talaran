import { useState, useEffect, useCallback } from 'react'
import GameLayout from './components/GameLayout'
import AuthScreen from './components/AuthScreen'
import { Player } from './types'
import { connectSocket, disconnectSocket, getSocket } from './lib/socket'
import { apiFetch } from './lib/api'
import WelcomeModal from './components/WelcomeModal'

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
  connections: {
    id: number
    to_location_id: number
    to_location_name: string
    base_travel_time: number
    travel_type: string
  }[]
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

function App() {
  const [player, setPlayer] = useState<Player | null>(null)
  const [playerData, setPlayerData] = useState<PlayerData | null>(null)
  const [locationData, setLocationData] = useState<LocationData | null>(null)
  const [checking, setChecking] = useState(true)
  const [inventoryData, setInventoryData] = useState<InventoryItem[]>([])
  const [equipmentData, setEquipmentData] = useState<EquipmentData | null>(null)
  const [showWelcome, setShowWelcome] = useState(false)

  const loadPlayerData = useCallback(async () => {
  try {
    const data = await apiFetch<PlayerData>('/api/player/me')
    console.log('Player data:', JSON.stringify(data.player))
    setPlayerData(data)
    if (data.player?.has_seen_welcome === false) {
      setShowWelcome(true)
    }
    return data
  } catch (err) {
    console.error('Failed to load player data:', err)
  }
}, [])

const [veinsData, setVeinsData] = useState<any[]>([])

const loadVeins = useCallback(async () => {
  try {
    const data = await apiFetch<{ veins: any[] }>('/api/mining/veins')
    setVeinsData(data.veins)
  } catch (err) {
    console.error('Failed to load veins:', err)
  }
}, [])

const loadLocationData = useCallback(async () => {
  try {
    const data = await apiFetch<LocationData>('/api/location/current')
    setLocationData(data)
    const socket = getSocket()
    if (socket && data.location?.id) {
      socket.emit('join_location', data.location.id)
    }
    // Load veins for new location
    const veinData = await apiFetch<{ veins: any[] }>('/api/mining/veins')
    setVeinsData(veinData.veins)
  } catch (err) {
    console.error('Failed to load location data:', err)
  }
}, [])

const loadInventory = useCallback(async () => {
  try {
    const data = await apiFetch<{ inventory: InventoryItem[] }>('/api/inventory')
    setInventoryData(data.inventory)
  } catch (err) {
    console.error('Failed to load inventory:', err)
  }
}, [])

const loadEquipment = useCallback(async () => {
  try {
    const data = await apiFetch<{ equipment: EquipmentData }>('/api/equipment')
    setEquipmentData(data.equipment)
  } catch (err) {
    console.error('Failed to load equipment:', err)
  }
}, [])

const initializeSession = useCallback(async (playerInfo: Player) => {
  setPlayer(playerInfo)
  const data = await loadPlayerData()
  await loadLocationData()
  await loadInventory()
  await loadEquipment()

  if (data) {
    const socket = connectSocket(playerInfo.id)
    socket.on('action_complete', () => {
  loadPlayerData()
  loadInventory()
  loadLocationData()
})
    socket.on('travel_complete', () => {
      loadLocationData()
      loadPlayerData()
    })
    socket.on('vein_discovered', () => {
      loadLocationData()
    })
    socket.on('vein_announced', () => {
      loadLocationData()
    })
    socket.on('vein_depleted', () => {
      loadLocationData()
    })
  }
}, [loadPlayerData, loadLocationData, loadInventory, loadEquipment])

useEffect(() => {
  const token = localStorage.getItem('talaran_token')
  const savedPlayer = localStorage.getItem('talaran_player')

  if (token && savedPlayer) {
    try {
      const playerInfo = JSON.parse(savedPlayer)
      initializeSession(playerInfo).finally(() => setChecking(false))
    } catch {
      localStorage.removeItem('talaran_token')
      localStorage.removeItem('talaran_player')
      setChecking(false)
    }
  } else {
    setChecking(false)
  }
}, [])

const handleLogin = async (token: string, playerInfo: Player) => {
  localStorage.setItem('talaran_token', token)
  localStorage.setItem('talaran_player', JSON.stringify(playerInfo))
  await initializeSession(playerInfo)
}

const handleLogout = () => {
  disconnectSocket()
  localStorage.removeItem('talaran_token')
  localStorage.removeItem('talaran_player')
  setPlayer(null)
  setPlayerData(null)
  setLocationData(null)
  setInventoryData([])
  setEquipmentData(null)
}

  if (checking) return null

  if (!player) {
    return <AuthScreen onLogin={handleLogin} />
  }

  return (
    <>
      <GameLayout
        player={player}
        playerData={playerData}
        locationData={locationData}
        inventoryData={inventoryData}
        equipmentData={equipmentData}
        onLogout={handleLogout}
        onPlayerDataUpdate={loadPlayerData}
        onEquipmentUpdate={loadEquipment}
        onInventoryUpdate={loadInventory}
        veinsData={veinsData}
      />
      {showWelcome && player && (
        <WelcomeModal
          username={player.username}
          onClose={() => setShowWelcome(false)}
        />
      )}
    </>
  )
}

export default App