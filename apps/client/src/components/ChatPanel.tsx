import { useState, useEffect, useRef } from 'react'
import { apiFetch } from '../lib/api'
import { getSocket } from '../lib/socket'
import { formatGameTime } from '../lib/time'
import './ChatPanel.css'

interface ChatMessage {
  id: number
  channel: string
  playerName: string
  guildTag: string | null
  message: string
  timestamp: string      // display format HH:MM
  rawTimestamp: number   // unix ms for sorting
  isWhisper?: boolean
  whisperTo?: string
}

interface ChatPanelProps {
  onOpenForum?: (threadId: number) => void
  draft?: string | null
  onDraftConsumed?: () => void
}

const CHANNELS = [
  { key: 'world', label: 'World' },
  { key: 'region', label: 'Region' },
  { key: 'guild', label: 'Guild' },
  { key: 'trade', label: 'Trade' },
  { key: 'help', label: 'Help' },
]

// Channels we load/persist history for but that aren't selectable send-tabs.
const HISTORY_CHANNELS = [...CHANNELS.map(c => c.key), 'whisper', 'server']

const CHANNEL_COLORS: Record<string, string> = {
  world: '#ffb96f',
  region: '#a8a8a8',
  guild: '#F74B07',
  trade: '#ae00ff',
  help: '#ECFF00',
  whisper: '#08f8d0',
  server: '#ff4444',
  forum: '#4a9eff',
}

const CHANNEL_SHORT: Record<string, string> = {
  world: 'W',
  region: 'R',
  guild: 'G',
  trade: 'T',
  help: 'H',
  whisper: 'w',
  server: 'S',
}

function formatTime(date: Date): string {
  return formatGameTime(date)
}

// Renders chat text, turning [[FORUMLINK|id|label]] tokens into clickable forum links.
function renderMessageText(text: string, onOpenForum?: (threadId: number) => void) {
  const nodes: any[] = []
  const regex = /\[\[FORUMLINK\|(\d+)\|(.*?)\]\]/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))
    const threadId = parseInt(match[1])
    nodes.push(
      <span
        key={`fl-${key++}`}
        className="chat-forum-link"
        style={{ color: CHANNEL_COLORS.forum, cursor: 'pointer', textDecoration: 'underline' }}
        onClick={() => onOpenForum?.(threadId)}
      >
        {match[2]}
      </span>
    )
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}

