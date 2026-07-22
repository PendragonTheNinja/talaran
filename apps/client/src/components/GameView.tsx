import { useState, useEffect, useRef, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { getSocket } from '../lib/socket'
import './GameView.css'
import TravelLog from './TravelLog'
import BotCheckFab from './BotCheckFab'

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
  onTrapsChanged?: () => void
  onActionLimitChange: (limit: number | null) => void
  onInventoryUpdate: () => void
  rememberPendingAction: (fn: () => void) => void
  runPendingAction: () => void
  onShareToChat?: (text: string) => void
  onLocationDataUpdate?: () => void
  onForceBotCheck?: () => void
}

interface LogEntry {
  id: number
  message: string
  type: 'success' | 'info' | 'error' | 'level'
}

const PROCESSING_ACTIONS = ['smelting', 'smithing', 'sawing', 'woodworking']
const PROCESSING_LOCATIONS = ['Emberra', 'Verdale']

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
  onTrapsChanged,
  onActionLimitChange,
  onInventoryUpdate,
  rememberPendingAction,
  runPendingAction,
  onShareToChat,
  onLocationDataUpdate,
  onForceBotCheck
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
    xpAtLevel: number
    skillName: string
    remainingQuantity?: number
    quantity?: number
    ingredientsRemaining?: { name: string; quantity: number }[]
    outputTotal?: number
    ended?: 'limit' | 'materials' | 'unavailable'
    drops?: { name: string; quantity: number }[]
    notable?: boolean
    firstDiscovery?: boolean
  } | null>(null)
  const [levelUpSkill, setLevelUpSkill] = useState<{ name: string; level: number } | null>(null)
  const [actionsCompleted, setActionsCompleted] = useState(0)

  const [travelLogOpen, setTravelLogOpen] = useState(false)
  const [travelLogKey, setTravelLogKey] = useState(0)
  const [showTravelLogSetting, setShowTravelLogSetting] = useState(true)

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
        // Hunting: its own result shape (no single itemName; success/miss + drops)
        if ((data.result as any)?.skillName === 'Hunting') {
          const r = data.result as any
          setLastResult({
            itemName: null,
            xpAwarded: r.xpAwarded || 0,
            totalXp: data.xpInfo?.totalXp || 0,
            level: data.xpInfo?.level || 1,
            xpToNext: data.xpInfo?.xpToNext || 0,
            xpAtLevel: data.xpInfo?.xpAtLevel || 0,
            skillName: 'Hunting',
            huntSuccess: r.huntSuccess,
            animalName: r.animalName,
            arrowRecovered: r.arrowRecovered,
            drops: r.drops || [],
            ended: r.ended,
          } as any)

          if (data.xpInfo?.leveledUp) {
            setLevelUpSkill({ name: 'Hunting', level: data.xpInfo.level })
          }
          onPlayerDataUpdate()
          onInventoryUpdate()
          setActionsCompleted(prev => prev + 1)
          if (r.ended) {
            setCurrentAction(null)
            setActiveNodeId(null)
            setTimerSeconds(0)
            if (timerRef.current) clearInterval(timerRef.current)
          } else if (data.timerSeconds) {
            setTimerSeconds(data.timerSeconds)
            setTimerMax(data.timerSeconds)
            startCountdown(data.timerSeconds, data.nextCompletes)
          }
          return
        }

        if (data.result?.itemName) {
          // Recipe crafts carry their own skill — the executor is skill-agnostic, so
          // the action type can't imply it. Legacy actions still infer from the type.
          const skillName =
            (data.result as any).skillName ||
            (currentActionRef.current === 'mining_rock' || currentActionRef.current === 'mining_vein' ? 'Mining' :
              currentActionRef.current === 'smelting' || currentActionRef.current === 'smithing' || currentActionRef.current === 'kiln_collect' ? 'Smithing' :
                currentActionRef.current === 'sawing' || currentActionRef.current === 'woodworking' ? 'Carpentry' :
                  'Woodcutting')

          setLastResult({
            itemName: data.result.itemName,
            xpAwarded: data.result.xpAwarded || 0,
            totalXp: data.xpInfo?.totalXp || 0,
            level: data.xpInfo?.level || 1,
            xpToNext: data.xpInfo?.xpToNext || 0,
            xpAtLevel: data.xpInfo?.xpAtLevel || 0,
            skillName,
            remainingQuantity: data.result.remainingQuantity,
            quantity: (data.result as any).quantity,
            ingredientsRemaining: (data.result as any).ingredientsRemaining,
            outputTotal: (data.result as any).outputTotal,
            drops: (data.result as any).drops,
            notable: (data.result as any).notable,
            firstDiscovery: (data.result as any).firstDiscovery,
          })

          if (data.xpInfo?.leveledUp) {
            setLevelUpSkill({ name: skillName, level: data.xpInfo.level })
          }
        }
        onPlayerDataUpdate()
        onInventoryUpdate()
        setActionsCompleted(prev => prev + 1)
        if (data.timerSeconds) {
          setTimerSeconds(data.timerSeconds)
          setTimerMax(data.timerSeconds)
          startCountdown(data.timerSeconds, data.nextCompletes)
        }
      })

      socket.on('travel_complete', (data: { result: any }) => {
        if (data?.result) {
          setLastResult({
            itemName: null,
            xpAwarded: data.result.xpAwarded || 0,
            skillName: data.result.skillName,
            totalXp: data.result.totalXp || 0,
            level: data.result.level || 1,
            xpToNext: data.result.xpToNext || 0,
            xpAtLevel: data.result.xpAtLevel || 0,
            message: `You arrive at ${data.result.destination}.`,
            drops: data.result.drops || [],
          } as any)
        }
        setCurrentAction(null)
        setTimerSeconds(0)
        setTimerMax(0)
        onClearTravel()
        if (timerRef.current) clearInterval(timerRef.current)
        onPlayerDataUpdate()
        onInventoryUpdate()
        onLocationDataUpdate?.()

        // Travel log: refresh history; auto-open if this walk had events and the setting is on
        const hadEvents = data?.result?.events && data.result.events.length > 0
        setTravelLogKey(k => k + 1)
        if (hadEvents) {
          apiFetch<{ showTravelLog?: boolean }>('/api/settings')
            .then(d => { if (d.showTravelLog ?? true) setTravelLogOpen(true) })
            .catch(() => { })
        }
      })

      socket.on('force_refresh', () => window.location.reload())

      socket.on('action_failed', (data: { error: string; info?: boolean }) => {
        addLog(data.error || 'Action stopped.', data.info ? 'info' : 'error')
        if (data.info) setLastResult(prev => prev ? { ...prev, ended: 'materials' } : prev)
        setCurrentAction(null)
        setActiveNodeId(null)
        setTimerSeconds(0)
        if (timerRef.current) clearInterval(timerRef.current)
      })

      socket.on('bot_check_required', (data: { a: number; b: number }) => {
        setBotCheckQuestion({ a: data.a, b: data.b })
        setBotCheckPending(true)
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

      socket.on('quest_rewards', (data: { questName: string; items: { itemName: string; quantity: number }[]; xp: number; skill: string }) => {
        for (const item of data.items) {
          addLog(`You received ${item.quantity}× ${item.itemName}.`, 'success', true)
        }
        if (data.xp > 0) addLog(`+${data.xp} ${data.skill} experience.`, 'success', true)
      })

      socket.on('trap_sprung', () => {
        addLog('Something has sprung one of your traps!')
        onTrapsChanged?.()
      })

      socket.on('action_limit_reached', (data: { message: string }) => {
        addLog(data.message, 'info')
        setLastResult(prev => prev ? { ...prev, ended: 'limit' } : prev)
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
        socket.off('trap_sprung')
        socket.off('quest_rewards')
        socket.off('vein_discovered')
        socket.off('vein_announced')
        socket.off('vein_depleted')
        socket.off('action_switched')
        socket.off('action_limit_reached')
        socket.off('force_refresh')
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

      case 'sawing':
        setCurrentAction('sawing')
        setTimerMax(secondsLeft || 5)
        startCountdown(secondsLeft, action.completes_at)
        break

      case 'woodworking':
        setCurrentAction('woodworking')
        setTimerMax(secondsLeft || 5)
        startCountdown(secondsLeft, action.completes_at)
        break

      case 'hunting':
        setCurrentAction('hunting')
        setActiveNodeId(Number(action.action_data))
        setTimerMax(secondsLeft || 5)
        startCountdown(secondsLeft, action.completes_at)
        break

      case 'foraging':
        setCurrentAction('foraging')
        setActiveNodeId(Number(action.action_data))
        setTimerMax(secondsLeft || 5)
        startCountdown(secondsLeft, action.completes_at)
        break

      case 'recipe':
        setCurrentAction('recipe')
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
    } else if (externalAction.type === 'sawing') {
      startSawing(externalAction.id as string)
    } else if (externalAction.type === 'woodworking') {
      startWoodworking(externalAction.id as string)
    } else if (externalAction.type === 'set_action_limit') {
      onActionLimitChange(externalAction.id === 0 ? null : externalAction.id as number)
    } else if (externalAction.type === 'hunting') {
      startHunt(externalAction.id as number)
    } else if (externalAction.type === 'foraging') {
      startForage(externalAction.id as number)
    } else if (externalAction.type === 'recipe') {
      startRecipe(externalAction.id as number)
    }

    onExternalActionHandled()
  }, [externalAction])

  useEffect(() => {
    if (!externalMessage) return
    const timer = setTimeout(() => onExternalMessageHandled(), 5000)
    return () => clearTimeout(timer)
  }, [externalMessage])

  useEffect(() => {
    apiFetch<{ showTravelLog?: boolean }>('/api/settings')
      .then(d => setShowTravelLogSetting(d.showTravelLog ?? true))
      .catch(() => { })
  }, [])

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
      if (err.status === 423) { rememberPendingAction(() => startAction(node)); return }
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
    try {
      const res = await apiFetch<{ resumed?: boolean; timerSeconds?: number; completesAt?: string; actionType?: string; nodeId?: number }>(
        '/api/actions/bot-check',
        {
          method: 'POST',
          body: JSON.stringify({ answer: parseInt(botCheckAnswer) })
        }
      )
      setBotCheckPending(false)
      setBotCheckAnswer('')
      if (res.resumed) {
        // The action was frozen at completion; the game tick will finish it and
        // emit action_complete, resuming exactly where the player left off.
        addLog('Bot check passed. Picking up where you left off...', 'info')
      } else if (res.timerSeconds && res.completesAt) {
        // Legacy resume path, kept for safety.
        addLog('Bot check passed. Continuing...', 'info')
        if (res.actionType) setCurrentAction(res.actionType)
        if (res.nodeId != null) setActiveNodeId(res.nodeId)
        setTimerMax(res.timerSeconds)
        startCountdown(res.timerSeconds, res.completesAt)
      } else {
        addLog('Bot check passed.', 'info')
        runPendingAction()
      }
    } catch (err: any) {
      addLog(err.message || 'Incorrect answer. Try again.', 'error')
      setBotCheckAnswer('')
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
      if (err.status === 423) { rememberPendingAction(() => startMiningRock(node)); return }
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
      if (err.status === 423) { rememberPendingAction(() => startMiningVein(vein)); return }
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
      const currentLimit = limitInput?.value && parseInt(limitInput.value) > 0 ? parseInt(limitInput.value) : null
      const res = await apiFetch<{ timerSeconds: number; completesAt: string }>('/api/smithing/smelt/start', {
        method: 'POST',
        body: JSON.stringify({
          metalType,
          actionLimit: currentLimit,
        }),
      })
      setCurrentAction('smelting')
      setLog([])
      setActionsCompleted(0)
      setTimerMax(res.timerSeconds)
      startCountdown(res.timerSeconds, res.completesAt)
    } catch (err: any) {
      if (err.status === 423) { rememberPendingAction(() => startSmelting(metalType)); return }
      addLog(err.message || 'Could not start smelting.', 'error')
    }
  }

  const startSmithing = async (recipe: string) => {
    console.log('startSmithing called with:', recipe)
    console.log('currentAction:', currentAction)
    try {
      if (currentAction) {
        console.log('stopping current action first...')
        await apiFetch('/api/actions/stop', { method: 'POST' })
      }
      setLastResult(null)
      setCurrentAction(null)
      setTimerSeconds(0)
      setActionsCompleted(0)
      onClearTravel()
      if (timerRef.current) clearInterval(timerRef.current)

      const limitInput = document.getElementById('action-limit-input') as HTMLInputElement
      const currentLimit = limitInput?.value && parseInt(limitInput.value) > 0 ? parseInt(limitInput.value) : null

      const res = await apiFetch<{ timerSeconds: number; completesAt: string }>('/api/smithing/smith/start', {
        method: 'POST',
        body: JSON.stringify({
          metalType: recipe.split('_')[0],
          partType: recipe.split('_').slice(1).join('_'),
          actionLimit: currentLimit,
        }),
      })
      console.log('smith/start response:', res)
      setCurrentAction('smithing')
      setLog([])
      setActionsCompleted(0)
      setTimerMax(res.timerSeconds)
      startCountdown(res.timerSeconds, res.completesAt)
    } catch (err: any) {
      if (err.status === 423) { rememberPendingAction(() => startSmithing(recipe)); return }
      addLog(err.message || 'Could not start smithing.', 'error')
    }
  }

  const startSawing = async (sawKey: string) => {
    try {
      if (currentAction) {
        await apiFetch('/api/actions/stop', { method: 'POST' })
      }
      setLastResult(null)
      setCurrentAction(null)
      setTimerSeconds(0)
      setActionsCompleted(0)
      onClearTravel()
      if (timerRef.current) clearInterval(timerRef.current)

      const limitInput = document.getElementById('action-limit-input') as HTMLInputElement
      const currentLimit = limitInput?.value && parseInt(limitInput.value) > 0 ? parseInt(limitInput.value) : null

      const res = await apiFetch<{ timerSeconds: number; completesAt: string }>('/api/carpentry/saw/start', {
        method: 'POST',
        body: JSON.stringify({ sawKey, actionLimit: currentLimit }),
      })
      setCurrentAction('sawing')
      setLog([])
      setActionsCompleted(0)
      setTimerMax(res.timerSeconds)
      startCountdown(res.timerSeconds, res.completesAt)
    } catch (err: any) {
      if (err.status === 423) { rememberPendingAction(() => startSawing(sawKey)); return }
      addLog(err.message || 'Could not start sawing.', 'error')
    }
  }

  const startWoodworking = async (recipeKey: string) => {
    try {
      if (currentAction) {
        await apiFetch('/api/actions/stop', { method: 'POST' })
      }
      setLastResult(null)
      setCurrentAction(null)
      setTimerSeconds(0)
      setActionsCompleted(0)
      onClearTravel()
      if (timerRef.current) clearInterval(timerRef.current)

      const limitInput = document.getElementById('action-limit-input') as HTMLInputElement
      const currentLimit = limitInput?.value && parseInt(limitInput.value) > 0 ? parseInt(limitInput.value) : null

      const res = await apiFetch<{ timerSeconds: number; completesAt: string }>('/api/carpentry/woodwork/start', {
        method: 'POST',
        body: JSON.stringify({ recipeKey, actionLimit: currentLimit }),
      })
      setCurrentAction('woodworking')
      setLog([])
      setActionsCompleted(0)
      setTimerMax(res.timerSeconds)
      startCountdown(res.timerSeconds, res.completesAt)
    } catch (err: any) {
      if (err.status === 423) { rememberPendingAction(() => startWoodworking(recipeKey)); return }
      addLog(err.message || 'Could not start woodworking.', 'error')
    }
  }

  // Label for the scene text — crafting is generic, so the server tells us what
  // we're actually making rather than hard-coding a string per action type.
  const [recipeLabel, setRecipeLabel] = useState<{ name: string; skill: string; flavorText: string | null } | null>(null)

  // Per-skill fallbacks, matching the scene text these actions had before crafting went generic
  const RECIPE_FLAVOR_BY_SKILL: Record<string, string> = {
    Smithing: 'You are working the forge.',
    Carpentry: 'You are working at the sawhorse.',
    Crafting: 'You are working the leather.',
  }

  const startRecipe = async (recipeId: number) => {
    try {
      if (currentAction) await apiFetch('/api/actions/stop', { method: 'POST' })
      setLastResult(null)
      setCurrentAction(null)
      setActiveNodeId(null)
      setTimerSeconds(0)
      onClearTravel()
      if (timerRef.current) clearInterval(timerRef.current)

      const res = await apiFetch<{ timerSeconds: number; completesAt: string; recipeName: string; skill: string; flavorText: string | null }>('/api/recipes/start', {
        method: 'POST',
        body: JSON.stringify({ recipeId, actionLimit }),
      })
      setRecipeLabel({ name: res.recipeName, skill: res.skill, flavorText: res.flavorText })
      setCurrentAction('recipe')
      setTimerMax(res.timerSeconds)
      startCountdown(res.timerSeconds, res.completesAt)
    } catch (err: any) {
      if (err.status === 423) { rememberPendingAction(() => startRecipe(recipeId)); return }
      addLog(err.message || 'Could not start that.', 'error')
    }
  }

  const startHunt = async (animalId: number) => {
    try {
      if (currentAction) await apiFetch('/api/actions/stop', { method: 'POST' })
      setLastResult(null)
      setCurrentAction(null)
      setActiveNodeId(null)
      setTimerSeconds(0)
      onClearTravel()
      if (timerRef.current) clearInterval(timerRef.current)

      const res = await apiFetch<{ timerSeconds: number; completesAt: string }>('/api/hunting/start', {
        method: 'POST',
        body: JSON.stringify({ animalId }),
      })
      setCurrentAction('hunting')
      setActiveNodeId(animalId)
      setTimerMax(res.timerSeconds)
      startCountdown(res.timerSeconds, res.completesAt)
    } catch (err: any) {
      if (err.status === 423) { rememberPendingAction(() => startHunt(animalId)); return }
      addLog(err.message || 'Could not start hunting.', 'error')
    }
  }

  const startForage = async (habitatId: number) => {
    try {
      if (currentAction) await apiFetch('/api/actions/stop', { method: 'POST' })
      setLastResult(null)
      setCurrentAction(null)
      setActiveNodeId(null)
      setTimerSeconds(0)
      onClearTravel()
      if (timerRef.current) clearInterval(timerRef.current)

      const res = await apiFetch<{ timerSeconds: number; completesAt: string }>('/api/foraging/start', {
        method: 'POST',
        body: JSON.stringify({ habitatId }),
      })
      setCurrentAction('foraging')
      setActiveNodeId(habitatId)
      setTimerMax(res.timerSeconds)
      startCountdown(res.timerSeconds, res.completesAt)
    } catch (err: any) {
      if (err.status === 423) { rememberPendingAction(() => startForage(habitatId)); return }
      addLog(err.message || 'Could not start foraging.', 'error')
    }
  }

  // ── Derived values ────────────────────────────────────────────────
  const woodcuttingNodes = locationData?.nodes.filter(n => n.skill === 'woodcutting') || []
  const miningNodes = locationData?.nodes.filter(n => n.skill === 'mining') || []
  const locationName = locationData?.location?.name || 'Unknown'
  const locationDesc = locationData?.location?.description || ''
  const connections = locationData?.connections || []
  const timerPercent = timerMax > 0 ? (timerSeconds / timerMax) * 100 : 0
  // Hunting phase narration — splits the single hunt timer into track → stalk → strike thirds
  const huntPhaseText = (() => {
    if (currentAction !== 'hunting' || timerMax <= 0) return 'You begin the hunt...'
    const animal = (locationData as any)?.huntableAnimals?.find((a: any) => a.id === activeNodeId)
    const name = animal?.name || 'your quarry'
    const progress = (timerMax - timerSeconds) / timerMax  // 0 → 1 as the hunt proceeds
    if (progress < 1 / 3) return `You pick up a ${name}'s trail...`
    if (progress < 2 / 3) return `You stalk the ${name}, keeping downwind...`
    return `You draw your bow on the ${name}...`
  })()

  // ── Render ────────────────────────────────────────────────────────
  const renderResultDetails = (r: any) => {
    // Hunting: success/miss layout (no single itemName)
    if (r.skillName === 'Hunting') {
      return (
        <>
          <p className="last-result-item">
            {r.huntSuccess
              ? `You felled the ${r.animalName}!`
              : `The ${r.animalName} got away, but you learned from the attempt.`}
          </p>
          <p className="last-result-xp">+{r.xpAwarded} {r.skillName} experience, {r.totalXp.toLocaleString()} total.</p>
          <p className="last-result-next">
            {Math.ceil(r.xpToNext / r.xpAwarded).toLocaleString()} actions ({r.xpToNext.toLocaleString()} xp) to level {r.level + 1} ({
              (() => {
                const xpIntoLevel = r.totalXp - r.xpAtLevel
                const xpNeededForLevel = xpIntoLevel + r.xpToNext
                return ((xpIntoLevel / xpNeededForLevel) * 100).toFixed(2)
              })()
            }%)
          </p>
          {r.drops && r.drops.map((d: any, i: number) => (
            d.notable ? (
              <p key={`hd-${i}`} className="last-result-drop">
                <span className="drop-sparkle">✦</span> You found {d.quantity > 1 ? `${d.quantity}× ` : ''}<span className="drop-name">{d.name}</span>!
              </p>
            ) : (
              <p key={`hd-${i}`} className="last-result-remaining">
                You gained {d.quantity > 1 ? `${d.quantity}× ` : ''}{d.name}.
              </p>
            )
          ))}
          <p className="last-result-remaining muted-text">
            {r.arrowRecovered ? 'You recovered your arrow.' : 'Your arrow was lost.'}
          </p>
          {r.ended === 'materials' && (
            <p className="last-result-ended-title gold-text">You've run out of arrows.</p>
          )}
        </>
      )
    }

    return (
      <>
        <p className="last-result-item">
          {r.notable && <span className="drop-sparkle">✦ </span>}
          You gained {r.quantity ?? 1} × {r.itemName}!
        </p>
        {r.firstDiscovery && (
          <p className="last-result-drop"><span className="drop-sparkle">✦</span> New discovery — you've found {r.itemName} here!</p>
        )}
        <p className="last-result-xp">+{r.xpAwarded} {r.skillName} experience, {r.totalXp.toLocaleString()} total.</p>
        <p className="last-result-next">
          {Math.ceil(r.xpToNext / r.xpAwarded).toLocaleString()} actions ({r.xpToNext.toLocaleString()} xp) to level {r.level + 1} ({
            (() => {
              const xpIntoLevel = r.totalXp - r.xpAtLevel
              const xpNeededForLevel = xpIntoLevel + r.xpToNext
              return ((xpIntoLevel / xpNeededForLevel) * 100).toFixed(2)
            })()
          }%)
        </p>
        {r.ingredientsRemaining && r.ingredientsRemaining.map((ing: any, i: number) => (
          <p key={i} className="last-result-remaining">You have {ing.quantity} {ing.name}</p>
        ))}
        {r.outputTotal !== undefined && (
          <p className="last-result-remaining">You have {r.outputTotal} {r.itemName}</p>
        )}
        {r.remainingQuantity !== undefined && (
          <p className="last-result-remaining">{r.remainingQuantity} ore remaining in vein</p>
        )}
        {r.drops && r.drops.map((d: any, i: number) => (
          d.notable ? (
            <p key={`drop-${i}`} className="last-result-drop">
              <span className="drop-sparkle">✦</span> You found {d.quantity > 1 ? `${d.quantity}× ` : ''}<span className="drop-name">{d.name}</span>!
            </p>
          ) : (
            <p key={`drop-${i}`} className="last-result-remaining">
              You also gained {d.quantity > 1 ? `${d.quantity}× ` : ''}{d.name}.
            </p>
          )
        ))}
      </>
    )
  }

  return (
    <div className="game-view panel">
      <div className="game-view-main">
        <div className="game-scene">

          {!currentAction && (
            <div className="scene-idle">
              <p className="scene-description">{locationDesc || 'You stand ready.'}</p>
              {lastResult?.ended && (
                <div className="scene-last-result action-ended-summary">
                  <p className="last-result-ended-title gold-text">
                    {lastResult.ended === 'limit' ? 'Action limit reached' : 'Out of materials'}
                  </p>
                  {renderResultDetails(lastResult)}
                </div>
              )}
              {lastResult && !lastResult.ended && (
                <div className="scene-last-result">
                  {lastResult.itemName === null ? (
                    <>
                      <p className="last-result-item">{(lastResult as any).message || 'You arrive.'}</p>
                      <p className="last-result-xp">
                        +{lastResult.xpAwarded} {lastResult.skillName} experience, {lastResult.totalXp.toLocaleString()} total.
                      </p>
                      <p className="last-result-next">
                        {Math.ceil(lastResult.xpToNext / lastResult.xpAwarded).toLocaleString()} actions ({lastResult.xpToNext.toLocaleString()} xp) to level {lastResult.level + 1} ({
                          (() => {
                            const into = lastResult.totalXp - lastResult.xpAtLevel
                            const need = into + lastResult.xpToNext
                            return ((into / need) * 100).toFixed(2)
                          })()
                        }%)
                      </p>
                      {lastResult.drops && lastResult.drops.map((d: any, i: number) => (
                        <p key={`found-${i}`} className="last-result-drop">
                          <span className="drop-sparkle">✦</span> You found {d.quantity > 1 ? `${d.quantity}× ` : ''}<span className="drop-name">{d.name}</span> along the way!
                        </p>
                      ))}
                    </>
                  ) : (
                    renderResultDetails(lastResult)
                  )}
                </div>
              )}
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
              {currentAction === 'sawing' && (
                <p className="scene-action-text gold-text">You are sawing planks.</p>
              )}
              {currentAction === 'woodworking' && (
                <p className="scene-action-text gold-text">You are working at the sawhorse.</p>
              )}
              {currentAction === 'hunting' && (
                <p className="scene-action-text gold-text">{huntPhaseText}</p>
              )}
              {currentAction === 'foraging' && (
                <p className="scene-action-text gold-text">
                  {(locationData as any)?.foragingHabitats?.find((h: any) => h.id === activeNodeId)?.scene_text || 'You gather among the wild growth.'}
                </p>
              )}
              {currentAction === 'recipe' && (
                <p className="scene-action-text gold-text">
                  {recipeLabel?.flavorText
                    || (recipeLabel && RECIPE_FLAVOR_BY_SKILL[recipeLabel.skill])
                    || 'You are working at the bench.'}
                </p>
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
              {(currentAction === 'sawing' || currentAction === 'woodworking') && (
                <button className="btn btn-red scene-cancel-btn" onClick={stopAction}>Stop Carpentry</button>
              )}
              {currentAction === 'hunting' && (
                <button className="btn btn-red scene-cancel-btn" onClick={stopAction}>Stop Hunting</button>
              )}
              {currentAction === 'foraging' && (
                <button className="btn btn-red scene-cancel-btn" onClick={stopAction}>Stop Foraging</button>
              )}
              {currentAction === 'recipe' && (
                <button className="btn btn-red scene-cancel-btn" onClick={stopAction}>
                  Stop {recipeLabel ? recipeLabel.skill : 'Crafting'}
                </button>
              )}
              {lastResult && (
                <div className="scene-last-result">
                  {renderResultDetails(lastResult)}
                </div>
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

          {((currentAction && PROCESSING_ACTIONS.includes(currentAction)) || (!currentAction && PROCESSING_LOCATIONS.includes(locationData?.location?.name))) && (
            <div className="action-limit-bar">
              <div className="action-limit-controls">
                <label className="muted-text" style={{ fontSize: '12px' }}>Action Limit:</label>
                <input
                  id="action-limit-input"
                  type="number"
                  min="1"
                  placeholder="∞"
                  className="action-limit-field"
                  disabled={!!currentAction}
                  onChange={e => {
                    const v = e.target.value ? parseInt(e.target.value) : null
                    if (onActionLimitChange) onActionLimitChange(v && v > 0 ? v : null)
                  }}
                  style={{
                    width: '50px',
                    fontSize: '13px',
                    padding: '2px 6px',
                    opacity: currentAction ? 0.5 : 1,
                    cursor: currentAction ? 'not-allowed' : 'text',
                  }}
                />
              </div>
              {actionLimit && actionLimit > 0 && (
                <span className="scene-actions-remaining muted-text">
                  {Math.max(0, actionLimit - actionsCompleted)} actions remaining
                </span>
              )}
            </div>
          )}

          {veinNotification && (
            <div className="scene-vein-notification">
              <span>⛏ {veinNotification}</span>
              <button onClick={() => setVeinNotification(null)}>✕</button>
            </div>
          )}

          {externalMessage && (
            <div className={`scene-external-message scene-external-${externalMessage.type}`}>
              <span>{externalMessage.text}</span>
              <button onClick={onExternalMessageHandled}>✕</button>
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

          <TravelLog
            open={travelLogOpen}
            onOpen={() => setTravelLogOpen(true)}
            onClose={() => setTravelLogOpen(false)}
            refreshKey={travelLogKey}
          />

          {onForceBotCheck && <BotCheckFab onClick={onForceBotCheck} />}

        </div>
      </div>

      {levelUpSkill && (
        <div className="levelup-popup">
          <div className="levelup-inner">
            <button className="levelup-close" onClick={() => setLevelUpSkill(null)}>✕</button>
            <div className="levelup-rays" />
            <p className="levelup-title">Level Up!</p>
            <div className="levelup-icon-wrap">
              <img
                src={`/images/skills/${levelUpSkill.name.replace(/ /g, '_')}Skill.png`}
                alt={levelUpSkill.name}
                className="levelup-icon"
                onError={e => { e.currentTarget.style.display = 'none' }}
              />
            </div>
            <p className="levelup-skill">{levelUpSkill.name}</p>
            <p className="levelup-level">Level <span className="levelup-level-num">{levelUpSkill.level}</span></p>
            <button
              className="levelup-share"
              onClick={() => {
                onShareToChat?.(`I just reached ${levelUpSkill.name} level ${levelUpSkill.level}! 🎉`)
                setLevelUpSkill(null)
              }}
            >
              Share
            </button>
          </div>
        </div>
      )}
    </div>
  )
}