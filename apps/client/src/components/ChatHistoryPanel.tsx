import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { formatGameTime } from '../lib/time'
import ChatMessageLine, { type ChatMessage } from './ChatMessageLine'
import './ChatHistory.css'

// Everything said in the last two days, rendered exactly as the chat box renders
// it — the line component is shared, not copied.
//
// Exists because the live box caps at 200 messages, so on a busy day chat scrolls
// out of reach well inside the window players are meant to be able to read.

const CHANNELS = [
    { key: 'world', label: 'World' },
    { key: 'region', label: 'Region' },
    { key: 'guild', label: 'Guild' },
    { key: 'trade', label: 'Trade' },
    { key: 'help', label: 'Help' },
    { key: 'whisper', label: 'Whispers' },
]

interface HistoryRow {
    id: number
    channel: string
    player_name: string
    guild_tag: string | null
    message: string
    sent_at: string
}

function toMessage(row: HistoryRow): ChatMessage {
    const when = new Date(row.sent_at)
    return {
        id: row.id,
        channel: row.channel,
        playerName: row.player_name,
        guildTag: row.guild_tag,
        message: row.message,
        timestamp: formatGameTime(when),
        rawTimestamp: when.getTime(),
    }
}

/** Day heading, so two days of chat don't read as one long stream. */
function dayLabel(ts: number): string {
    const d = new Date(ts)
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(today.getDate() - 1)

    const sameDay = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate()

    if (sameDay(d, today)) return 'Today'
    if (sameDay(d, yesterday)) return 'Yesterday'
    return d.toLocaleDateString()
}

interface ChatHistoryPanelProps {
    onClose: () => void
    onOpenForum?: (threadId: number) => void
    initialChannel?: string
}

export default function ChatHistoryPanel({
    onClose, onOpenForum, initialChannel = 'world',
}: ChatHistoryPanelProps) {
    const [channel, setChannel] = useState(initialChannel)
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [hasMore, setHasMore] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async (ch: string, before?: number) => {
        setLoading(true)
        setError(null)

        try {
            const qs = new URLSearchParams({ channel: ch })
            if (before) qs.set('before', new Date(before).toISOString())

            const d = await apiFetch<{ messages: HistoryRow[]; hasMore: boolean }>(
                `/api/chat/archive?${qs.toString()}`,
            )

            const page = d.messages.map(toMessage)
            // Older pages prepend; the first load replaces.
            setMessages(prev => (before ? [...page, ...prev] : page))
            setHasMore(d.hasMore)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not read the history.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load(channel) }, [channel, load])

    return (
        <div className="chat-history-overlay" onClick={onClose}>
            <div className="chat-history-modal" onClick={e => e.stopPropagation()}>
                <div className="chat-history-header">
                    <h2 className="gold-text">Chat History</h2>
                    <span className="muted-text chat-history-window">Today and yesterday</span>
                    <button className="chat-history-close" onClick={onClose}>✕</button>
                </div>

                <div className="chat-history-tabs">
                    {CHANNELS.map(c => (
                        <button
                            key={c.key}
                            className={`chat-history-tab ${channel === c.key ? 'active' : ''}`}
                            onClick={() => setChannel(c.key)}
                        >
                            {c.label}
                        </button>
                    ))}
                </div>

                <div className="chat-history-body">
                    {error && <p className="guild-error">{error}</p>}

                    {hasMore && (
                        <button
                            className="btn chat-history-more"
                            onClick={() => load(channel, messages[0]?.rawTimestamp)}
                            disabled={loading}
                        >
                            {loading ? 'Loading…' : 'Load earlier messages'}
                        </button>
                    )}

                    {!loading && messages.length === 0 && !error && (
                        <p className="muted-text">Nothing said here in the last two days.</p>
                    )}

                    {messages.map((msg, i) => {
                        const prev = messages[i - 1]
                        const newDay = !prev || dayLabel(prev.rawTimestamp) !== dayLabel(msg.rawTimestamp)

                        return (
                            <div key={`${msg.id}-${i}`}>
                                {newDay && (
                                    <p className="chat-history-day">{dayLabel(msg.rawTimestamp)}</p>
                                )}
                                <ChatMessageLine msg={msg} onOpenForum={onOpenForum} />
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
