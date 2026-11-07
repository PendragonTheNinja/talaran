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
import { useDraft } from '../lib/drafts'
import { TEXT_LIMITS } from '../lib/textLimits'

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
    // On a phone the list and the post take turns: the latest post first,
    // "All updates" for the list (MobileShell.css). Desktop shows both.
    const [showList, setShowList] = useState(false)
    const [posts, setPosts] = useState<NewsPost[]>([])
    const [selected, setSelected] = useState<NewsPost | null>(null)
    const [view, setView] = useState<'list' | 'create' | 'edit'>('list')
    // Editing a published post in place (Nathan, 2026-11-07): its Announcements
    // copy in the forum is rewritten with it (routes/news.ts).
    const [editing, setEditing] = useState<NewsPost | null>(null)
    const [editTitle, setEditTitle] = useState('')
    const [editBody, setEditBody] = useState('')
    const [saving, setSaving] = useState(false)
    // Drafts (lib/drafts.ts): a news post survives closing the panel.
    const [newTitle, setNewTitle, clearNewTitle] = useDraft('news:new:title')
    const [newBody, setNewBody, clearNewBody] = useDraft('news:new:body')
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const { textareaRef: bodyTextareaRef, insertMarkdown: insertBodyMarkdown } = useMarkdownEditor(newBody, setNewBody)
    const { textareaRef: editTextareaRef, insertMarkdown: insertEditMarkdown } = useMarkdownEditor(editBody, setEditBody)

    const isMobile = useIsMobile()
    const dock = useDockableWindow('news')

    useEffect(() => {
        loadNews()
    }, [])

    const loadNews = async (keepId?: number) => {
        try {
            const data = await apiFetch<{ posts: NewsPost[] }>('/api/news/latest')
            setPosts(data.posts)
            const kept = keepId ? data.posts.find(p => p.id === keepId) : null
            if (kept) setSelected(kept)
            else if (data.posts.length > 0) setSelected(data.posts[0])
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
            clearNewTitle()
            clearNewBody()
            setView('list')
            setTimeout(() => setSuccess(null), 3000)
            await loadNews()
        } catch (err: any) {
            setError(err.message)
        }
    }

    const startEdit = (post: NewsPost) => {
        setError(null)
        setEditing(post)
        setEditTitle(post.title)
        setEditBody(post.body)
        setView('edit')
    }

    const handleSaveEdit = async () => {
        if (!editing) return
        setError(null)
        setSaving(true)
        try {
            await apiFetch(`/api/news/${editing.id}`, {
                method: 'PUT',
                body: JSON.stringify({ title: editTitle, body: editBody }),
            })
            setSuccess('News post updated.')
            setTimeout(() => setSuccess(null), 3000)
            setView('list')
            await loadNews(editing.id)
            setEditing(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save the post.')
        } finally {
            setSaving(false)
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
                    {(view === 'create' || view === 'edit') && (
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
                <div className={`news-body ${showList ? 'listing' : 'reading'}`}>
                    {/* Sidebar - post list */}
                    <div className="news-sidebar">
                        <p className="muted-text" style={{ fontSize: '12px', padding: '4px var(--space-sm)' }}>All Updates</p>
                        {posts.map(post => (
                            <div
                                key={post.id}
                                className={`news-sidebar-item ${selected?.id === post.id ? 'active' : ''}`}
                                onClick={() => { setSelected(post); setShowList(false) }}
                            >
                                <span className="news-sidebar-title">{post.title}</span>
                                <span className="news-sidebar-date muted-text">{formatDate(post.published_at)}</span>
                            </div>
                        ))}
                    </div>

                    {/* Main content */}
                    <div className="news-content">
                        <button className="btn mobile-back-btn" onClick={() => setShowList(true)}>← All updates</button>
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
                                            <button className="btn" style={{ fontSize: '12px' }} onClick={() => startEdit(selected)}>
                                                Edit
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
                            maxLength={TEXT_LIMITS.newsBody}
                            style={{ width: '100%', resize: 'vertical', borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
                        />
                    </div>
                    <div className="guild-actions">
                        <button className="btn btn-gold" onClick={handleCreate}>Publish</button>
                        <button className="btn" onClick={() => setView('list')}>Cancel</button>
                    </div>
                </div>
            )}
            {view === 'edit' && editing && (
                <div className="news-create">
                    <p className="muted-text" style={{ fontSize: '13px' }}>
                        {editing.forum_thread_id ? 'Saving also updates its thread in the forum\'s Announcements.' : 'This post has no forum thread.'}
                    </p>
                    <div className="guild-form-group">
                        <label className="muted-text">Title</label>
                        <input
                            className="chat-input"
                            type="text"
                            value={editTitle}
                            onChange={e => setEditTitle(e.target.value)}
                            maxLength={200}
                        />
                    </div>
                    <div className="guild-form-group">
                        <label className="muted-text">Body</label>
                        <MarkdownToolbar onInsert={insertEditMarkdown} />
                        <textarea
                            ref={editTextareaRef}
                            className="chat-input"
                            value={editBody}
                            onChange={e => setEditBody(e.target.value)}
                            rows={12}
                            maxLength={TEXT_LIMITS.newsBody}
                            style={{ width: '100%', resize: 'vertical', borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
                        />
                    </div>
                    <div className="guild-actions">
                        <button className="btn btn-gold" onClick={handleSaveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
                        <button className="btn" onClick={() => setView('list')}>Cancel</button>
                    </div>
                </div>
            )}
        </DockableWindow>
    )
}