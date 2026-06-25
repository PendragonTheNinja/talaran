import { useState, useEffect } from 'react'
import { formatGameDateLong } from '../lib/time'
import { apiFetch } from '../lib/api'
import './NewsPanel.css'
import MarkdownToolbar from './MarkdownToolbar'
import MarkdownRenderer from './MarkdownRenderer'
import { useMarkdownEditor } from '../lib/useMarkdownEditor'
import { useIsMobile } from '../lib/useIsMobile'
import { useDockableWindow } from '../lib/useDockableWindow'
import DockableWindow from './DockableWindow'

interface NewsPost {
    id: number
    title: string
    body: string
    published_at: string
    author_name: string
    forum_thread_id: number | null
}

interface NewsPanelProps {
    onClose: () => void
    isAdmin: boolean
    onViewThread?: (threadId: number) => void
    closing?: boolean
}

export default function NewsPanel({ onClose, isAdmin, onViewThread, closing }: NewsPanelProps) {
    const [posts, setPosts] = useState<NewsPost[]>([])
    const [selected, setSelected] = useState<NewsPost | null>(null)
    const [view, setView] = useState<'list' | 'create'>('list')
    const [newTitle, setNewTitle] = useState('')
    const [newBody, setNewBody] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const { textareaRef: bodyTextareaRef, insertMarkdown: insertBodyMarkdown } = useMarkdownEditor(newBody, setNewBody)

    const isMobile = useIsMobile()
    const dock = useDockableWindow('news')

    useEffect(() => {
        loadNews()
    }, [])

    const loadNews = async () => {
        try {
            const data = await apiFetch<{ posts: NewsPost[] }>('/api/news/latest')
            setPosts(data.posts)
            if (data.posts.length > 0) setSelected(data.posts[0])
        } catch (err) {
            console.error('Failed to load news:', err)
        }
    }

    const handleCreate = async () => {
        setError(null)
        try {
            await apiFetch('/api/news/create', {
                method: 'POST',
                body: JSON.stringify({ title: newTitle, body: newBody }),
            })
            setSuccess('News post published!')
            setNewTitle('')
            setNewBody('')
            setView('list')
            setTimeout(() => setSuccess(null), 3000)
            await loadNews()
        } catch (err: any) {
            setError(err.message)
        }
    }

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this news post?')) return
        try {
            await apiFetch(`/api/news/${id}`, { method: 'DELETE' })
            await loadNews()
        } catch (err: any) {
            setError(err.message)
        }
    }

    const formatDate = (dateStr: string) => formatGameDateLong(new Date(dateStr))

    return (
        <DockableWindow
            dock={dock}
            enabled={!isMobile}
            onClose={onClose}
            className={`news-panel ${closing ? 'closing' : ''}`}
            dragHandleClassName="news-header"
        >
            <div className="news-header">
                <h3 className="gold-text">News & Updates</h3>
                <div className="news-header-actions">
                    {isAdmin && view === 'list' && (
                        <button className="btn btn-gold" onClick={() => setView('create')}>+ Post Update</button>
                    )}
                    {view === 'create' && (
                        <button className="btn" onClick={() => setView('list')}>← Back</button>
                    )}
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
                    <button className="modal-close-btn" onClick={onClose}>✕</button>                </div>
            </div>

            {error && <p className="guild-error" style={{ padding: '0 var(--space-lg)' }}>{error}</p>}
            {success && <p className="guild-success" style={{ padding: '0 var(--space-lg)' }}>{success}</p>}

            {view === 'list' && (
                <div className="news-body">
                    {/* Sidebar - post list */}
                    <div className="news-sidebar">
                        <p className="muted-text" style={{ fontSize: '12px', padding: '4px var(--space-sm)' }}>All Updates</p>
                        {posts.map(post => (
                            <div
                                key={post.id}
                                className={`news-sidebar-item ${selected?.id === post.id ? 'active' : ''}`}
                                onClick={() => setSelected(post)}
                            >
                                <span className="news-sidebar-title">{post.title}</span>
                                <span className="news-sidebar-date muted-text">{formatDate(post.published_at)}</span>
                            </div>
                        ))}
                    </div>

                    {/* Main content */}
                    <div className="news-content">
                        {selected ? (
                            <>
                                <div className="news-post-header">
                                    <h2 className="gold-text">{selected.title}</h2>
                                    <p className="muted-text" style={{ fontSize: '13px' }}>
                                        {formatDate(selected.published_at)} · by {selected.author_name}
                                    </p>
                                    <div className="news-post-actions">
                                        {selected.forum_thread_id && onViewThread && (
                                            <button className="btn" style={{ fontSize: '12px' }} onClick={() => onViewThread(selected.forum_thread_id!)}>
                                                💬 Discuss in Forum
                                            </button>
                                        )}
                                        {isAdmin && (
                                            <button className="btn btn-red" style={{ fontSize: '12px' }} onClick={() => handleDelete(selected.id)}>
                                                Delete
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="news-post-body">
                                    <MarkdownRenderer content={selected.body} />
                                </div>
                            </>
                        ) : (
                            <p className="muted-text" style={{ padding: '16px', fontStyle: 'italic' }}>No news yet.</p>
                        )}
                    </div>
                </div>
            )}

            {view === 'create' && (
                <div className="news-create">
                    <div className="guild-form-group">
                        <label className="muted-text">Title</label>
                        <input
                            className="chat-input"
                            type="text"
                            value={newTitle}
                            onChange={e => setNewTitle(e.target.value)}
                            placeholder="Update title..."
                            maxLength={200}
                        />
                    </div>
                    <div className="guild-form-group">
                        <label className="muted-text">Body</label>
                        <MarkdownToolbar onInsert={insertBodyMarkdown} />
                        <textarea
                            ref={bodyTextareaRef}
                            className="chat-input"
                            value={newBody}
                            onChange={e => setNewBody(e.target.value)}
                            placeholder="Write your update..."
                            rows={12}
                            style={{ width: '100%', resize: 'vertical', borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
                        />
                    </div>
                    <div className="guild-actions">
                        <button className="btn btn-gold" onClick={handleCreate}>Publish</button>
                        <button className="btn" onClick={() => setView('list')}>Cancel</button>
                    </div>
                </div>
            )}
        </DockableWindow>
    )
}