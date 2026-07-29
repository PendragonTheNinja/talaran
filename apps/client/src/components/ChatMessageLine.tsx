// One rendered line of chat.
//
// Extracted from ChatPanel so the history view renders identically by
// construction rather than by a copy that drifts. Anything about how a message
// LOOKS belongs here; anything about fetching, sending, or channel state stays in
// the panels.

export interface ChatMessage {
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

export const CHANNEL_COLORS: Record<string, string> = {
    world: '#ffb96f',
    region: '#a8a8a8',
    guild: '#F74B07',
    trade: '#ae00ff',
    help: '#ECFF00',
    whisper: '#08f8d0',
    server: '#ff4444',
    forum: '#4a9eff',
}

export const CHANNEL_SHORT: Record<string, string> = {
    world: 'W',
    region: 'R',
    guild: 'G',
    trade: 'T',
    help: 'H',
    whisper: 'w',
    server: 'S',
}

/** Turns [[FORUMLINK|id|label]] markers into clickable spans. */
export function renderMessageText(text: string, onOpenForum?: (threadId: number) => void) {
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
            </span>,
        )
        lastIndex = regex.lastIndex
    }

    if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
    return nodes
}

interface ChatMessageLineProps {
    msg: ChatMessage
    onOpenForum?: (threadId: number) => void
    /** Omitted in history, where there is no input box to type a reply into. */
    onPlayerClick?: (playerName: string) => void
}

export default function ChatMessageLine({ msg, onOpenForum, onPlayerClick }: ChatMessageLineProps) {
    // Forum notifications are encoded into the message text rather than carried
    // as a separate type, so they are detected the same way in both views.
    if (msg.message.startsWith('__FORUM__')) {
        const parts = msg.message.split('__')
        const threadId = parseInt(parts[2])
        const displayText = parts[3]

        return (
            <div className="chat-message">
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
        <div className="chat-message">
            <span className="chat-timestamp muted-text">{msg.timestamp}</span>
            {' '}
            <span className="chat-channel-tag" style={{ color: CHANNEL_COLORS[msg.channel] }}>
                [{CHANNEL_SHORT[msg.channel] || msg.channel}]
            </span>
            {' '}
            <span
                className="chat-player gold-text"
                onClick={() => onPlayerClick?.(msg.playerName)}
                style={{ cursor: onPlayerClick ? 'pointer' : 'default' }}
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
}
