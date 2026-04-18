import { useState, useEffect, useRef } from 'react'
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
}

interface GameViewProps {
  locationData: LocationData | null
  playerData: any
  onPlayerDataUpdate: () => void
}

interface LogEntry {
  id: number
  message: string
  type: 'success' | 'info' | 'error' | 'level'
}

export default function GameView({ locationData, playerData, onPlayerDataUpdate }: GameViewProps) {
  const [currentAction, setCurrentAction] = useState<string | null>(null)
  const [activeNodeId, setActiveNodeId] = useState<number | null>(null)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [timerMax, setTimerMax] = useState(0)
  const [log, setLog] = useState<LogEntry[]>([])
  const [botCheckPending, setBotCheckPending] = useState(false)
  const [botCheckAnswer, setBotCheckAnswer] = useState('')
  const [botCheckQuestion, setBotCheckQuestion] = useState({ a: 0, b: 0 })
  const logIdRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    logIdRef.current += 1
    setLog(prev => [...prev.slice(-20), { id: logIdRef.current, message, type }])
  }

  // Listen for Socket.io events
  useEffect(() => {
    const socket = getSocket()
    if (!socket) return

    socket.on('action_complete', (data: { result: ActionResult; timerSeconds: number; nextCompletes: string }) => {
      if (data.result?.itemName) {
        addLog(`You received 1 ${data.result.itemName}. (+${data.result.xpAwarded} XP)`, 'success')
      }
      onPlayerDataUpdate()

      // Reset timer
      if (data.timerSeconds) {
        setTimerSeconds(data.timerSeconds)
        setTimerMax(data.timerSeconds)
        startCountdown(data.timerSeconds)
      }
    })

    socket.on('bot_check_required', () => {
      // Generate a simple math question
      const a = Math.floor(Math.random() * 20) + 1
      const b = Math.floor(Math.random() * 20) + 1
      setBotCheckQuestion({ a, b })
      setBotCheckPending(true)
      addLog('Bot check required! Please answer the question to continue.', 'error')
      if (timerRef.current) clearInterval(timerRef.current)
    })

    return () => {
      socket.off('action_complete')
      socket.off('bot_check_required')
    }
  }, [onPlayerDataUpdate])

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

  const startAction = async (node: Node) => {
    if (currentAction) return

    try {
      const res = await apiFetch<{ timerSeconds: number; completesAt: string }>(
        '/api/actions/woodcutting/start',
        {
          method: 'POST',
          body: JSON.stringify({ nodeId: node.id }),
        }
      )

      setCurrentAction('woodcutting')
      setActiveNodeId(node.id)
      setTimerMax(res.timerSeconds)
      startCountdown(res.timerSeconds)
      addLog(`You begin chopping a ${node.name}.`, 'info')

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
      if (timerRef.current) clearInterval(timerRef.current)
      addLog('You stop what you are doing.', 'info')
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

  const woodcuttingNodes = locationData?.nodes.filter(n => n.skill === 'woodcutting') || []
  const locationName = locationData?.location?.name || 'Unknown'
  const locationDesc = locationData?.location?.description || ''
  const connections = locationData?.connections || []

  const timerPercent = timerMax > 0 ? (timerSeconds / timerMax) * 100 : 0

  return (
    <div className="game-view panel">
      <div className="game-view-location-bar">
        <span className="game-view-location gold-text">{locationName}</span>
        <div className="game-view-actions">
          {woodcuttingNodes.map(node => (
            <button
              key={node.id}
              className={`btn ${activeNodeId === node.id ? 'btn-gold' : ''}`}
              onClick={() => currentAction ? stopAction() : startAction(node)}
            >
              {activeNodeId === node.id ? 'Stop Chopping' : `Chop ${node.name}`}
            </button>
          ))}
          {connections.map(conn => (
            <button key={conn.id} className="btn">
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

        {locationDesc && (
          <p className="location-description">{locationDesc}</p>
        )}

        {currentAction && !botCheckPending && (
          <div className="game-view-action-log">
            <div className="action-timer">
              <div className="action-timer-bar">
                <div
                  className="action-timer-fill"
                  style={{ width: `${timerPercent}%`, transition: 'width 1s linear' }}
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
              <button className="btn btn-gold" onClick={handleBotCheck}>
                Confirm
              </button>
            </div>
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
    </div>
  )
}