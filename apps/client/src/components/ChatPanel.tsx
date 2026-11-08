import { useState, useEffect, useRef } from 'react'
import { apiFetch } from '../lib/api'
import { getSocket, SOCKET_RESYNC_EVENT } from '../lib/socket'
import { formatGameTime } from '../lib/time'
import './ChatPanel.css'
import ChatMessageLine, { CHANNEL_COLORS, CHANNEL_SHORT, renderMessageText, type ChatMessage } from './ChatMessageLine'
import ChatHistoryPanel from './ChatHistoryPanel'

interface ChatPanelProps {
  onOpenForum?: (threadId: number) => void
  draft?: string | null
  onDraftConsumed?: () => void

  /** Guests only get Help, so the other tabs are not shown at all. */
  isGuest?: boolean

  /** The player's own name, so their own lines never count as unseen. */
  selfName?: string
}

/**
 * Fired for every live message the player would see (not muted, not their
 * own), with how many arrived. The phone layout counts them on the Chat tab
 * while the player is looking elsewhere (MobileShell.tsx).
 */
export const CHAT_UNSEEN_EVENT = 'talaran:chat-unseen'

/** Fired by the phone layout when the Chat tab is opened, to jump to the newest line. */
export const CHAT_SHOWN_EVENT = 'talaran:chat-shown'

const CHANNELS = [
  { key: 'world', label: 'World' },
  { key: 'region', label: 'Region' },
  { key: 'guild', label: 'Guild' },
  { key: 'trade', label: 'Trade' },
  { key: 'help', label: 'Help' },
]

// Channels we load/persist history for but that aren't selectable send-tabs.
const HISTORY_CHANNELS = [...CHANNELS.map(c => c.key), 'whisper', 'server']

function formatTime(date: Date): string {
  return formatGameTime(date)
}

