import { useState, useEffect } from 'react'
import GameLayout from './components/GameLayout'
import AuthScreen from './components/AuthScreen'
import { Player } from './types'
import { connectSocket, disconnectSocket } from './lib/socket'
import { apiFetch } from './lib/api'

interface PlayerData {
  player: Player
  skills: {
    id: number
    name: string
    type: string
    xp: number
    level: number
    xpToNext: number
  }[]
  totalLevel: number
  totalXp: number
  currentAction: any
}

function App() {
  const [player, setPlayer] = useState<Player | null>(null)
  const [playerData, setPlayerData] = useState<PlayerData | null>(null)
  const [checking, setChecking] = useState(true)

  const loadPlayerData = async () => {
    try {
      const data = await apiFetch<PlayerData>('/api/player/me')
      setPlayerData(data)
      return data
    } catch (err) {
      console.error('Failed to load player data:', err)
    }
  }

  const initializeSession = async (playerInfo: Player) => {
    setPlayer(playerInfo)
    const data = await loadPlayerData()
    if (data) {
      connectSocket(playerInfo.id)
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('talaran_token')
    const savedPlayer = localStorage.getItem('talaran_player')

    if (token && savedPlayer) {
      try {
        const playerInfo = JSON.parse(savedPlayer)
        initializeSession(playerInfo)
      } catch {
        localStorage.removeItem('talaran_token')
        localStorage.removeItem('talaran_player')
      }
    }
    setChecking(false)
  }, [])

  const handleLogin = async (token: string, playerData: Player) => {
    localStorage.setItem('talaran_token', token)
    localStorage.setItem('talaran_player', JSON.stringify(playerData))
    await initializeSession(playerData)
  }

  const handleLogout = () => {
    disconnectSocket()
    localStorage.removeItem('talaran_token')
    localStorage.removeItem('talaran_player')
    setPlayer(null)
    setPlayerData(null)
  }

  if (checking) return null

  if (!player) {
    return <AuthScreen onLogin={handleLogin} />
  }

  return (
    <GameLayout
      player={player}
      playerData={playerData}
      onLogout={handleLogout}
    />
  )
}

export default App