import { useState, useEffect } from 'react'
import { formatGameDateTime } from '../lib/time'
import { apiFetch } from '../lib/api'
import './MessagesPanel.css'
import ConfirmModal from './ConfirmModal'
import { useIsMobile } from '../lib/useIsMobile'
import { useDockableWindow } from '../lib/useDockableWindow'
import DockableWindow from './DockableWindow'

interface MessageSummary {
    id: number
    sender_name: string
    subject: string
    is_read: boolean
    is_system: boolean
    sent_at: string
    reply_to_id: number | null
}

interface MessageFull extends MessageSummary {
    body: string
}

interface MessagesPanelProps {
    onClose: () => void
    onUnreadChange: (count: number) => void
    closing?: boolean
}

export default function MessagesPanel({ onClose, onUnreadChange, closing }: MessagesPanelProps) {
    const [messages, setMessages] = useState<MessageSummary[]>([])
    const [selected, setSelected] = useState<MessageFull | null>(null)
    const [view, setView] = useState<'inbox' | 'compose' | 'read'>('inbox')
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null)
    const [tab, setTab] = useState<'inbox' | 'sent'>('inbox')
    const [sentMessages, setSentMessages] = useState<any[]>([])

    // Compose form
    const [composeTo, setComposeTo] = useState('')
    const [composeSubject, setComposeSubject] = useState('')
    const [composeBody, setComposeBody] = useState('')
    const [replyToId, setReplyToId] = useState<number | null>(null)

    const isMobile = useIsMobile()
    const dock = useDockableWindow('messages')

    useEffect(() => {
        loadInbox()
    }, [])

    const loadInbox = async () => {
        try {
            const data = await apiFetch<{ messages: MessageSummary[]; unreadCount: number }>('/api/messages/inbox')
            setMessages(data.messages)
            onUnreadChange(data.unreadCount)
        } catch (err) {
            console.error('Failed to load inbox:', err)
        }
    }

    const loadSent = async () => {
        try {
            const data = await apiFetch<{ messages: any[] }>('/api/messages/sent')
            setSentMessages(data.messages)
        } catch (err) {
            console.error('Failed to load sent:', err)
        }
    }

    const openMessage = async (msg: MessageSummary) => {
        try {
            const data = await apiFetch<{ message: MessageFull }>(`/api/messages/${msg.id}`)
            setSelected(data.message)
            setView('read')
            // Update read status locally
            setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_read: true } : m))
            onUnreadChange(messages.filter(m => !m.is_read && m.id !== msg.id).length)
        } catch (err) {
            setError('Failed to load message.')
        }
    }

    const handleSend = async () => {
        setError(null)
        try {
            await apiFetch('/api/messages/send', {
                method: 'POST',
                body: JSON.stringify({
                    recipientName: composeTo,
                    subject: composeSubject,
                    body: composeBody,
                    replyToId,
                }),
            })
            setSuccess('Message sent!')
            setComposeTo('')
            setComposeSubject('')
            setComposeBody('')
            setReplyToId(null)
            setView('inbox')
            await loadInbox()
        } catch (err: any) {
            setError(err.message)
        }
    }

    const handleReply = () => {
        if (!selected) return
        setComposeTo(selected.sender_name)
        setComposeSubject(`Re: ${selected.subject}`)
        setComposeBody('')
        setReplyToId(selected.id)
        setView('compose')
    }

    const handleDelete = async (ids: number[]) => {
        const confirmMsg = ids.length > 1
            ? `Delete ${ids.length} messages?`
            : 'Delete this message?'

        setConfirmDialog({
            message: confirmMsg,
            onConfirm: async () => {
                setConfirmDialog(null)
                try {
                    await apiFetch('/api/messages/delete', {
                        method: 'DELETE',
                        body: JSON.stringify({ messageIds: ids }),
                    })
                    setMessages(prev => prev.filter(m => !ids.includes(m.id)))
                    setSelectedIds(new Set())
                    if (selected && ids.includes(selected.id)) {
                        setSelected(null)
                        setView('inbox')
                    }
                    onUnreadChange(messages.filter(m => !m.is_read && !ids.includes(m.id)).length)
                } catch (err) {
                    setError('Failed to delete messages.')
                }
            }
        })
    }

    const toggleSelect = (id: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const formatDate = (dateStr: string) => formatGameDateTime(new Date(dateStr))

    return (
        <DockableWindow
            dock={dock}
            enabled={!isMobile}
            onClose={onClose}
            className={`messages-panel ${closing ? 'closing' : ''}`}
            dragHandleClassName="messages-header"
        >            <div className="messages-header">
                <h3 className="gold-text">Messages</h3>
                <div className="messages-header-actions">
                    <button className="btn" onClick={() => { setView('compose'); setReplyToId(null); setComposeTo(''); setComposeSubject(''); setComposeBody('') }}>
                        + Compose
                    </button>
                    {!isMobile && (
                        <>
                            <button className="dock-btn" onClick={dock.togglePop} title={dock.isPopped ? 'Dock panel' : 'Pop out'}>
                                {dock.isPopped ? '⤡' : '⤢'}
                            </button>
                            {dock.isPopped && (
                                <button className={`dock-btn ${dock.isPinned ? 'active' : ''}`} onClick={dock.togglePin} title={dock.isPinned ? 'Unpin (click-away closes)' : 'Pin on top'}>📌</button>
                            )}
                        </>
                    )}
                    <button className="modal-close-btn" onClick={onClose}>✕</button>
                </div>
            </div>

            {error && <p className="guild-error">{error}</p>}
            {success && <p className="guild-success">{success}</p>}

            <div className="messages-body">
                {/* Inbox list */}
                <div className="messages-list">
                    <div className="messages-list-header">
                        <div className="messages-tabs">
                            <button
                                className={`messages-tab ${tab === 'inbox' ? 'active' : ''}`}
                                onClick={() => { setTab('inbox'); loadInbox() }}
                            >
                                Inbox
                            </button>
                            <button
                                className={`messages-tab ${tab === 'sent' ? 'active' : ''}`}
                                onClick={() => { setTab('sent'); loadSent() }}
                            >
                                Sent
                            </button>
                        </div>
                        {selectedIds.size > 0 && (
                            <button className="btn btn-red" style={{ fontSize: '11px' }} onClick={() => handleDelete([...selectedIds])}>
                                Delete ({selectedIds.size})
                            </button>
                        )}
                    </div>

                    {(tab === 'inbox' ? messages : sentMessages).length === 0 ? (
                        <p className="muted-text" style={{ padding: '8px', fontSize: '13px' }}>No messages.</p>
                    ) : (
                        (tab === 'inbox' ? messages : sentMessages).map(msg => (
                            <div
                                key={msg.id}
                                className={`message-item ${!msg.is_read ? 'unread' : ''} ${selected?.id === msg.id ? 'active' : ''}`}
                                onClick={() => openMessage(msg)}
                            >
                                {tab === 'inbox' && (
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(msg.id)}
                                        onChange={e => { e.stopPropagation(); toggleSelect(msg.id) }}
                                        onClick={e => e.stopPropagation()}
                                        className="message-checkbox"
                                    />
                                )}
                                <div className="message-item-info">
                                    <span className={`message-sender ${msg.is_system ? 'system' : ''}`}>
                                        {tab === 'sent' ? `To: ${msg.recipient_name}` : (msg.is_system ? '📜 Talaran' : msg.sender_name)}
                                    </span>
                                    <span className="message-subject">{msg.subject}</span>
                                    <span className="message-date muted-text">{formatDate(msg.sent_at)}</span>
                                </div>
                                {tab === 'inbox' && !msg.is_read && <div className="message-unread-dot" />}
                            </div>
                        ))
                    )}
                </div>

                {/* Message content / compose */}
                <div className="messages-content">
                    {view === 'inbox' && !selected && (
                        <p className="muted-text" style={{ padding: '16px', textAlign: 'center', fontStyle: 'italic' }}>
                            Select a message to read it.
                        </p>
                    )}

                    {view === 'read' && selected && (
                        <div className="message-read">
                            <div className="message-read-header">
                                <h4 className="gold-text">{selected.subject}</h4>
                                <p className="muted-text" style={{ fontSize: '12px' }}>
                                    From: {selected.sender_name} · {formatDate(selected.sent_at)}
                                </p>
                            </div>
                            <div className="message-read-body">
                                {selected.body}
                            </div>
                            <div className="message-read-actions">
                                {!selected.is_system && tab === 'inbox' && (
                                    <button className="btn btn-gold" onClick={handleReply}>Reply</button>
                                )}
                                {tab === 'inbox' && (
                                    <button className="btn btn-red" onClick={() => handleDelete([selected.id])}>Delete</button>
                                )}
                            </div>
                        </div>
                    )}

                    {view === 'compose' && (
                        <div className="message-compose">
                            <h4 className="gold-text">{replyToId ? 'Reply' : 'New Message'}</h4>
                            <div className="compose-field">
                                <label className="muted-text">To</label>
                                <input
                                    className="chat-input"
                                    type="text"
                                    value={composeTo}
                                    onChange={e => setComposeTo(e.target.value)}
                                    placeholder="Player name..."
                                    disabled={!!replyToId}
                                />
                            </div>
                            <div className="compose-field">
                                <label className="muted-text">Subject</label>
                                <input
                                    className="chat-input"
                                    type="text"
                                    value={composeSubject}
                                    onChange={e => setComposeSubject(e.target.value)}
                                    placeholder="(No Subject)"
                                />
                            </div>
                            <div className="compose-field">
                                <label className="muted-text">Message</label>
                                <textarea
                                    className="chat-input"
                                    value={composeBody}
                                    onChange={e => setComposeBody(e.target.value)}
                                    placeholder="Write your message..."
                                    rows={6}
                                    style={{ width: '100%', resize: 'vertical' }}
                                />
                            </div>
                            <div className="guild-actions">
                                <button className="btn btn-gold" onClick={handleSend}>Send</button>
                                <button className="btn" onClick={() => setView(selected ? 'read' : 'inbox')}>Cancel</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {confirmDialog && (
                <ConfirmModal
                    message={confirmDialog.message}
                    onConfirm={confirmDialog.onConfirm}
                    onCancel={() => setConfirmDialog(null)}
                />
            )}
        </DockableWindow>
    )
}