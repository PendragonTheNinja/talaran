import { useState, useEffect, useRef, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { flyItemToPack, setItemAnimationEnabled } from '../lib/itemFly'
import { getSocket } from '../lib/socket'
import './GameView.css'
import LogPanel from './LogPanel'
import './TravelLog.css'
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
  // Matches GameLayout: `id` is a node id, a recipe id, or a key like 'ambren'.
  externalAction: { type: string; id: number | string; text?: string } | null
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

// Where the Action Limit bar is offered. `recipe` covers every bench craft the
// shared executor runs — Caliwen crafting, and the Farming and Husbandry
// processing tabs — which already send actionLimit but had nowhere to set it.
const PROCESSING_ACTIONS = ['smelting', 'smithing', 'sawing', 'woodworking', 'recipe']
const PROCESSING_LOCATIONS = ['Emberra', 'Verdale', 'Caliwen', 'Novita']

const FISHING_SCENE_TEXT: Record<string, string> = {
  fishing_rod: 'You cast out, and settle in to wait.',
  fishing_net: 'You pay the net out across the shallows and begin the long haul.',
  fishing_cut_bait: 'You work the knife along the flank, cutting the fish down for bait.',
}

const FARM_SCENE_TEXT: Record<string, string> = {
  establish: 'You raise your farmstead, post and beam, stone and nail.',
  build_plot: 'You set posts and rails, fencing in a new field.',
  till: 'You break the soil, turning it over ready for seed.',
  sow: 'You work down the rows, pressing seed into the earth.',
  harvest: 'You lift the crop from the earth, filling your baskets.',
  manure: 'You barrow muck onto the field and turn it into the soil.',
  tend: 'You carry water down the rows, pulling weeds as you go.',
  uproot: 'You break the roots and turn the crop back into the soil.',
}

const HUSBANDRY_SCENE_TEXT: Record<string, string> = {
  build_pen: 'You sink posts and hang panels, closing in a new pen.',
  demolish_pen: 'You draw the nails and stack the timber where it stood.',
  feed: 'You go along the troughs with the pail, feeding and watering.',
  feed_all: 'You work the whole farm with the pail, trough by trough.',
  muck_all: 'You work through every pen in turn, forking out and laying fresh straw.',
  muck: 'You fork out the soiled bedding and lay down fresh straw.',
  collect: 'You work among the animals, gathering what they have given.',
  collect_all: 'You go along the pen with a basket, clearing it as you pass.',
  slaughter: 'You do the work out behind the barn, quickly and without fuss.',
  slaughter_all: 'You work through the pen, one after another, and do not dawdle.',
  tame: 'You work the halter on gently, letting it get used to the weight.',
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
  const botCheckInputRef = useRef<HTMLInputElement>(null)
  const [botCheckAnswer, setBotCheckAnswer] = useState('')
  const [botCheckQuestion, setBotCheckQuestion] = useState({ a: 0, b: 0 })
  const [veins, setVeins] = useState<any[]>([])
  const [veinNotification, setVeinNotification] = useState<string | null>(null)
  const [farmKind, setFarmKind] = useState<string>('till')
  const [husbandryKind, setHusbandryKind] = useState<string>('feed')
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
    drops?: { name: string; quantity: number; notable?: boolean; firstEver?: boolean }[]
    notable?: boolean
    firstDiscovery?: boolean
    firstEver?: boolean
    message?: string
  } | null>(null)
  const [levelUpSkill, setLevelUpSkill] = useState<{ name: string; level: number } | null>(null)
  const [actionsCompleted, setActionsCompleted] = useState(0)

  const [travelLogOpen, setTravelLogOpen] = useState(false)
  const [travelLogKey, setTravelLogKey] = useState(0)
  // Bumped ONLY when a journey turned something up, so the panel switches to
  // the travel tab exactly when it auto-opens, not after every uneventful walk.
  const [travelFindKey, setTravelFindKey] = useState(0)
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

  // Every skill reports through lastResult, so hooking it here covers gathering,
  // crafting, farming and anything added later without touching each one.
  useEffect(() => {
    const r = lastResult
    if (!r?.itemName && !(r?.drops || []).length) return
    // The card renders in a few places (desktop and mobile layouts), so find
    // whichever one is actually on screen rather than holding a ref to one.
    const card = document.querySelector<HTMLElement>('.scene-last-result')

    // Build the pile in order, then unload it TOP FIRST. Previously every flyer
    // held for a fixed time and so left in the order it arrived, which meant the
    // bottom of the stack slid out from under the others.
    //
    // Deduplicated by name, because a result may legitimately report the same
    // item BOTH ways: fishing sends the catch as itemName AND as its only drop,
    // so a single Perch used to fly twice. Skills whose drops are SECONDARY
    // (woodcutting's log plus a bird's nest) are unaffected, since those names
    // differ and both still fly.
    const pile: { name: string; firstTime: boolean }[] = []
    const seen = new Set<string>()
    const push = (name: string, firstTime: boolean) => {
      if (!name || seen.has(name)) return
      seen.add(name)
      pile.push({ name, firstTime })
    }
    if (r.itemName) push(r.itemName, !!r.firstEver || !!r.firstDiscovery)
    for (const d of (r.drops || [])) push(d.name, !!d.firstEver)

    const APPEAR_GAP = 260      // between one item landing on the pile and the next
    const SETTLE = 220          // beat after the last one lands, before unloading
    const DEPART_GAP = 200      // between departures

    const timers: number[] = []
    pile.forEach((entry, i) => {
      const appearAt = APPEAR_GAP * i
      // Last in, first out: the top of the pile leaves first.
      const departAt = APPEAR_GAP * (pile.length - 1) + SETTLE
        + DEPART_GAP * (pile.length - 1 - i)
      timers.push(window.setTimeout(() => {
        flyItemToPack({
          itemName: entry.name,
          fromEl: card,
          firstTime: entry.firstTime,
          stackIndex: i,
          holdMs: Math.max(0, departAt - appearAt),
        })
      }, appearAt))
    })

    return () => timers.forEach(clearTimeout)
  }, [lastResult])

  // Put the cursor in the bot check the moment it appears, however it was
  // triggered, so the player can type the answer straight away. autoFocus alone
  // was unreliable: on a forced check the FAB still holds focus when the modal
  // mounts, and the browser does not always hand it over.
  useEffect(() => {
    if (!botCheckPending) return
    const t = window.setTimeout(() => {
      botCheckInputRef.current?.focus()
      botCheckInputRef.current?.select()
    }, 60)
    return () => clearTimeout(t)
  }, [botCheckPending])

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
        // Keep the vein counter honest. Veins were only refetched when one was
        // discovered or ran out, so the "(7 left)" on the action link sat stale
        // through every swing in between and only corrected itself when the vein
        // vanished. Every completed swing changes that number, so every completed
        // swing should refresh it.
        if ((data as any).actionType === 'mining_vein') loadVeins()

        // Hunting: its own result shape (no single itemName; success/miss + drops)
        if ((data.result as any)?.skillName === 'Hunting') {
          const r = data.result as any
          setLastResult({
            firstEver: (data as any).firstEver,
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

        // Fishing: rod casts, net hauls and cutting bait.
        //
        // A snapped line and a cut fish both produce no item, so neither can go
        // through the itemName gate below. Fishing also repeats, so unlike
        // husbandry this branch must restart the countdown rather than clear it.
        if (String((data as any).actionType || '').startsWith('fishing_')) {
          const r = data.result as any
          setLastResult({
            firstEver: (data as any).firstEver,
            itemName: r.itemName ?? null,
            quantity: r.quantity,
            xpAwarded: r.xpAwarded || 0,
            totalXp: data.xpInfo?.totalXp || 0,
            level: data.xpInfo?.level || 1,
            xpToNext: data.xpInfo?.xpToNext || 0,
            xpAtLevel: (data.xpInfo as any)?.xpAtLevel || 0,
            skillName: 'Fishing',
            message: r.message,
            craftingXp: r.craftingXp,
            weightLb: r.weightLb,
            newRecord: r.newRecord,
            newHeaviest: r.newHeaviest,
            newLightest: r.newLightest,
            snapped: r.snapped,
            salvage: r.salvage,
            baitRemaining: r.baitRemaining,
            baitCategory: r.baitCategory,
            firstDiscovery: r.firstDiscovery,
            drops: r.drops || [],
          } as any)

          if (data.xpInfo?.leveledUp) {
            setLevelUpSkill({ name: 'Fishing', level: data.xpInfo.level })
          }
          onPlayerDataUpdate()
          onInventoryUpdate()
          setActionsCompleted(prev => prev + 1)

          // No nextCompletes means the server stopped the loop: rod unequipped,
          // knife put away, or the last fish of the stack cut.
          if (data.timerSeconds && data.nextCompletes) {
            setTimerSeconds(data.timerSeconds)
            setTimerMax(data.timerSeconds)
            startCountdown(data.timerSeconds, data.nextCompletes)
          } else {
            setCurrentAction(null)
            setActiveNodeId(null)
            setTimerSeconds(0)
            if (timerRef.current) clearInterval(timerRef.current)
          }
          return
        }

        // Husbandry: same shape as farm work below — building a pen, feeding and
        // a truffle roll that comes up empty all produce no item, so they cannot
        // go through the itemName gate either.
        if (String((data as any).actionType || '').startsWith('husbandry_')) {
          const r = data.result as any
          const skillName = r.skillName || 'Husbandry'
          setLastResult({
            firstEver: (data as any).firstEver,
            itemName: r.itemName ?? null,
            quantity: r.quantity,
            xpAwarded: r.xpAwarded || 0,
            totalXp: data.xpInfo?.totalXp || 0,
            level: data.xpInfo?.level || 1,
            xpToNext: data.xpInfo?.xpToNext || 0,
            xpAtLevel: (data.xpInfo as any)?.xpAtLevel || 0,
            skillName,
            message: r.message,
            drops: r.drops || [],
          })
          if (data.xpInfo?.leveledUp) {
            setLevelUpSkill({ name: skillName, level: data.xpInfo.level })
          }
          setCurrentAction(null)
          setActiveNodeId(null)
          setTimerSeconds(0)
          if (timerRef.current) clearInterval(timerRef.current)
          onPlayerDataUpdate()
          onInventoryUpdate()
          setActionsCompleted(prev => prev + 1)
          return
        }

        // Farm work: one-shot jobs, and most of them produce no item at all
        // (raising a farmstead, fencing, tilling, sowing) — so they can't go
        // through the itemName gate below.
        if (String((data as any).actionType || '').startsWith('farm_')) {
          const r = data.result as any
          const skillName = r.skillName || 'Farming'
          setLastResult({
            firstEver: (data as any).firstEver,
            itemName: r.itemName ?? null,
            quantity: r.quantity,
            xpAwarded: r.xpAwarded || 0,
            totalXp: data.xpInfo?.totalXp || 0,
            level: data.xpInfo?.level || 1,
            xpToNext: data.xpInfo?.xpToNext || 0,
            xpAtLevel: (data.xpInfo as any)?.xpAtLevel || 0,
            skillName,
            message: r.message,
            drops: [],
          })
          if (data.xpInfo?.leveledUp) {
            setLevelUpSkill({ name: skillName, level: data.xpInfo.level })
          }
          setCurrentAction(null)
          setActiveNodeId(null)
          setTimerSeconds(0)
          if (timerRef.current) clearInterval(timerRef.current)
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
            firstEver: (data as any).firstEver,
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
            message: (data.result as any).message,
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
            firstEver: (data as any).firstEver,
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
          setTravelFindKey(k => k + 1)
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

    // The server row carries action_limit and actions_completed, and always has.
    // Without reading them a refresh mid-run showed no progress at all: the input
    // is uncontrolled so it came back empty, and the counter restarted at zero.
    if (action.action_limit && action.action_limit > 0) {
      onActionLimitChange?.(action.action_limit)
      const input = document.getElementById('action-limit-input') as HTMLInputElement
      if (input) input.value = String(action.action_limit)
    }
    setActionsCompleted(action.actions_completed || 0)

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

      case 'farm_establish':
      case 'farm_build_plot':
      case 'farm_till':
      case 'farm_sow':
      case 'farm_harvest':
      case 'farm_uproot':
      case 'farm_manure':
      case 'farm_tend':
        setCurrentAction('farming')
        setFarmKind(action.action_type.replace('farm_', ''))
        setTimerMax(secondsLeft || 5)
        startCountdown(secondsLeft, action.completes_at)
        break

      case 'husbandry_build_pen':
      case 'husbandry_demolish_pen':
      case 'husbandry_feed':
      case 'husbandry_feed_all':
      case 'husbandry_muck':
      case 'husbandry_muck_all':
      case 'husbandry_collect':
      case 'husbandry_collect_all':
      case 'husbandry_slaughter':
      case 'husbandry_slaughter_all':
      case 'husbandry_tame':
        setCurrentAction('husbandry')
        setHusbandryKind(action.action_type.replace('husbandry_', ''))
        setTimerMax(secondsLeft || 5)
        startCountdown(secondsLeft, action.completes_at)
        break

      case 'foraging':
        setCurrentAction('foraging')
        setActiveNodeId(Number(action.action_data))
        setTimerMax(secondsLeft || 5)
        startCountdown(secondsLeft, action.completes_at)
        break

      case 'fishing_rod':
      case 'fishing_net':
      case 'fishing_cut_bait':
        setCurrentAction(action.action_type)
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
    } else if (externalAction.type === 'farming') {
      // Same start-of-action cleanup every other skill does: clear the previous
      // result card and any stale timer before the new job begins.
      setLastResult(null)
      setActiveNodeId(null)
      setTimerSeconds(0)
      onClearTravel()
      if (timerRef.current) clearInterval(timerRef.current)

      setCurrentAction('farming')
      setFarmKind(externalAction.text || 'till')
      setTimerMax(externalAction.id as number)
      startCountdown(externalAction.id as number)
    } else if (externalAction.type === 'husbandry') {
      // Same start-of-action cleanup every other skill does (checklist item 8):
      // clear the previous result card and any stale timer first.
      setLastResult(null)
      setActiveNodeId(null)
      setTimerSeconds(0)
      onClearTravel()
      if (timerRef.current) clearInterval(timerRef.current)

      setCurrentAction('husbandry')
      setHusbandryKind(externalAction.text || 'feed')
      setTimerMax(externalAction.id as number)
      startCountdown(externalAction.id as number)
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
    } else if (externalAction.type === 'fishing_rod') {
      // id carries the bait category, or an empty string for an unbaited cast.
      startRodFishing((externalAction.id as string) || null)
    } else if (externalAction.type === 'fishing_net') {
      startNetFishing()
    } else if (externalAction.type === 'fishing_cut_bait') {
      startCutBait(externalAction.id as string)
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
    apiFetch<{ showTravelLog?: boolean; showItemAnimation?: boolean }>('/api/settings')
      .then(d => {
        setShowTravelLogSetting(d.showTravelLog ?? true)
        setItemAnimationEnabled(d.showItemAnimation ?? true)
      })
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

      const res = await apiFetch<{ timerSeconds: number; completesAt: string }>('/api/smithing/smith/start', {
        method: 'POST',
        body: JSON.stringify({
          metalType: recipe.split('_')[0],
          partType: recipe.split('_').slice(1).join('_'),
          actionLimit: currentLimit,
        }),
      })
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
    Farming: 'You are working the crop.',
  }

  const startRecipe = async (recipeId: number) => {
    try {
      if (currentAction) await apiFetch('/api/actions/stop', { method: 'POST' })
      setLastResult(null)
      setCurrentAction(null)
      setActiveNodeId(null)
      setTimerSeconds(0)
      // Every other start path resets this; recipes did not, so the count from
      // whatever the player did earlier carried over and "N remaining" was
      // instantly clamped to 0 for the whole run.
      setActionsCompleted(0)
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

  // Fishing. Three entry points, one shape: stop whatever is running, clear the
  // previous result card (checklist item 8), then start.
  const startFishingAction = async (
    endpoint: string,
    body: Record<string, unknown>,
    actionType: string,
    failure: string,
  ) => {
    try {
      if (currentAction) await apiFetch('/api/actions/stop', { method: 'POST' })
      setLastResult(null)
      setCurrentAction(null)
      setActiveNodeId(null)
      setTimerSeconds(0)
      onClearTravel()
      if (timerRef.current) clearInterval(timerRef.current)

      const res = await apiFetch<{ timerSeconds: number; completesAt: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setCurrentAction(actionType)
      setTimerMax(res.timerSeconds)
      startCountdown(res.timerSeconds, res.completesAt)
    } catch (err: any) {
      if (err.status === 423) {
        rememberPendingAction(() => startFishingAction(endpoint, body, actionType, failure))
        return
      }
      addLog(err.message || failure, 'error')
    }
  }

  const startRodFishing = (baitCategory: string | null) =>
    startFishingAction('/api/fishing/start', { baitCategory }, 'fishing_rod', 'Could not start fishing.')

  const startNetFishing = () =>
    startFishingAction('/api/fishing/net/start', {}, 'fishing_net', 'Could not cast the net.')

  const startCutBait = (species: string) =>
    startFishingAction('/api/fishing/cut', { species }, 'fishing_cut_bait', 'Could not cut bait.')

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
    // Fishing: the catch is a weight, not just an item, and a snapped line
    // produces nothing at all.
    if (r.skillName === 'Fishing') {
      return (
        <>
          {r.snapped ? (
            <p className="last-result-item">{r.message}</p>
          ) : (
            <>
              <p className="last-result-item">{r.message}</p>
              {r.newHeaviest && (
                <p className="last-result-drop">
                  <span className="drop-sparkle">✦</span> The largest you have ever landed.
                </p>
              )}
              {r.newLightest && (
                <p className="last-result-drop">
                  <span className="drop-sparkle">✦</span> The smallest you have ever landed.
                </p>
              )}
              {/* A rod catch is already fully described by the message above
                  ("You land a Perch. It weighs 2.31 lb"), so listing it again
                  as a gained line just says the same thing twice. Net hauls
                  have no weight and a message that names no fish, so their
                  drops list is the only place the catch is reported. */}
              {r.weightLb === undefined && !r.salvage && r.drops && r.drops.map((d: any, i: number) => (
                <p key={`fd-${i}`} className="last-result-gained">
                  You gained {d.quantity > 1 ? `${d.quantity}× ` : ''}{d.name}.
                </p>
              ))}
            </>
          )}

          {r.xpAwarded > 0 ? (
            <>
              <p className="last-result-xp">
                +{r.xpAwarded} {r.skillName} experience, {r.totalXp.toLocaleString()} total.
              </p>
              {r.craftingXp > 0 && (
                <p className="last-result-xp">+{r.craftingXp} Crafting experience.</p>
              )}
              <p className="last-result-next">
                {Math.ceil(r.xpToNext / r.xpAwarded).toLocaleString()} actions ({r.xpToNext.toLocaleString()} xp) to level {r.level + 1} ({
                  (() => {
                    const xpIntoLevel = r.totalXp - r.xpAtLevel
                    const xpNeededForLevel = xpIntoLevel + r.xpToNext
                    return ((xpIntoLevel / xpNeededForLevel) * 100).toFixed(2)
                  })()
                }%)
              </p>
            </>
          ) : (
            <p className="last-result-remaining muted-text">No experience from a lost line.</p>
          )}

          {r.baitCategory && (
            <p className="last-result-remaining muted-text">
              {r.baitRemaining} {r.baitCategory} bait left in the pouch.
            </p>
          )}
        </>
      )
    }

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
              <p key={`hd-${i}`} className="last-result-gained">
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

    if (r.message) {
      return (
        <>
          <p className="last-result-item">{r.message}</p>
          {r.itemName && (
            <p className="last-result-drop">You gathered {r.quantity ?? 1} × {r.itemName}.</p>
          )}
          <p className="last-result-xp">+{r.xpAwarded} {r.skillName} experience, {r.totalXp.toLocaleString()} total.</p>
        </>
      )
    }

    return (
      <>
        <p className="last-result-item">
          {(r.notable || r.firstDiscovery) && <span className="drop-sparkle">✦ </span>}
          {r.firstDiscovery && <span className="discovery-tag">New discovery! </span>}
          You gained {r.quantity ?? 1} × {r.itemName}!
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
            <p key={`drop-${i}`} className="last-result-gained">
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
              {currentAction === 'farming' && (
                <p className="scene-action-text gold-text">{FARM_SCENE_TEXT[farmKind] || FARM_SCENE_TEXT.till}</p>
              )}
              {currentAction === 'husbandry' && (
                <p className="scene-action-text gold-text">{HUSBANDRY_SCENE_TEXT[husbandryKind] || HUSBANDRY_SCENE_TEXT.feed}</p>
              )}
              {currentAction === 'foraging' && (
                <p className="scene-action-text gold-text">
                  {(locationData as any)?.foragingHabitats?.find((h: any) => h.id === activeNodeId)?.scene_text || 'You gather among the wild growth.'}
                </p>
              )}
              {currentAction.startsWith('fishing_') && (
                <p className="scene-action-text gold-text">
                  {FISHING_SCENE_TEXT[currentAction] || FISHING_SCENE_TEXT.fishing_rod}
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
              {currentAction === 'farming' && (
                <button className="btn btn-red scene-cancel-btn" onClick={stopAction}>Stop Working</button>
              )}
              {currentAction === 'husbandry' && (
                <button className="btn btn-red scene-cancel-btn" onClick={stopAction}>Stop Tending</button>
              )}
              {currentAction === 'fishing_rod' && (
                <button className="btn btn-red scene-cancel-btn" onClick={stopAction}>Stop Fishing</button>
              )}
              {currentAction === 'fishing_net' && (
                <button className="btn btn-red scene-cancel-btn" onClick={stopAction}>Stop Netting</button>
              )}
              {currentAction === 'fishing_cut_bait' && (
                <button className="btn btn-red scene-cancel-btn" onClick={stopAction}>Stop Cutting</button>
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

          <LogPanel
            open={travelLogOpen}
            onOpen={() => setTravelLogOpen(true)}
            onClose={() => setTravelLogOpen(false)}
            travelRefreshKey={travelLogKey}
            lootRefreshKey={actionsCompleted}
            forceTravelTab={travelFindKey}
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

      {/* Bot check lives at the top of the tree, not inside the scene. It used to
          render as an absolutely-positioned scene element at z-index 2, which any
          open panel (z-index 500) painted straight over — so a player who tripped
          a check from inside the Homestead had to close the panel, answer, and
          navigate back in. As a fixed overlay above panels it simply appears. */}
      {botCheckPending && (
        <div className="botcheck-overlay">
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
                ref={botCheckInputRef}
                autoFocus
              />
              <button className="btn btn-gold" onClick={handleBotCheck}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}