export default function ChatPanel({ onOpenForum, draft, onDraftConsumed }: ChatPanelProps) {
  const [activeChannel, setActiveChannel] = useState('world')
  const [allMessages, setAllMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [mutedChannels, setMutedChannels] = useState<string[]>([])

  // Only scroll to bottom for new live messages, not history
  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
  }

  // Scroll to bottom once history is loaded
  useEffect(() => {
    if (historyLoaded) {
      scrollToBottom(false)
    }
  }, [historyLoaded])

  // Scroll to bottom on new live messages only (after history loaded)
  const isLiveMessage = useRef(false)
  useEffect(() => {
    if (historyLoaded && isLiveMessage.current) {
      scrollToBottom(true)
      isLiveMessage.current = false
    }
  }, [allMessages, historyLoaded])

  // Add message helper — deduplicates by id, keeps sorted by rawTimestamp
  const addMessages = (newMsgs: ChatMessage[], isLive = false) => {
    if (isLive) isLiveMessage.current = true
    setAllMessages(prev => {
      const existingIds = new Set(prev.map(m => m.id))
      const unique = newMsgs.filter(m => !existingIds.has(m.id))
      if (unique.length === 0) return prev
      const combined = [...prev, ...unique]
      combined.sort((a, b) => a.rawTimestamp - b.rawTimestamp)
      return combined.slice(-500)
    })
  }

  // Load settings
  useEffect(() => {
    apiFetch<{ mutedChannels: string[] }>('/api/settings')
      .then(data => setMutedChannels(data.mutedChannels || []))
      .catch(() => { })
  }, [])

  // Forum notification listener
  useEffect(() => {
    const handleForumNotification = (e: any) => {
      const data = e.detail
      const now = Date.now()
      const forumMessage: ChatMessage = {
        id: now,
        channel: 'world',
        playerName: '📋',
        guildTag: null,
        message: `__FORUM__${data.threadId}__${data.authorName} posted "${data.title}" in ${data.categoryName}`,
        timestamp: formatTime(new Date(data.createdAt)),
        rawTimestamp: new Date(data.createdAt).getTime(),
        isWhisper: false,
      }
      addMessages([forumMessage], true)
    }

    window.addEventListener('forum_notification', handleForumNotification)
    return () => window.removeEventListener('forum_notification', handleForumNotification)
  }, [])

  // Load history for all channels on mount
  useEffect(() => {
    const loadAll = async () => {
      const all: ChatMessage[] = []
      for (const key of HISTORY_CHANNELS) {
        try {
          const data = await apiFetch<{ messages: any[] }>(`/api/chat/history/${key}`)
          const formatted = data.messages.map(m => ({
            id: m.id,
            channel: m.channel,
            playerName: m.player_name,
            guildTag: m.guild_tag,
            message: m.message,
            timestamp: formatTime(new Date(m.sent_at)),
            rawTimestamp: new Date(m.sent_at).getTime(),
            isWhisper: m.channel === 'whisper',
          }))
          console.log('History loaded for', key, ':', formatted.length, 'messages')
          all.push(...formatted)
        } catch (err) {
          console.error(`Failed to load ${key} history:`, err)
        }
      }
      all.sort((a, b) => a.rawTimestamp - b.rawTimestamp)
      // Deduplicate by id
      const seen = new Set<number>()
      const unique = all.filter(m => {
        if (seen.has(m.id)) return false
        seen.add(m.id)
        return true
      })
      setAllMessages(unique.slice(-500))
      setHistoryLoaded(true)
    }
    loadAll()
  }, [])

  useEffect(() => {
    if (draft) {
      setInput(draft)
      onDraftConsumed?.()
    }
  }, [draft])

  // Socket listeners
  useEffect(() => {
    const interval = setInterval(() => {
      const socket = getSocket()
      if (!socket) return
      clearInterval(interval)

      const handleMessage = (data: any) => {
        const msg: ChatMessage = {
          id: data.id || Date.now(),
          channel: data.channel,
          playerName: data.playerName || data.player_name,
          guildTag: data.guildTag || data.guild_tag || null,
          message: data.message,
          timestamp: formatTime(data.sentAt ? new Date(data.sentAt) : new Date()),
          rawTimestamp: data.sentAt ? new Date(data.sentAt).getTime() : Date.now(),
        }
        addMessages([msg], true)
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
          timestamp: formatTime(data.sentAt ? new Date(data.sentAt) : new Date()),
          rawTimestamp: data.sentAt ? new Date(data.sentAt).getTime() : Date.now(),
          isWhisper: true,
        }
        addMessages([msg], true)
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
          timestamp: formatTime(data.sentAt ? new Date(data.sentAt) : new Date()),
          rawTimestamp: data.sentAt ? new Date(data.sentAt).getTime() : Date.now(),
          isWhisper: true,
          whisperTo: data.to,
        }
        addMessages([msg], true)
      })

      socket.on('chat_muted', (data: { message: string }) => {
        const msg: ChatMessage = {
          id: Date.now(),
          channel: 'server',
          playerName: '[SERVER]',
          guildTag: null,
          message: data.message,
          timestamp: formatTime(new Date()),
          rawTimestamp: Date.now(),
        }
        addMessages([msg], true)
      })

      socket.on('chat_warning', (data: { message: string }) => {
        const msg: ChatMessage = {
          id: Date.now(),
          channel: 'server',
          playerName: '[SERVER]',
          guildTag: null,
          message: data.message,
          timestamp: formatTime(new Date()),
          rawTimestamp: Date.now(),
        }
        addMessages([msg], true)
      })

      return () => {
        socket.off('chat_world')
        socket.off('chat_region')
        socket.off('chat_guild')
        socket.off('chat_trade')
        socket.off('chat_help')
        socket.off('whisper')
        socket.off('whisper_sent')
        socket.off('chat_muted')
        socket.off('chat_warning')
      }
    }, 100)

    return () => clearInterval(interval)
  }, [])

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed) return

    try {
      await apiFetch('/api/chat/send', {
        method: 'POST',
        body: JSON.stringify({ channel: activeChannel, message: trimmed }),
      })
      setInput('')
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: Date.now(),
        channel: 'server',
        playerName: '[SERVER]',
        guildTag: null,
        message: err.message || 'Could not send message.',
        timestamp: formatTime(new Date()),
        rawTimestamp: Date.now(),
      }
      addMessages([errorMsg], true)
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

  const visibleMessages = allMessages.filter(msg => !mutedChannels.includes(msg.channel))

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
        {visibleMessages.length === 0 ? (
          <p className="chat-empty muted-text">Welcome to Talaran, adventurer. The world awaits.</p>
        ) : (
          visibleMessages.map((msg, i) => {
            const isForumNotification = msg.message.startsWith('__FORUM__')

            if (isForumNotification) {
              const parts = msg.message.split('__')
              const threadId = parseInt(parts[2])
              const displayText = parts[3]

              return (
                <div key={`${msg.id}-${i}`} className="chat-message">
                  <span className="chat-timestamp muted-text">{msg.timestamp}</span>
                  {' '}
                  <span className="chat-channel-tag" style={{ color: CHANNEL_COLORS['forum'] }}>
                    [F]
                  </span>
                  {' '}
                  <span
                    className="chat-text chat-forum-link"
                    style={{ color: CHANNEL_COLORS['forum'], cursor: 'pointer' }}
                    onClick={() => onOpenForum?.(threadId)}
                  >
                    {displayText}
                  </span>
                </div>
              )
            }

            return (
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
                  {msg.playerName.split('_').map((part, i, arr) => (
                    <span key={i}>
                      {part}
                      {i < arr.length - 1 && (
                        <span style={{ fontFamily: 'Tahoma, sans-serif' }}>_</span>
                      )}
                    </span>
                  ))}
                  {msg.guildTag && <span className="chat-guild-tag">[{msg.guildTag}]</span>}
                </span>
                <span className="chat-colon muted-text">: </span>
                <span className="chat-text" style={{ color: CHANNEL_COLORS[msg.channel] }}>
                  {renderMessageText(msg.message, onOpenForum)}
                </span>
              </div>
            )
          })
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