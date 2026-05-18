import { useState, useEffect, useRef } from 'react'
import { apiFetch } from '../lib/api'
import { getSocket } from '../lib/socket'
import './ChatPanel.css'

interface ChatMessage {
  id: number
  channel: string
  playerName: string
  guildTag: string | null
  message: string
  timestamp: string
  isWhisper?: boolean
  whisperTo?: string
}

const CHANNELS = [
  { key: 'world', label: 'World' },
  { key: 'region', label: 'Region' },
  { key: 'guild', label: 'Guild' },
  { key: 'trade', label: 'Trade' },
  { key: 'help', label: 'Help' },
]

const CHANNEL_COLORS: Record<string, string> = {
  world: '#877A6C',
  region: '#a8a8a8',
  guild: '#F74B07',
  trade: '#ae00ff',
  help: '#ECFF00',
  whisper: '#08f8d0',
}

export default function ChatPanel() {
  const [activeChannel, setActiveChannel] = useState('world')
  const [allMessages, setAllMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [allMessages])

  // Load history for all channels on mount
  useEffect(() => {
    const loadAll = async () => {
      const all: ChatMessage[] = []
      for (const { key } of CHANNELS) {
        try {
          const data = await apiFetch<{ messages: any[] }>(`/api/chat/history/${key}`)
          const formatted = data.messages.map(m => ({
            id: m.id,
            channel: m.channel,
            playerName: m.player_name,
            guildTag: m.guild_tag,
            message: m.message,
            timestamp: new Date(m.sent_at).toTimeString().slice(0, 5),
          }))
          all.push(...formatted)
        } catch (err) {
          console.error(`Failed to load ${key} history:`, err)
        }
      }
      // Sort all messages by timestamp
      all.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      setAllMessages(all)
    }
    loadAll()
  }, [])

  // Socket listeners
  useEffect(() => {
    const interval = setInterval(() => {
      const socket = getSocket()
      if (!socket) return
      clearInterval(interval)

      const handleMessage = (data: ChatMessage) => {
        setAllMessages(prev => [...prev.slice(-499), data])
      }

      socket.on('chat_world', handleMessage)
      socket.on('chat_region', handleMessage)
      socket.on('chat_guild', handleMessage)
      socket.on('chat_trade', handleMessage)
      socket.on('chat_help', handleMessage)

      socket.on('whisper', (data: any) => {
        const msg: ChatMessage = {
          id: Date.now(),
          channel: 'whisper',
          playerName: data.from,
          guildTag: data.guildTag,
          message: data.message,
          timestamp: data.timestamp,
          isWhisper: true,
        }
        setAllMessages(prev => [...prev.slice(-499), msg])
        setInput(`${data.from}@`)
        inputRef.current?.focus()
      })

      socket.on('whisper_sent', (data: any) => {
        const msg: ChatMessage = {
          id: Date.now() + 1,
          channel: 'whisper',
          playerName: 'You',
          guildTag: null,
          message: `→ ${data.to}: ${data.message}`,
          timestamp: data.timestamp,
          isWhisper: true,
          whisperTo: data.to,
        }
        setAllMessages(prev => [...prev.slice(-499), msg])
      })

      return () => {
        socket.off('chat_world')
        socket.off('chat_region')
        socket.off('chat_guild')
        socket.off('chat_trade')
        socket.off('chat_help')
        socket.off('whisper')
        socket.off('whisper_sent')
      }
    }, 100)

    return () => clearInterval(interval)
  }, [])

  const handleSend = async () => {
    const trimmed = input.trim()
    console.log('handleSend called, input:', trimmed, 'channel:', activeChannel)
    if (!trimmed) return

    try {
      const result = await apiFetch('/api/chat/send', {
        method: 'POST',
        body: JSON.stringify({ channel: activeChannel, message: trimmed }),
      })
      console.log('Chat send result:', result)
      setInput('')
    } catch (err: any) {
      console.error('Chat send error:', err.message)
    }
  }

  const handlePlayerClick = (playerName: string) => {
    setInput(`${playerName}@`)
    inputRef.current?.focus()
  }

  const channelLabel = (channel: string) => {
    const found = CHANNELS.find(c => c.key === channel)
    return found ? found.label : channel
  }

  const CHANNEL_SHORT: Record<string, string> = {
    world: 'W',
    region: 'R',
    guild: 'G',
    trade: 'T',
    help: 'H',
    whisper: 'w',
  }

  return (
    <div className="chat-panel panel">
      <div className="chat-tabs">
        {CHANNELS.map(({ key, label }) => (
          <button
            key={key}
            className={`chat-tab ${activeChannel === key ? 'active' : ''}`}
            onClick={() => setActiveChannel(key)}
          >
            {label}
          </button>
        ))}
        <span className="chat-sending-to muted-text">
          Sending to: <span style={{ color: CHANNEL_COLORS[activeChannel] }}>{channelLabel(activeChannel)}</span>
        </span>
      </div>

      <div className="chat-messages">
        {allMessages.length === 0 ? (
          <p className="chat-empty muted-text">Welcome to Talaran, adventurer. The world awaits.</p>
        ) : (
          allMessages.map((msg, i) => (
            <div key={`${msg.id}-${i}`} className="chat-message">
              <span className="chat-timestamp muted-text">{msg.timestamp}</span>
              {' '}
              <span className="chat-channel-tag" style={{ color: CHANNEL_COLORS[msg.channel] }}>
                [{CHANNEL_SHORT[msg.channel] || msg.channel}]
              </span>
              {' '}
              <span
                className="chat-player gold-text"
                onClick={() => handlePlayerClick(msg.playerName)}
                style={{ cursor: 'pointer' }}
              >
                {msg.playerName}
                {msg.guildTag && <span className="chat-guild-tag">[{msg.guildTag}]</span>}
              </span>
              <span className="chat-colon muted-text">: </span>
              <span className="chat-text" style={{ color: CHANNEL_COLORS[msg.channel] }}>
                {msg.message}
              </span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-row">
        <input
          ref={inputRef}
          className="chat-input"
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={`[${channelLabel(activeChannel)}] Type a message...`}
          maxLength={500}
        />
        <button className="btn chat-send-btn" onClick={handleSend}>Send</button>
      </div>
    </div>
  )
}