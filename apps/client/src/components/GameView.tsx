import { useState, useEffect, useRef, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { getSocket } from '../lib/socket'
import './GameView.css'

interface Node {
  id: number
  skill: string
  name: string
  required_level: number
  xp_reward: number
}

interface Connection {
  id: number
  to_location_id: number
  to_location_name: string
  base_travel_time: number
  travel_type: string
}

interface LocationData {
  location: {
    id: number
    name: string
    region: string
    type: string
    description: string
  } | null
  nodes: Node[]
  connections: Connection[]
}

interface ActionResult {
  itemName: string
  xpAwarded: number
  remainingQuantity?: number
}

interface XpInfo {
  totalXp: number
  level: number
  xpToNext: number
  leveledUp: boolean
}

interface GameViewProps {
  locationData: LocationData | null
  playerData: any
  onPlayerDataUpdate: () => void
  travelStatus: { message: string; seconds: number } | null
  onClearTravel: () => void
  onTravel: (toLocationId: number, toLocationName: string, travelTime: number) => void
}

interface LogEntry {
  id: number
  message: string
  type: 'success' | 'info' | 'error' | 'level'
}

export default function GameView({ locationData, playerData, onPlayerDataUpdate, travelStatus, onClearTravel, onTravel }: GameViewProps) {
  // ── All state at the top ──────────────────────────────────────────
  const [currentAction, setCurrentAction] = useState<string | null>(null)
  const [activeNodeId, setActiveNodeId] = useState<number | null>(null)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [timerMax, setTimerMax] = useState(0)
  const [log, setLog] = useState<LogEntry[]>([])
  const [botCheckPending, setBotCheckPending] = useState(false)
  const [botCheckAnswer, setBotCheckAnswer] = useState('')
  const [botCheckQuestion, setBotCheckQuestion] = useState({ a: 0, b: 0 })
  const [veins, setVeins] = useState<any[]>([])
  const [veinNotification, setVeinNotification] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<{
    itemName: string
    xpAwarded: number
    totalXp: number
    level: number
    xpToNext: number
    skillName: string
    remainingQuantity?: number
  } | null>(null)
  const [levelUpSkill, setLevelUpSkill] = useState<{ name: string; level: number } | null>(null)

  // ── Refs ──────────────────────────────────────────────────────────
  const logIdRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const currentActionRef = useRef<string | null>(null)

  // ── Keep ref in sync with state ───────────────────────────────────
  useEffect(() => {
    currentActionRef.current = currentAction
  }, [currentAction])

  // ── Helpers ───────────────────────────────────────────────────────
  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    logIdRef.current += 1
    setLog(prev => [...prev.slice(-20), { id: logIdRef.current, message, type }])
  }

  const startCountdown = (seconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current)
    setTimerSeconds(seconds)
    timerRef.current = setInterval(() => {
      setTimerSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  // ── Load veins ────────────────────────────────────────────────────
  const loadVeins = useCallback(async () => {
    try {
      const data = await apiFetch<{ veins: any[] }>('/api/mining/veins')
      setVeins(data.veins)
    } catch (err) {
      console.error('Failed to load veins:', err)
    }
  }, [])

  useEffect(() => {
    loadVeins()
  }, [locationData, loadVeins])

  // ── Socket listeners ──────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const socket = getSocket()
      if (!socket) return
      clearInterval(interval)

      socket.on('action_complete', (data: { result: ActionResult; timerSeconds: number; nextCompletes: string; xpInfo: XpInfo }) => {
        console.log('Action complete data:', JSON.stringify(data))
        if (data.result?.itemName) {
          const skillName = currentActionRef.current === 'mining_rock' || currentActionRef.current === 'mining_vein'
            ? 'Mining' : 'Woodcutting'

          setLastResult({
            itemName: data.result.itemName,
            xpAwarded: data.result.xpAwarded || 0,
            totalXp: data.xpInfo?.totalXp || 0,
            level: data.xpInfo?.level || 1,
            xpToNext: data.xpInfo?.xpToNext || 0,
            skillName,
            remainingQuantity: data.result.remainingQuantity,
          })

          if (data.xpInfo?.leveledUp) {
            setLevelUpSkill({ name: skillName, level: data.xpInfo.level })
          }
        }
        onPlayerDataUpdate()
        if (data.timerSeconds) {
          setTimerSeconds(data.timerSeconds)
          setTimerMax(data.timerSeconds)
          startCountdown(data.timerSeconds)
        }
      })

      socket.on('travel_complete', () => {
        setCurrentAction(null)
        setTimerSeconds(0)
        setTimerMax(0)
        onClearTravel()
        if (timerRef.current) clearInterval(timerRef.current)
      })

      socket.on('action_failed', (data: { error: string }) => {
        addLog(data.error || 'Action stopped.', 'error')
        setCurrentAction(null)
        setActiveNodeId(null)
        setTimerSeconds(0)
        if (timerRef.current) clearInterval(timerRef.current)
      })

      socket.on('bot_check_required', () => {
        const a = Math.floor(Math.random() * 20) + 1
        const b = Math.floor(Math.random() * 20) + 1
        setBotCheckQuestion({ a, b })
        setBotCheckPending(true)
        addLog('Bot check required! Please answer the question to continue.', 'error')
        if (timerRef.current) clearInterval(timerRef.current)
      })

      socket.on('vein_discovered', (data: { oreName: string; quantity: number; privateWindow: number }) => {
        setVeinNotification(`You discovered a ${data.oreName} vein! You have ${data.privateWindow} minutes before it's announced.`)
        setTimeout(() => setVeinNotification(null), 10000)
        loadVeins()
      })

      socket.on('vein_announced', () => {
        loadVeins()
      })

      socket.on('vein_depleted', (data: { oreName: string }) => {
        addLog(`The ${data.oreName} vein has been depleted.`, 'error')
        setCurrentAction(null)
        setActiveNodeId(null)
        setTimerSeconds(0)
        if (timerRef.current) clearInterval(timerRef.current)
        loadVeins()
      })

      socket.on('action_switched', (data: { newActionType: string; nodeName: string; timerSeconds: number }) => {
  setCurrentAction(data.newActionType)
  setTimerMax(data.timerSeconds)
  startCountdown(data.timerSeconds)
  addLog(`Vein depleted. Returning to mining ${data.nodeName}.`, 'info')
})

    }, 100)

    return () => {
      clearInterval(interval)
      const socket = getSocket()
      if (socket) {
        socket.off('action_complete')
        socket.off('travel_complete')
        socket.off('bot_check_required')
        socket.off('action_failed')
        socket.off('vein_discovered')
        socket.off('vein_announced')
        socket.off('vein_depleted')
        socket.off('action_switched')
      }
    }
  }, [onPlayerDataUpdate, loadVeins])

  // ── Travel timer ──────────────────────────────────────────────────
  useEffect(() => {
    if (!travelStatus?.seconds) return
    setLastResult(null)
    setCurrentAction('traveling')
    setActiveNodeId(null)
    setTimerMax(travelStatus.seconds)
    startCountdown(travelStatus.seconds)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [travelStatus])

  // ── Restore timer on refresh ──────────────────────────────────────
  useEffect(() => {
    if (!playerData?.currentAction) return
    if (playerData.currentAction.action_type !== 'woodcutting') return
    if (currentAction) return

    const now = new Date().getTime()
    const completesAt = new Date(playerData.currentAction.completes_at).getTime()
    const secondsLeft = Math.max(0, Math.round((completesAt - now) / 1000))

    setCurrentAction('woodcutting')
    setActiveNodeId(playerData.currentAction.resource_node_id)
    setTimerMax(secondsLeft || 5)
    startCountdown(secondsLeft)
  }, [playerData])

  // ── Actions ───────────────────────────────────────────────────────
  const startAction = async (node: Node) => {
    try {
      if (currentAction) await apiFetch('/api/actions/stop', { method: 'POST' })
      setLastResult(null)
      setCurrentAction(null)
      setActiveNodeId(null)
      setTimerSeconds(0)
      onClearTravel()
      if (timerRef.current) clearInterval(timerRef.current)

      const res = await apiFetch<{ timerSeconds: number; completesAt: string }>(
        '/api/actions/woodcutting/start',
        { method: 'POST', body: JSON.stringify({ nodeId: node.id }) }
      )
      setCurrentAction('woodcutting')
      setActiveNodeId(node.id)
      setTimerMax(res.timerSeconds)
      startCountdown(res.timerSeconds)
    } catch (err: any) {
      addLog(err.message || 'Could not start action.', 'error')
    }
  }

  const stopAction = async () => {
    try {
      await apiFetch('/api/actions/stop', { method: 'POST' })
      setCurrentAction(null)
      setActiveNodeId(null)
      setTimerSeconds(0)
      setLastResult(null)
      onClearTravel()
      if (timerRef.current) clearInterval(timerRef.current)
    } catch (err: any) {
      addLog(err.message || 'Could not stop action.', 'error')
    }
  }

  const handleBotCheck = async () => {
    const correct = botCheckQuestion.a + botCheckQuestion.b
    if (parseInt(botCheckAnswer) !== correct) {
      addLog('Incorrect answer. Try again.', 'error')
      setBotCheckAnswer('')
      return
    }
    try {
      await apiFetch('/api/actions/bot-check', { method: 'POST' })
      setBotCheckPending(false)
      setBotCheckAnswer('')
      addLog('Bot check passed. Continuing...', 'info')
      startCountdown(30)
    } catch (err: any) {
      addLog(err.message || 'Bot check failed.', 'error')
    }
  }

  const startMiningRock = async (node: Node) => {
    try {
      if (currentAction) await apiFetch('/api/actions/stop', { method: 'POST' })
      setLastResult(null)
      setCurrentAction(null)
      setActiveNodeId(null)
      setTimerSeconds(0)
      onClearTravel()
      if (timerRef.current) clearInterval(timerRef.current)

      const res = await apiFetch<{ timerSeconds: number }>('/api/mining/rock/start', {
        method: 'POST',
        body: JSON.stringify({ nodeId: node.id }),
      })
      setCurrentAction('mining_rock')
      setActiveNodeId(node.id)
      setTimerMax(res.timerSeconds)
      startCountdown(res.timerSeconds)
    } catch (err: any) {
      addLog(err.message || 'Could not start mining.', 'error')
    }
  }

  const startMiningVein = async (vein: any) => {
    try {
      if (currentAction) await apiFetch('/api/actions/stop', { method: 'POST' })
      setLastResult(null)
      setCurrentAction(null)
      setActiveNodeId(null)
      setTimerSeconds(0)
      onClearTravel()
      if (timerRef.current) clearInterval(timerRef.current)

      const res = await apiFetch<{ timerSeconds: number }>('/api/mining/vein/start', {
        method: 'POST',
        body: JSON.stringify({ veinId: vein.id }),
      })
      setCurrentAction('mining_vein')
      setActiveNodeId(vein.id)
      setTimerMax(res.timerSeconds)
      startCountdown(res.timerSeconds)
      addLog(`You begin mining the ${vein.ore_name} vein. (${vein.remaining_quantity} ore remaining)`, 'info')
    } catch (err: any) {
      addLog(err.message || 'Could not start mining vein.', 'error')
    }
  }

  // ── Derived values ────────────────────────────────────────────────
  const woodcuttingNodes = locationData?.nodes.filter(n => n.skill === 'woodcutting') || []
  const miningNodes = locationData?.nodes.filter(n => n.skill === 'mining') || []
  const locationName = locationData?.location?.name || 'Unknown'
  const locationDesc = locationData?.location?.description || ''
  const connections = locationData?.connections || []
  const timerPercent = timerMax > 0 ? (timerSeconds / timerMax) * 100 : 0

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="game-view panel">
      <div className="game-view-location-bar">
        <span className="game-view-location gold-text">{locationName}</span>
        <div className="game-view-actions">
          {/* Woodcutting */}
          {!currentAction && woodcuttingNodes.map(node => (
            <button key={node.id} className="btn" onClick={() => startAction(node)}>
              Chop {node.name}
            </button>
          ))}
          {currentAction === 'woodcutting' && (
            <button className="btn btn-red" onClick={stopAction}>Stop Chopping</button>
          )}

          {/* Mining rocks */}
          {!currentAction && miningNodes.map(node => (
            <button key={node.id} className="btn" onClick={() => startMiningRock(node)}>
              Mine {node.name}
            </button>
          ))}

          {/* Active veins */}
          {!currentAction && veins.map(vein => (
            <button
              key={vein.id}
              className="btn btn-gold"
              onClick={() => startMiningVein(vein)}
              title={`${vein.remaining_quantity} ore remaining`}
            >
              ⛏ {vein.ore_name} Vein ({vein.remaining_quantity})
            </button>
          ))}

          {/* Stop mining */}
          {(currentAction === 'mining_rock' || currentAction === 'mining_vein') && (
            <button className="btn btn-red" onClick={stopAction}>Stop Mining</button>
          )}

          {/* Travel */}
          {!currentAction && connections.map(conn => (
            <button key={conn.id} className="btn" onClick={() => onTravel(conn.to_location_id, conn.to_location_name, conn.base_travel_time)}>
              → {conn.to_location_name}
            </button>
          ))}
        </div>
      </div>

      <div className="game-view-main">
        <div className="game-view-scene">
          <div className="scene-placeholder">
            <span className="scene-placeholder-text">{locationName}</span>
          </div>
        </div>

        {currentAction === 'traveling' && !botCheckPending && (
          <div className="game-view-action-log">
            <p className="travel-status gold-text">{travelStatus?.message}</p>
            <div className="action-timer">
              <div className="action-timer-bar">
                <div
                  key={timerMax}
                  className="action-timer-fill"
                  style={{ width: `${timerPercent}%`, transition: timerSeconds === timerMax ? 'none' : 'width 1s linear' }}
                />
              </div>
              <span className="action-timer-label">{timerSeconds}s</span>
            </div>
            <button className="btn btn-red" onClick={stopAction}>Cancel Travel</button>
          </div>
        )}

        {currentAction === 'woodcutting' && !botCheckPending && (
          <div className="game-view-action-log">
            <div className="action-timer">
              <div className="action-timer-bar">
                <div
                  key={timerMax}
                  className="action-timer-fill"
                  style={{ width: `${timerPercent}%`, transition: timerSeconds === timerMax ? 'none' : 'width 1s linear' }}
                />
              </div>
              <span className="action-timer-label">{timerSeconds}s</span>
            </div>
          </div>
        )}

        {(currentAction === 'mining_rock' || currentAction === 'mining_vein') && !botCheckPending && (
          <div className="game-view-action-log">
            <div className="action-timer">
              <div className="action-timer-bar">
                <div
                  key={timerMax}
                  className="action-timer-fill mining"
                  style={{ width: `${timerPercent}%`, transition: timerSeconds === timerMax ? 'none' : 'width 1s linear' }}
                />
              </div>
              <span className="action-timer-label">{timerSeconds}s</span>
            </div>
          </div>
        )}

        {botCheckPending && (
          <div className="bot-check panel-inset">
            <p className="bot-check-question gold-text">
              Bot Check: What is {botCheckQuestion.a} + {botCheckQuestion.b}?
            </p>
            <div className="bot-check-input-row">
              <input
                className="chat-input"
                type="number"
                value={botCheckAnswer}
                onChange={e => setBotCheckAnswer(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleBotCheck()}
                placeholder="Your answer..."
                autoFocus
              />
              <button className="btn btn-gold" onClick={handleBotCheck}>Confirm</button>
            </div>
          </div>
        )}

        {lastResult && (
          <div className="last-result">
            <p className="last-result-item">You gained 1 × {lastResult.itemName}</p>
            <p className="last-result-xp">+{lastResult.xpAwarded} {lastResult.skillName} XP (Total: {lastResult.totalXp.toLocaleString()})</p>
            <p className="last-result-next">{lastResult.xpToNext.toLocaleString()} XP until level {lastResult.level + 1}</p>
            {lastResult.remainingQuantity !== undefined && (
              <p className="last-result-remaining">{lastResult.remainingQuantity} ore remaining in vein</p>
            )}
          </div>
        )}

        {veinNotification && (
          <div className="vein-notification">
            <span>⛏ {veinNotification}</span>
            <button onClick={() => setVeinNotification(null)}>✕</button>
          </div>
        )}

        <div className="action-log panel-inset">
          {log.length === 0 ? (
            <p className="muted-text">{locationDesc || 'You stand ready.'}</p>
          ) : (
            [...log].reverse().map(entry => (
              <p key={entry.id} className={`log-entry log-${entry.type}`}>
                {entry.message}
              </p>
            ))
          )}
        </div>
      </div>

      {levelUpSkill && (
        <div className="levelup-popup">
          <div className="levelup-inner">
            <button className="levelup-close" onClick={() => setLevelUpSkill(null)}>✕</button>
            <p className="levelup-title">Level Up!</p>
            <p className="levelup-skill">{levelUpSkill.name}</p>
            <p className="levelup-level">Level {levelUpSkill.level}</p>
          </div>
        </div>
      )}
    </div>
  )
}