// Renders chat text, turning [[FORUMLINK|id|label]] tokens into clickable forum links.
export default function ChatPanel({ onOpenForum, draft, onDraftConsumed, isGuest, selfName }: ChatPanelProps) {
  // Guests see Help and nothing else. Showing tabs that reject every message
  // is worse than not showing them: it advertises a restriction instead of
  // just presenting the one channel that works.
  const channels = isGuest ? CHANNELS.filter(c => c.key === 'help') : CHANNELS
  const historyChannels = isGuest ? ['help'] : HISTORY_CHANNELS
  const [activeChannel, setActiveChannel] = useState(isGuest ? 'help' : 'world')
  const [allMessages, setAllMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [resetAt, setResetAt] = useState<number | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [mutedChannels, setMutedChannels] = useState<string[]>([])
  // Read by the socket handlers, which are bound once on mount and would
  // otherwise only ever see the first render's values.
  const mutedRef = useRef<string[]>([])
  const selfRef = useRef(selfName)
  useEffect(() => { mutedRef.current = mutedChannels }, [mutedChannels])
  useEffect(() => { selfRef.current = selfName }, [selfName])

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
    if (isLive) {
      isLiveMessage.current = true
      const seen = newMsgs.filter(m =>
        !mutedRef.current.includes(m.channel)
        && m.playerName !== 'You'
        && m.playerName !== selfRef.current).length
      if (seen > 0) window.dispatchEvent(new CustomEvent(CHAT_UNSEEN_EVENT, { detail: { count: seen } }))
    }
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

  // The phone layout keeps this panel mounted but hidden while another tab is
  // open, and a hidden list cannot scroll. Jump to the newest line on showing.
  useEffect(() => {
    const onShown = () => requestAnimationFrame(() => scrollToBottom(false))
    window.addEventListener(CHAT_SHOWN_EVENT, onShown)
    return () => window.removeEventListener(CHAT_SHOWN_EVENT, onShown)
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
      for (const key of historyChannels) {
        try {
          const data = await apiFetch<{ messages: any[]; resetAt?: string }>(`/api/chat/history/${key}`)
          if (data.resetAt) setResetAt(new Date(data.resetAt).getTime())
          const formatted = data.messages.map(m => ({
            id: m.id,
            channel: m.channel,
            playerName: m.player_name,
            guildTag: m.guild_tag,
            // Joined in by the history query. ChatPanel rebuilds every message
            // field by field, so anything not copied here is simply lost.
            badgeKey: m.badgeKey ?? null,
            badge: m.badge ?? null,
            message: m.message,
            timestamp: formatTime(new Date(m.sent_at)),
            rawTimestamp: new Date(m.sent_at).getTime(),
            isWhisper: m.channel === 'whisper',
          }))
          all.push(...formatted)
        } catch (err) {
          console.error(`Failed to load ${key} history:`, err)
        }
      }
      // Merged with what is already showing, not swapped for it: a reload
      // after a dropped connection must not wipe lines only this page holds
      // (a notice from the server, a forum ping). Same id, same message.
      setAllMessages(prev => {
        const merged = [...prev, ...all].sort((a, b) => a.rawTimestamp - b.rawTimestamp)
        const seen = new Set<number>()
        const unique = merged.filter(m => {
          if (seen.has(m.id)) return false
          seen.add(m.id)
          return true
        })
        return unique.slice(-500)
      })
      setHistoryLoaded(true)
    }
    loadAll()
  }, [reloadKey])

  // Back from a dropped connection or a sleeping phone: reload the history so
  // whatever was said meanwhile appears (lib/socket.ts).
  useEffect(() => {
    const resync = () => setReloadKey(k => k + 1)
    window.addEventListener(SOCKET_RESYNC_EVENT, resync)
    return () => window.removeEventListener(SOCKET_RESYNC_EVENT, resync)
  }, [])

  // The chat box holds today only and clears at Eastern midnight; everything
  // said before that stays readable in the history panel. The moment comes from
  // the server, because the client cannot derive Eastern midnight from its own
  // clock without agreeing on a timezone first.
  useEffect(() => {
    if (!resetAt) return

    const wait = resetAt - Date.now()
    if (wait <= 0) {
      setAllMessages([])
      setReloadKey(k => k + 1)
      return
    }

    // +2s so the server is unambiguously into the new day when we refetch.
    const timer = setTimeout(() => {
      setAllMessages([])
      setReloadKey(k => k + 1)
    }, wait + 2000)

    return () => clearTimeout(timer)
  }, [resetAt])

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
          badgeKey: data.badgeKey ?? null,
          badge: data.badge ?? null,
          message: data.message,
          timestamp: formatTime(data.sentAt ? new Date(data.sentAt) : new Date()),
          rawTimestamp: data.sentAt ? new Date(data.sentAt).getTime() : Date.now(),
        }
        addMessages([msg], true)
      }

      socket.on('chat_world', handleMessage)
      socket.on('chat_region', handleMessage)
      socket.on('chat_guild', handleMessage)
      // Joined, left or lost a guild: the server has moved this tab's guild
      // room; reload the history so the Guild channel shows the new one.
      const handleGuildChanged = () => setReloadKey(k => k + 1)
      socket.on('guild_changed', handleGuildChanged)
      socket.on('chat_trade', handleMessage)
      socket.on('chat_help', handleMessage)

      socket.on('whisper', (data: any) => {
        const msg: ChatMessage = {
          id: Date.now(),
          channel: 'whisper',
          playerName: data.from,
          guildTag: data.guildTag,
          badgeKey: data.badgeKey ?? null,
          badge: data.badge ?? null,
          message: data.message,
          timestamp: formatTime(data.sentAt ? new Date(data.sentAt) : new Date()),
          rawTimestamp: data.sentAt ? new Date(data.sentAt).getTime() : Date.now(),
          isWhisper: true,
        }
        addMessages([msg], true)
        // Ready to reply, but only into an empty box (or one holding nothing
        // but a whisper prefix). It used to overwrite the box, so a whisper
        // arriving mid-sentence threw the sentence away.
        const typed = inputRef.current?.value ?? ''
        if (typed.trim() === '' || /^[A-Za-z0-9 _-]{1,32}@\s*$/.test(typed)) {
          setInput(`${data.from}@`)
          inputRef.current?.focus()
        }
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
        socket.off('guild_changed', handleGuildChanged)
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
      const sent = await apiFetch<{ whisperTo?: string; notice?: string | null }>('/api/chat/send', {
        method: 'POST',
        body: JSON.stringify({ channel: activeChannel, message: trimmed }),
      })
      // A whisper keeps its "Name@" so the conversation carries on without
      // retyping it. Only what was sent is cleared: anything typed while the
      // request was on its way stays.
      // The server says whether it was a whisper (names can hold spaces, and
      // only it knows whether "Old Tom" is a player).
      const next = sent?.whisperTo ? `${sent.whisperTo}@` : ''
      setInput(cur => (cur === input ? next : cur))
      // The language filter changed some words (server services/wordFilter.ts):
      // only the sender sees why.
      if (sent?.notice) {
        addMessages([{
          id: Date.now(),
          channel: 'server',
          playerName: '[SERVER]',
          guildTag: null,
          message: sent.notice,
          timestamp: formatTime(new Date()),
          rawTimestamp: Date.now(),
        }], true)
      }
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
    const found = channels.find(c => c.key === channel)
    return found ? found.label : channel
  }

  const visibleMessages = allMessages.filter(msg => !mutedChannels.includes(msg.channel))

  return (
    <div className="chat-panel panel">
      <div className="chat-tabs">
        {channels.map(({ key, label }) => (
          <button
            key={key}
            className={`chat-tab ${activeChannel === key ? 'active' : ''}`}
            onClick={() => setActiveChannel(key)}
          >
            {label}
          </button>
        ))}
        {/* The live box caps at 200 messages; this reaches the rest of the window. */}
        <button
          className="chat-history-btn"
          onClick={() => setHistoryOpen(true)}
          title="Read today and yesterday's chat"
        >
          History
        </button>
      </div>

      <div className="chat-messages">
        {visibleMessages.length === 0 ? (
          <p className="chat-empty muted-text">Welcome to Talaran, adventurer. The world awaits.</p>
        ) : (
          visibleMessages.map((msg, i) => (
            <ChatMessageLine
              key={`${msg.id}-${i}`}
              msg={msg}
              onOpenForum={onOpenForum}
              onPlayerClick={handlePlayerClick}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-row">
        {/* Chrome decides what a field is for by guessing from its name,
            placeholder and neighbours, and with none of those set it had
            decided this was a username box: it offered saved logins over the
            chat, which looks like the game is asking for a password.

            autoComplete="off" alone is ignored on fields Chrome believes it has
            identified. A value it does not recognise is not, so an unknown
            token is what actually turns the suggestions off. The name and id
            say plainly what the field is, and the remaining attributes stop
            mobile keyboards capitalising and correcting chat as though it were
            prose. */}
        <input
          ref={inputRef}
          className="chat-input"
          type="text"
          name="talaran-chat-message"
          id="talaran-chat-message"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={`[${channelLabel(activeChannel)}] Type a message...`}
          maxLength={500}
          autoComplete="new-chat-message"
          autoCorrect="off"
          autoCapitalize="sentences"
          spellCheck={false}
          data-lpignore="true"
          data-form-type="other"
        />
        <button className="btn chat-send-btn" onClick={handleSend}>Send</button>
      </div>
      {historyOpen && (
        <ChatHistoryPanel
          onClose={() => setHistoryOpen(false)}
          onOpenForum={onOpenForum}
          initialChannel={activeChannel}
        />
      )}

    </div>
  )
}