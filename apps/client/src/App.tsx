import { useState, useEffect } from 'react'
import GameLayout from './components/GameLayout'
import AuthScreen from './components/AuthScreen'
import { Player } from './types'

function App() {
  const [player, setPlayer] = useState<Player | null>(null)
  const [checking, setChecking] = useState(true)

  // Check for existing token on load
  useEffect(() => {
    const token = localStorage.getItem('talaran_token')
    const savedPlayer = localStorage.getItem('talaran_player')

    if (token && savedPlayer) {
      try {
        setPlayer(JSON.parse(savedPlayer))
      } catch {
        localStorage.removeItem('talaran_token')
        localStorage.removeItem('talaran_player')
      }
    }
    setChecking(false)
  }, [])

  const handleLogin = (token: string, playerData: Player) => {
    localStorage.setItem('talaran_token', token)
    localStorage.setItem('talaran_player', JSON.stringify(playerData))
    setPlayer(playerData)
  }

  const handleLogout = () => {
    localStorage.removeItem('talaran_token')
    localStorage.removeItem('talaran_player')
    setPlayer(null)
  }

  if (checking) return null

  if (!player) {
    return <AuthScreen onLogin={handleLogin} />
  }

  return <GameLayout player={player} onLogout={handleLogout} />
}

export default App