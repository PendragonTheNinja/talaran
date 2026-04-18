import { useState, useEffect, useCallback } from 'react'
import GameLayout from './components/GameLayout'
import AuthScreen from './components/AuthScreen'
import { Player } from './types'
import { connectSocket, disconnectSocket, getSocket } from './lib/socket'
import { apiFetch } from './lib/api'

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

function App() {
  const [player, setPlayer] = useState<Player | null>(null)
  const [playerData, setPlayerData] = useState<PlayerData | null>(null)
  const [locationData, setLocationData] = useState<LocationData | null>(null)
  const [checking, setChecking] = useState(true)

  const loadPlayerData = useCallback(async () => {
    try {
      const data = await apiFetch<PlayerData>('/api/player/me')
      setPlayerData(data)
      return data
    } catch (err) {
      console.error('Failed to load player data:', err)
    }
  }, [])

  const loadLocationData = useCallback(async () => {
    try {
      const data = await apiFetch<LocationData>('/api/location/current')
      setLocationData(data)
    } catch (err) {
      console.error('Failed to load location data:', err)
    }
  }, [])

  const initializeSession = useCallback(async (playerInfo: Player) => {
    setPlayer(playerInfo)
    const data = await loadPlayerData()
    await loadLocationData()

    if (data) {
      const socket = connectSocket(playerInfo.id)

      // Listen for action completions
      socket.on('action_complete', () => {
        loadPlayerData()
      })

      // Listen for bot check
      socket.on('bot_check_required', () => {
        // We'll handle this in the GameView
      })
    }
  }, [loadPlayerData, loadLocationData])

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
  }

  if (checking) return null

  if (!player) {
    return <AuthScreen onLogin={handleLogin} />
  }

  return (
    <GameLayout
      player={player}
      playerData={playerData}
      locationData={locationData}
      onLogout={handleLogout}
      onPlayerDataUpdate={loadPlayerData}
    />
  )
}

export default App