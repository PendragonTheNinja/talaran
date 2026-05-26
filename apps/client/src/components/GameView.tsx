import { useState, useEffect, useRef, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { getSocket } from '../lib/socket'
import './GameView.css'
import LocationAtmosphere from './LocationAtmosphere'

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
  externalAction: { type: string; id: number } | null
  onExternalActionHandled: () => void
  externalMessage: { text: string; type: 'success' | 'info' | 'error' } | null
  onExternalMessageHandled: () => void
  actionLimit: number | null
  onActionLimitChange: (limit: number | null) => void
}

interface LogEntry {
  id: number
  message: string
  type: 'success' | 'info' | 'error' | 'level'
}

export default function GameView({
  locationData,
  playerData,
  onPlayerDataUpdate,
  travelStatus,
  onClearTravel,
  onTravel,
  externalAction,
  onExternalActionHandled,
  externalMessage,
  onExternalMessageHandled,
  actionLimit,
  onActionLimitChange,
}: GameViewProps) {

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
    quantity?: number
  } | null>(null)
  const [levelUpSkill, setLevelUpSkill] = useState<{ name: string; level: number } | null>(null)
  const [actionsCompleted, setActionsCompleted] = useState(0)

  // ── Refs ──────────────────────────────────────────────────────────
  const logIdRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const currentActionRef = useRef<string | null>(null)
  const actionLimitRef = useRef<number | null>(null)

  // ── Keep ref in sync with state ───────────────────────────────────
  useEffect(() => {
    currentActionRef.current = currentAction
  }, [currentAction])

  useEffect(() => {
    actionLimitRef.current = actionLimit
  }, [actionLimit])

  // ── Helpers ───────────────────────────────────────────────────────
  const addLog = (message: string, type: LogEntry['type'] = 'info', persist = false) => {
    logIdRef.current += 1
    const id = logIdRef.current
    setLog(prev => {
      if (prev.length > 0 && prev[prev.length - 1].message === message) return prev
      return [...prev.slice(-20), { id, message, type }]
    })

    if (!persist) {
      setTimeout(() => {
        setLog(prev => prev.filter(entry => entry.id !== id))
      }, 5000)
    }
  }

  const startCountdown = (seconds: number, completesAt?: string) => {
    if (timerRef.current) clearInterval(timerRef.current)

    const endTime = completesAt
      ? new Date(completesAt).getTime()
      : Date.now() + seconds * 1000

    const tick = () => {
      const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000))
      setTimerSeconds(remaining)
      if (remaining <= 0 && timerRef.current) {
        clearInterval(timerRef.current)
      }
    }

    tick()
    timerRef.current = setInterval(tick, 1000)
  }

  // ── Visibility resync ─────────────────────────────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && playerData?.currentAction) {
        const action = playerData.currentAction
        const completesAt = new Date(action.completes_at).getTime()
        const secondsLeft = Math.max(0, Math.round((completesAt - Date.now()) / 1000))
        setTimerSeconds(secondsLeft)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [playerData])

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
        if (data.result?.itemName) {
          const skillName =
            currentActionRef.current === 'mining_rock' || currentActionRef.current === 'mining_vein' ? 'Mining' :
              currentActionRef.current === 'smelting' || currentActionRef.current === 'smithing' || currentActionRef.current === 'kiln_collect' ? 'Smithing' :
                'Woodcutting'

          setLastResult({
            itemName: data.result.itemName,
            xpAwarded: data.result.xpAwarded || 0,
            totalXp: data.xpInfo?.totalXp || 0,
            level: data.xpInfo?.level || 1,
            xpToNext: data.xpInfo?.xpToNext || 0,
            skillName,
            remainingQuantity: data.result.remainingQuantity,
            quantity: (data.result as any).quantity,
          })

          if (data.xpInfo?.leveledUp) {
            setLevelUpSkill({ name: skillName, level: data.xpInfo.level })
          }
        }
        onPlayerDataUpdate()
        setActionsCompleted(prev => prev + 1)
        if (data.timerSeconds) {
          setTimerSeconds(data.timerSeconds)
          setTimerMax(data.timerSeconds)
          startCountdown(data.timerSeconds, data.nextCompletes)
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
        // No completesAt available here, use seconds only
        startCountdown(data.timerSeconds)
        addLog(`Vein depleted. Returning to mining ${data.nodeName}.`, 'info')
      })

      socket.on('action_limit_reached', (data: { message: string }) => {
        addLog(data.message, 'info')
        setCurrentAction(null)
        setActiveNodeId(null)
        setTimerSeconds(0)
        if (timerRef.current) clearInterval(timerRef.current)
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
        socket.off('action_limit_reached')
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
    // No completesAt for travel status, use seconds only
    startCountdown(travelStatus.seconds)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [travelStatus])

  // ── Restore timer on refresh ──────────────────────────────────────
  useEffect(() => {
    if (!playerData?.currentAction) return
    if (currentAction) return
    if (playerData.currentAction.bot_check_pending) return

    const action = playerData.currentAction
    const now = new Date().getTime()
    const completesAt = new Date(action.completes_at).getTime()
    const secondsLeft = Math.max(0, Math.round((completesAt - now) / 1000))

    switch (action.action_type) {
      case 'woodcutting':
        setCurrentAction('woodcutting')
        setActiveNodeId(action.resource_node_id)
        setTimerMax(secondsLeft || 5)
        startCountdown(secondsLeft, action.completes_at)
        break

      case 'mining_rock':
        setCurrentAction('mining_rock')
        setActiveNodeId(action.resource_node_id)
        setTimerMax(secondsLeft || 5)
        startCountdown(secondsLeft, action.completes_at)
        break

      case 'mining_vein':
        setCurrentAction('mining_vein')
        setActiveNodeId(action.action_data)
        setTimerMax(secondsLeft || 5)
        startCountdown(secondsLeft, action.completes_at)
        break

      case 'smelting':
        setCurrentAction('smelting')
        setTimerMax(secondsLeft || 5)
        startCountdown(secondsLeft, action.completes_at)
        break

      case 'smithing':
        setCurrentAction('smithing')
        setTimerMax(secondsLeft || 5)
        startCountdown(secondsLeft, action.completes_at)
        break

      case 'kiln_collect':
        setCurrentAction('kiln_collect')
        setTimerMax(secondsLeft || 5)
        startCountdown(secondsLeft, action.completes_at)
        break

      case 'traveling':
        break
    }
  }, [playerData])

  // ── External action handler ───────────────────────────────────────
  useEffect(() => {
    if (!externalAction) return

    if (externalAction.type === 'woodcutting') {
      const node = locationData?.nodes.find(n => n.id === externalAction.id)
      if (node) startAction(node)
    } else if (externalAction.type === 'mining_rock') {
      const node = locationData?.nodes.find(n => n.id === externalAction.id)
      if (node) startMiningRock(node)
    } else if (externalAction.type === 'mining_vein') {
      startMiningVein({ id: externalAction.id, ore_name: '', remaining_quantity: 0 })
    } else if (externalAction.type === 'smelting') {
      startSmelting(externalAction.id as string)
    } else if (externalAction.type === 'smithing') {
      startSmithing(externalAction.id as string)
    } else if (externalAction.type === 'kiln_collecting') {
      setCurrentAction('kiln_collect')
      setTimerMax(externalAction.id as number)
      startCountdown(externalAction.id as number)
    } else if (externalAction.type === 'set_action_limit') {
      onActionLimitChange(externalAction.id === 0 ? null : externalAction.id as number)
    }

    onExternalActionHandled()
  }, [externalAction])

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
      startCountdown(res.timerSeconds, res.completesAt)
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
      if (currentAction) {
        await apiFetch('/api/actions/bot-check', { method: 'POST' })
        setBotCheckPending(false)
        setBotCheckAnswer('')
        addLog('Bot check passed. Continuing...', 'info')
        // No completesAt here, just a short resume timer
        startCountdown(30)
      } else {
        await apiFetch('/api/actions/bot-check/idle', { method: 'POST' })
        setBotCheckPending(false)
        setBotCheckAnswer('')
        addLog('Bot check passed.', 'info')
      }
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

      const res = await apiFetch<{ timerSeconds: number; completesAt: string }>('/api/mining/rock/start', {
        method: 'POST',
        body: JSON.stringify({ nodeId: node.id }),
      })
      setCurrentAction('mining_rock')
      setActiveNodeId(node.id)
      setTimerMax(res.timerSeconds)
      startCountdown(res.timerSeconds, res.completesAt)
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

      const res = await apiFetch<{ timerSeconds: number; completesAt: string }>('/api/mining/vein/start', {
        method: 'POST',
        body: JSON.stringify({ veinId: vein.id }),
      })
      setCurrentAction('mining_vein')
      setActiveNodeId(vein.id)
      setTimerMax(res.timerSeconds)
      startCountdown(res.timerSeconds, res.completesAt)
      addLog(`You begin mining the ${vein.ore_name} vein. (${vein.remaining_quantity} ore remaining)`, 'info')
    } catch (err: any) {
      addLog(err.message || 'Could not start mining vein.', 'error')
    }
  }

  const startSmelting = async (metalType: string) => {
    try {
      if (currentAction) await apiFetch('/api/actions/stop', { method: 'POST' })
      setLastResult(null)
      setCurrentAction(null)
      setTimerSeconds(0)
      setActionsCompleted(0)
      onClearTravel()
      if (timerRef.current) clearInterval(timerRef.current)

      const limitInput = document.getElementById('action-limit-input') as HTMLInputElement
      const currentLimit = limitInput?.value ? parseInt(limitInput.value) : null
      const res = await apiFetch<{ timerSeconds: number; completesAt: string }>('/api/smithing/smelt/start', {
        method: 'POST',
        body: JSON.stringify({ metalType, actionLimit: currentLimit }),
      })
      setCurrentAction('smelting')
      setLog([])
      setActionsCompleted(0)
      setTimerMax(res.timerSeconds)
      startCountdown(res.timerSeconds, res.completesAt)
    } catch (err: any) {
      addLog(err.message || 'Could not start smelting.', 'error')
    }
  }

  const startSmithing = async (recipe: string) => {
    try {
      if (currentAction) await apiFetch('/api/actions/stop', { method: 'POST' })
      setLastResult(null)
      setCurrentAction(null)
      setTimerSeconds(0)
      setActionsCompleted(0)
      onClearTravel()
      if (timerRef.current) clearInterval(timerRef.current)

      const limitInput = document.getElementById('action-limit-input') as HTMLInputElement
      const currentLimit = limitInput?.value ? parseInt(limitInput.value) : null

      const res = await apiFetch<{ timerSeconds: number; completesAt: string }>('/api/smithing/smith/start', {
        method: 'POST',
        body: JSON.stringify({ recipe, actionLimit: currentLimit }),
      })
      setCurrentAction('smithing')
      setLog([])
      setActionsCompleted(0)
      setTimerMax(res.timerSeconds)
      startCountdown(res.timerSeconds, res.completesAt)
    } catch (err: any) {
      addLog(err.message || 'Could not start smithing.', 'error')
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
      <div className="game-view-main">
        <div className="game-scene">

          <LocationAtmosphere
            locationName={locationName}
            locationType={locationData?.location?.type || ''}
          />

          {!currentAction && (
            <div className="scene-idle">
              <p className="scene-description">{locationDesc || 'You stand ready.'}</p>
            </div>
          )}

          {currentAction && !botCheckPending && (
            <div className="scene-action-overlay">
              {currentAction === 'traveling' && (
                <p className="scene-action-text gold-text">{travelStatus?.message}</p>
              )}
              {currentAction === 'woodcutting' && (
                <p className="scene-action-text gold-text">You are chopping a Lanai Tree.</p>
              )}
              {currentAction === 'mining_rock' && (
                <p className="scene-action-text gold-text">You are mining rocks.</p>
              )}
              {currentAction === 'mining_vein' && (
                <p className="scene-action-text gold-text">You are mining an ore vein.</p>
              )}
              {currentAction === 'smelting' && (
                <p className="scene-action-text gold-text">You are smelting ingots.</p>
              )}
              {currentAction === 'smithing' && (
                <p className="scene-action-text gold-text">You are working the forge.</p>
              )}
              {currentAction === 'kiln_collect' && (
                <p className="scene-action-text gold-text">Collecting Charc from the kiln...</p>
              )}
              <div className="scene-timer">
                <div className="scene-timer-bar">
                  <div
                    key={timerMax}
                    className={`scene-timer-fill ${currentAction.startsWith('mining') ? 'mining' : ''}`}
                    style={{ width: `${timerPercent}%`, transition: timerSeconds === timerMax ? 'none' : 'width 1s linear' }}
                  />
                </div>
                <span className="scene-timer-label">{timerSeconds}s</span>
              </div>

              {currentAction === 'traveling' && (
                <button className="btn btn-red scene-cancel-btn" onClick={stopAction}>Cancel Travel</button>
              )}
              {currentAction === 'woodcutting' && (
                <button className="btn btn-red scene-cancel-btn" onClick={stopAction}>Stop Chopping</button>
              )}
              {(currentAction === 'mining_rock' || currentAction === 'mining_vein') && (
                <button className="btn btn-red scene-cancel-btn" onClick={stopAction}>Stop Mining</button>
              )}
              {(currentAction === 'smelting' || currentAction === 'smithing') && (
                <button className="btn btn-red scene-cancel-btn" onClick={stopAction}>Stop Smithing</button>
              )}
              {currentAction === 'kiln_collect' && (
                <button className="btn btn-red scene-cancel-btn" onClick={stopAction}>Stop</button>
              )}
            </div>
          )}

          {botCheckPending && (
            <div className="scene-action-overlay">
              <div className="bot-check">
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
            </div>
          )}

          {(currentAction === 'smelting' || currentAction === 'smithing' || !currentAction) && locationData?.location?.name === 'Emberra' && (
            <div className="action-limit-bar">
              <div className="action-limit-controls">
                <label className="muted-text" style={{ fontSize: '12px' }}>Action Limit:</label>
                <input
                  id="action-limit-input"
                  type="number"
                  min="1"
                  placeholder="∞"
                  className="action-limit-field"
                  disabled={currentAction === 'smelting' || currentAction === 'smithing'}
                  onChange={e => {
                    const val = e.target.value ? parseInt(e.target.value) : null
                    if (onActionLimitChange) onActionLimitChange(val)
                  }}
                  style={{
                    width: '50px',
                    fontSize: '13px',
                    padding: '2px 6px',
                    opacity: (currentAction === 'smelting' || currentAction === 'smithing') ? 0.5 : 1,
                    cursor: (currentAction === 'smelting' || currentAction === 'smithing') ? 'not-allowed' : 'text',
                  }}
                />
              </div>
              {actionLimit && (
                <span className="scene-actions-remaining muted-text">
                  {actionLimit - actionsCompleted} actions remaining
                </span>
              )}
            </div>
          )}

          {lastResult && (
            <div className="scene-last-result">
              <p className="last-result-item">You gained {lastResult.quantity ?? 1} × {lastResult.itemName}</p>
              <p className="last-result-xp">+{lastResult.xpAwarded} {lastResult.skillName} XP (Total: {lastResult.totalXp.toLocaleString()})</p>
              <p className="last-result-next">{lastResult.xpToNext.toLocaleString()} XP until level {lastResult.level + 1}</p>
              {lastResult.remainingQuantity !== undefined && (
                <p className="last-result-remaining">{lastResult.remainingQuantity} ore remaining in vein</p>
              )}
            </div>
          )}

          {veinNotification && (
            <div className="scene-vein-notification">
              <span>⛏ {veinNotification}</span>
              <button onClick={() => setVeinNotification(null)}>✕</button>
            </div>
          )}

          {log.length > 0 && (
            <div className="scene-log">
              {[...log].reverse().slice(0, 3).map(entry => (
                <p key={entry.id} className={`scene-log-entry log-${entry.type}`}>
                  {entry.message}
                </p>
              ))}
            </div>
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