import { useState, useEffect, useCallback } from 'react'
import GameLayout from './components/GameLayout'
import AuthScreen from './components/AuthScreen'
import { Player } from './types'
import { connectSocket, disconnectSocket, getSocket } from './lib/socket'
import { apiFetch } from './lib/api'
import WelcomeModal from './components/WelcomeModal'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import NewsPage from './components/NewsPage'
import ManualPage from './components/ManualPage'
import { TermsPage, RefundPage, PrivacyPage } from './components/LegalPages'
import SupportUsPage from './components/SupportUsPage'
import ResetPasswordPage from './components/ResetPasswordPage'
import HighscoresPage from './components/HighscoresPage'
import TradeWindow from './components/TradeWindow'
import GuestBanner, { ClaimSuccessModal } from './components/GuestBanner'

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
  const [serverAnnouncement, setServerAnnouncement] = useState<string | null>(null)
  const [tradeRequest, setTradeRequest] = useState<{ tradeId: number; fromPlayer: { id: number; username: string } } | null>(null)
  const [activeTrade, setActiveTrade] = useState<{
    tradeId: number
    otherPlayer: { id: number; username: string }
    offers: any[]
    gold: any[]
    isPlayer1: boolean
  } | null>(null)
  const [tradeMode, setTradeMode] = useState(false)

  const loadPlayerData = useCallback(async () => {
    try {
      const data = await apiFetch<PlayerData>('/api/player/me')
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
      const data = await apiFetch<{ inventory: InventoryItem[]; openContainers?: InventoryItem[] }>('/api/inventory')
      // Open liquid containers render after the real items — they occupy no slot,
      // so a partially-full bucket never makes the pack look fuller than it is.
      setInventoryData([...data.inventory, ...(data.openContainers ?? [])])
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
      socket.on('new_message', () => {
        // Will be handled by MessagesPanel when open
        // Just increment the count
      })
      socket.on('force_logout', (data: { message: string }) => {
        alert(data.message)
        handleLogout()
      })
      socket.on('server_announcement', (data: { message: string }) => {
        setServerAnnouncement(data.message)
        setTimeout(() => setServerAnnouncement(null), 10000)
      })
      socket.on('forum_thread_created', (data: {
        threadId: number
        title: string
        authorName: string
        categoryName: string
        createdAt: string
      }) => {
        // Add to chat as a special forum notification
        window.dispatchEvent(new CustomEvent('forum_notification', { detail: data }))
      })
      socket.on('guild_invite', (data: { guildName: string; guildTag: string; inviterName: string }) => {
        setServerAnnouncement(`📨 ${data.inviterName} has invited you to join ${data.guildName} [${data.guildTag}]! Check the Guild panel.`)
        setTimeout(() => setServerAnnouncement(null), 15000)
      })
      socket.on('trade_requested', (data: { tradeId: number; fromPlayer: { id: number; username: string } }) => {
        setTradeRequest(data)
      })

      socket.on('trade_started', (data: any) => {
        setTradeRequest(null)
        setActiveTrade({
          tradeId: data.tradeId,
          otherPlayer: data.otherPlayer,
          offers: data.offers,
          gold: data.gold,
          isPlayer1: data.isPlayer1,
        })
      })

      socket.on('trade_offer_updated', (data: any) => {
        window.dispatchEvent(new CustomEvent('trade_offer_updated', { detail: data }))
      })

      socket.on('trade_acceptance_updated', (data: any) => {
        window.dispatchEvent(new CustomEvent('trade_acceptance_updated', { detail: data }))
      })

      // The server announces any change to the pack, so items granted outside a
      // completed action — quest rewards, NPC gifts, storage, pickups — appear
      // without the player having to refresh the page.
      socket.on('inventory_changed', () => {
        loadInventory()
      })

      socket.on('trade_completed', () => {
        window.dispatchEvent(new CustomEvent('trade_completed'))
        loadInventory()
      })

      socket.on('trade_cancelled', (data: { reason: string }) => {
        window.dispatchEvent(new CustomEvent('trade_cancelled', { detail: data }))
        setTimeout(() => setActiveTrade(null), 3000)
      })

      // Check for active trade on reconnect
      try {
        const tradeData = await apiFetch<any>('/api/trades/active')
        if (tradeData.trade && tradeData.trade.status === 'active') {
          setActiveTrade({
            tradeId: tradeData.trade.id,
            otherPlayer: tradeData.otherPlayer,
            offers: tradeData.offers,
            gold: tradeData.gold,
            isPlayer1: tradeData.trade.player1_id === player.id,
          })
        }
      } catch (err) { }
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

  const [guestExpired, setGuestExpired] = useState(false)
  const [claimedName, setClaimedName] = useState<string | null>(null)

  // Guest status is read from the token as well as from the API.
  //
  // The server marks guests in three places (the /guest response, /player/me,
  // and the JWT), and the bar only needs one of them to be present. Reading
  // the token means the bar cannot silently fail to appear because a single
  // route file was missed on deploy, which is exactly what happened in
  // testing. The claim is signed, so it cannot be forged, and it is only ever
  // used to decide whether to show UI.
  const tokenSaysGuest = (): boolean => {
    try {
      const token = localStorage.getItem('talaran_token')
      if (!token) return false
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      return payload?.isGuest === true
    } catch {
      return false
    }
  }

  // apiFetch raises this when the server refuses a request because the guest
  // session lapsed. Listening here rather than threading a callback through
  // every component keeps the concern in one place.
  useEffect(() => {
    const onExpired = () => setGuestExpired(true)
    const onBlocked = (e: Event) => {
      const msg = (e as CustomEvent<{ message: string }>).detail?.message
      if (!msg) return
      setServerAnnouncement(msg)
      setTimeout(() => setServerAnnouncement(null), 5000)
    }
    window.addEventListener('talaran:guest-expired', onExpired)
    window.addEventListener('talaran:blocked', onBlocked)
    return () => {
      window.removeEventListener('talaran:guest-expired', onExpired)
      window.removeEventListener('talaran:blocked', onBlocked)
    }
  }, [])

  const handleUpgraded = async (token: string, upgraded: Player) => {
    localStorage.setItem('talaran_token', token)
    localStorage.setItem('talaran_player', JSON.stringify(upgraded))
    setGuestExpired(false)
    navigate('/game')
    setClaimedName(upgraded.username)
    // Reload from the server rather than patching state: the account is no
    // longer a guest, and everything downstream keys off that.
    await initializeSession(upgraded)
  }

  const handleLogin = async (token: string, playerInfo: Player) => {
    localStorage.setItem('talaran_token', token)
    localStorage.setItem('talaran_player', JSON.stringify(playerInfo))
    navigate('/game')
    await initializeSession(playerInfo)
  }

  const navigate = useNavigate()

  const handleLogout = () => {
    disconnectSocket()
    localStorage.removeItem('talaran_token')
    localStorage.removeItem('talaran_player')
    setPlayer(null)
    setPlayerData(null)
    setLocationData(null)
    setInventoryData([])
    setEquipmentData(null)
    navigate('/')
  }

  if (checking) return null

  return (
    <Routes>
      <Route path="/news" element={<NewsPage />} />
      <Route path="/manual" element={<ManualPage />} />
      <Route path="/manual/:section/:slug" element={<ManualPage />} />
      <Route path="/store" element={<SupportUsPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/refunds" element={<RefundPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/highscores" element={<HighscoresPage />} />
      <Route path="/" element={<AuthScreen onLogin={handleLogin} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
      <Route path="/game" element={
        !player ? (
          // No session in memory. Either the saved one is still restoring, in
          // which case `checking` held us back above, or there is none and the
          // home page is where this belongs.
          <Navigate to="/" replace />
        ) : (
          <>
            {(playerData?.player?.is_guest || player?.is_guest || tokenSaysGuest()) && (
              <GuestBanner
                player={{ ...(player as Player), ...(playerData?.player ?? {}) }}
                onUpgraded={handleUpgraded}
                expired={guestExpired}
                onDismissExpired={() => setGuestExpired(false)}
              />
            )}
            {claimedName && (
              <ClaimSuccessModal username={claimedName} onClose={() => setClaimedName(null)} />
            )}
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
              onLocationDataUpdate={loadLocationData}
              tradeMode={tradeMode} activeTrade={activeTrade}
              onNotify={(message) => {
                setServerAnnouncement(message)
                setTimeout(() => setServerAnnouncement(null), 5000)
              }}
            />
            {showWelcome && player && (
              <WelcomeModal
                username={player.username}
                onClose={() => setShowWelcome(false)}
              />
            )}
            {serverAnnouncement && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 9999,
                background: 'rgba(180,30,30,0.95)',
                color: 'white',
                padding: '12px 24px',
                textAlign: 'center',
                fontFamily: 'var(--font-heading)',
                fontSize: '16px',
                letterSpacing: '0.05em',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span>📢 {serverAnnouncement}</span>
                <button onClick={() => setServerAnnouncement(null)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '18px', cursor: 'pointer' }}>✕</button>
              </div>
            )}
            {tradeRequest && (
              <div className="modal-overlay" onClick={() => setTradeRequest(null)}>
                <div className="guild-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '340px' }}>
                  <div className="guild-modal-header">
                    <h2 className="gold-text">Trade Request</h2>
                  </div>
                  <div style={{ padding: 'var(--space-lg)' }}>
                    <p style={{ fontSize: '15px', marginBottom: '16px' }}>
                      <span className="gold-text">{tradeRequest.fromPlayer.username}</span> wants to trade with you.
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn btn-gold" onClick={async () => {
                        await apiFetch('/api/trades/respond', {
                          method: 'POST',
                          body: JSON.stringify({ tradeId: tradeRequest.tradeId, accept: true }),
                        })
                        setTradeRequest(null)
                      }}>Accept</button>
                      <button className="btn btn-red" onClick={async () => {
                        await apiFetch('/api/trades/respond', {
                          method: 'POST',
                          body: JSON.stringify({ tradeId: tradeRequest.tradeId, accept: false }),
                        })
                        setTradeRequest(null)
                      }}>Decline</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTrade && player && (
              <TradeWindow
                tradeId={activeTrade.tradeId}
                myPlayerId={player.id}
                otherPlayer={activeTrade.otherPlayer}
                initialOffers={activeTrade.offers}
                initialGold={activeTrade.gold}
                isPlayer1={activeTrade.isPlayer1}
                onClose={() => setActiveTrade(null)}
                onInventoryClick={(enabled) => setTradeMode(enabled)}
              />
            )}
          </>
        )
      } />
    </Routes>
  )
}

export default App