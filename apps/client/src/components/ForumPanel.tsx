import { useState, useEffect } from 'react'
import { formatGameDate, formatGameDateTime } from '../lib/time'
import { apiFetch } from '../lib/api'
import './ForumPanel.css'
import ConfirmModal from './ConfirmModal'
import MarkdownRenderer from './MarkdownRenderer'
import MarkdownToolbar from './MarkdownToolbar'
import { useMarkdownEditor } from '../lib/useMarkdownEditor'

interface ForumCategory {
    id: number
    name: string
    description: string
    staff_only: boolean
    admin_post_only: boolean
    has_voting: boolean
    threadCount: number
    lastThread: {
        id: number
        title: string
        last_post_at: string
        last_post_username: string
    } | null
}

interface ForumThread {
    id: number
    title: string
    author_name: string
    reply_count: number
    view_count: number
    last_post_at: string
    last_poster_name: string
    is_pinned: boolean
    is_locked: boolean
    created_at: string
}

interface ForumPost {
    id: number
    content: string
    author_name: string
    avatar_url: string | null
    forum_signature: string | null
    forum_post_count: number
    guild_tag: string | null
    player_joined: string
    is_admin: boolean
    is_mod: boolean
    is_first_post: boolean
    upvotes: number
    downvotes: number
    myVote?: number
    created_at: string
    edited_at: string | null
}

interface Poll {
    id: number
    question: string
    is_closed: boolean
    options: { id: number; option_text: string; vote_count: number }[]
    myVoteOptionId: number | null
}

interface RecentThread {
    thread_id: number
    thread_title: string
    last_post_at: string
    category_id: number
    category_name: string
    last_poster_name: string
}

type ForumView = 'home' | 'category' | 'thread' | 'new_thread'

export default function ForumPanel({ onClose, playerUsername, isAdmin, isMod, closing, onViewProfile, openThreadId, onThreadOpened }: {
    onClose: () => void
    playerUsername: string
    isAdmin: boolean
    isMod: boolean
    closing?: boolean
    onViewProfile?: (playerId: number) => void
    openThreadId?: number | null
    onThreadOpened?: () => void
}) {
    console.log('Forum props - isAdmin:', isAdmin, 'isMod:', isMod)
    const [view, setView] = useState<ForumView>('home')
    const [categories, setCategories] = useState<ForumCategory[]>([])
    const [recentThreads, setRecentThreads] = useState<RecentThread[]>([])
    const [currentCategory, setCurrentCategory] = useState<any>(null)
    const [threads, setThreads] = useState<ForumThread[]>([])
    const [currentThread, setCurrentThread] = useState<any>(null)
    const [posts, setPosts] = useState<ForumPost[]>([])
    const [poll, setPoll] = useState<Poll | null>(null)
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null)

    // New thread form
    const [newTitle, setNewTitle] = useState('')
    const [newContent, setNewContent] = useState('')
    const [newCategoryId, setNewCategoryId] = useState<number | null>(null)
    const [hasPoll, setHasPoll] = useState(false)
    const [pollQuestion, setPollQuestion] = useState('')
    const [pollOptions, setPollOptions] = useState(['', ''])

    // Reply
    const [replyContent, setReplyContent] = useState('')
    const [showReply, setShowReply] = useState(false)

    // Edit and Markdown
    const [editingPostId, setEditingPostId] = useState<number | null>(null)
    const [editContent, setEditContent] = useState('')
    const { textareaRef: editTextareaRef, insertMarkdown: insertEditMarkdown } = useMarkdownEditor(editContent, setEditContent)
    const { textareaRef: replyTextareaRef, insertMarkdown: insertReplyMarkdown } = useMarkdownEditor(replyContent, setReplyContent)
    const { textareaRef: newThreadTextareaRef, insertMarkdown: insertNewThreadMarkdown } = useMarkdownEditor(newContent, setNewContent)

    useEffect(() => {
        if (openThreadId) return
        loadHome()
    }, [])

    useEffect(() => {
        if (openThreadId) {
            console.log('Opening thread from notification:', openThreadId)
            loadThread(openThreadId)
            onThreadOpened?.()
        }
    }, [openThreadId])

    const loadHome = async () => {
        try {
            const [catData, recentData] = await Promise.all([
                apiFetch<{ categories: ForumCategory[] }>('/api/forum/categories'),
                apiFetch<{ recentThreads: RecentThread[] }>('/api/forum/recent'),
            ])
            setCategories(catData.categories)
            setRecentThreads(recentData.recentThreads)
            setView('home')
        } catch (err) {
            setError('Failed to load forum.')
        }
    }

    const loadCategory = async (cat: ForumCategory, p = 1) => {
        try {
            const data = await apiFetch<{ category: any; threads: ForumThread[]; totalPages: number }>
                (`/api/forum/categories/${cat.id}/threads?page=${p}`)
            setCurrentCategory(data.category)
            setThreads(data.threads)
            setTotalPages(data.totalPages)
            setPage(p)
            setView('category')
        } catch (err) {
            setError('Failed to load category.')
        }
    }

    const loadThread = async (threadId: number, p = 1) => {
        try {
            const data = await apiFetch<{ thread: any; posts: ForumPost[]; poll: Poll | null; totalPages: number }>
                (`/api/forum/threads/${threadId}?page=${p}`)
            setCurrentThread(data.thread)
            setPosts(data.posts)
            setPoll(data.poll)
            setTotalPages(data.totalPages)
            setPage(p)
            setView('thread')
            setShowReply(false)
            setReplyContent('')
        } catch (err) {
            setError('Failed to load thread.')
        }
    }

    const handleNewThread = async () => {
        setError(null)
        try {
            const data = await apiFetch<{ threadId: number }>('/api/forum/threads', {
                method: 'POST',
                body: JSON.stringify({
                    categoryId: newCategoryId,
                    title: newTitle,
                    content: newContent,
                    pollQuestion: hasPoll ? pollQuestion : null,
                    pollOptions: hasPoll ? pollOptions.filter(o => o.trim()) : null,
                }),
            })
            setNewTitle('')
            setNewContent('')
            setHasPoll(false)
            setPollQuestion('')
            setPollOptions(['', ''])
            setSuccess('Thread created!')
            setTimeout(() => setSuccess(null), 3000)
            await loadThread(data.threadId)
        } catch (err: any) {
            setError(err.message)
        }
    }

    const handleReply = async () => {
        setError(null)
        try {
            await apiFetch(`/api/forum/threads/${currentThread.id}/reply`, {
                method: 'POST',
                body: JSON.stringify({ content: replyContent }),
            })
            setReplyContent('')
            setShowReply(false)
            await loadThread(currentThread.id, page)
        } catch (err: any) {
            setError(err.message)
        }
    }

    const handleVote = async (postId: number, vote: number) => {
        try {
            await apiFetch(`/api/forum/posts/${postId}/vote`, {
                method: 'POST',
                body: JSON.stringify({ vote }),
            })
            await loadThread(currentThread.id, page)
        } catch (err) { }
    }

    const handlePollVote = async (optionId: number) => {
        try {
            await apiFetch(`/api/forum/polls/${poll!.id}/vote`, {
                method: 'POST',
                body: JSON.stringify({ optionId }),
            })
            await loadThread(currentThread.id, page)
        } catch (err: any) {
            setError(err.message)
        }
    }

    const handleDeletePost = async (postId: number) => {
        const post = posts.find(p => p.id === postId)
        const isFirstPost = post?.is_first_post

        setConfirmDialog({
            message: isFirstPost ? 'Delete this thread and all its replies?' : 'Delete this post?',
            onConfirm: async () => {
                setConfirmDialog(null)
                try {
                    await apiFetch(`/api/forum/posts/${postId}`, { method: 'DELETE' })
                    if (isFirstPost) {
                        await loadCategory(currentCategory)
                    } else {
                        await loadThread(currentThread.id, page)
                    }
                } catch (err: any) {
                    setError(err.message)
                }
            }
        })
    }

    const handlePin = async (threadId: number) => {
        try {
            await apiFetch(`/api/forum/threads/${threadId}/pin`, { method: 'POST' })
            await loadCategory(currentCategory)
        } catch (err: any) {
            setError(err.message)
        }
    }

    const handleLock = async (threadId: number) => {
        try {
            await apiFetch(`/api/forum/threads/${threadId}/lock`, { method: 'POST' })
            await loadThread(threadId, page)
        } catch (err: any) {
            setError(err.message)
        }
    }

    const handleEditPost = async (postId: number) => {
        try {
            await apiFetch(`/api/forum/posts/${postId}`, {
                method: 'PUT',
                body: JSON.stringify({ content: editContent }),
            })
            setPosts(prev => prev.map(p => p.id === postId
                ? { ...p, content: editContent, edited_at: new Date().toISOString() }
                : p
            ))
            setEditingPostId(null)
            setEditContent('')
        } catch (err: any) {
            setError(err.message)
        }
    }

    const formatDate = (dateStr: string) => formatGameDateTime(new Date(dateStr))

    const canPost = (cat: any) => {
        if (!cat) return true
        if (cat.admin_post_only && !isAdmin) return false
        if (cat.staff_only && !isAdmin && !isMod) return false
        return true
    }

    return (
        <div className={`forum-panel ${closing ? 'closing' : ''}`}>
            {/* Header */}
            <div className="forum-header">
                <div className="forum-breadcrumb">
                    <span className="forum-breadcrumb-item gold-text" onClick={loadHome} style={{ cursor: 'pointer' }}>
                        Forum
                    </span>
                    {view === 'category' && currentCategory && (
                        <>
                            <span className="muted-text"> › </span>
                            <span className="forum-breadcrumb-item gold-text">{currentCategory.name}</span>
                        </>
                    )}
                    {view === 'thread' && currentThread && (
                        <>
                            <span className="muted-text"> › </span>
                            <span className="forum-breadcrumb-item gold-text" onClick={() => loadCategory({ id: currentThread.category_id } as any)} style={{ cursor: 'pointer' }}>
                                {currentThread.category_name}
                            </span>
                            <span className="muted-text"> › </span>
                            <span className="forum-breadcrumb-item muted-text">{currentThread.title}</span>
                        </>
                    )}
                    {view === 'new_thread' && (
                        <>
                            {currentCategory && (
                                <>
                                    <span className="muted-text"> › </span>
                                    <span
                                        className="forum-breadcrumb-item gold-text"
                                        onClick={() => loadCategory(currentCategory)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        {currentCategory.name}
                                    </span>
                                </>
                            )}
                            <span className="muted-text"> › </span>
                            <span className="forum-breadcrumb-item muted-text">New Thread</span>
                        </>
                    )}
                </div>
                <div className="forum-header-actions">
                    {view !== 'home' && (
                        <button className="btn" onClick={() => {
                            if (view === 'thread') {
                                if (currentCategory) loadCategory(currentCategory)
                                else loadHome()
                            }
                            else if (view === 'category') loadHome()
                            else if (view === 'new_thread') setView(currentCategory ? 'category' : 'home')
                        }}>← Back</button>
                    )}
                    {(view === 'home' || view === 'category') && canPost(currentCategory) && (
                        <button className="btn btn-gold" onClick={() => {
                            setNewCategoryId(currentCategory?.id || null)
                            setView('new_thread')
                        }}>+ New Thread</button>
                    )}
                    <button className="modal-close-btn" onClick={onClose}>✕</button>
                </div>
            </div>

            {error && <p className="guild-error" style={{ padding: '0 var(--space-lg)' }}>{error}</p>}
            {success && <p className="guild-success" style={{ padding: '0 var(--space-lg)' }}>{success}</p>}

            <div className="forum-body">

                {/* HOME VIEW */}
                {view === 'home' && (
                    <div className="forum-home">
                        <div className="forum-categories-list">
                            <h3 className="forum-section-title gold-text">Categories</h3>
                            {categories.map(cat => (
                                <div key={cat.id} className="forum-category-row" onClick={() => loadCategory(cat)}>
                                    <div className="forum-category-icon">
                                        {cat.admin_post_only ? '📢' : cat.has_voting ? '💡' : cat.staff_only ? '🔒' : '💬'}
                                    </div>
                                    <div className="forum-category-info">
                                        <span className="forum-category-name gold-text">{cat.name}</span>
                                        <span className="forum-category-desc muted-text">{cat.description}</span>
                                    </div>
                                    <div className="forum-category-stats muted-text">
                                        <span>{cat.threadCount} threads</span>
                                        {cat.lastThread && (
                                            <span style={{ fontSize: '16px' }}>
                                                Last: {cat.lastThread.last_post_username} · {formatDate(cat.lastThread.last_post_at)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="forum-recent">
                            <h3 className="forum-section-title gold-text">Recent Activity</h3>
                            {recentThreads.length === 0 ? (
                                <p className="muted-text" style={{ fontStyle: 'italic', fontSize: '16px' }}>No posts yet.</p>
                            ) : (
                                recentThreads.map(thread => (
                                    <div key={thread.thread_id} className="forum-recent-row" onClick={() => loadThread(thread.thread_id)}>
                                        <span className="forum-recent-title gold-text">{thread.thread_title}</span>
                                        <span className="forum-recent-category muted-text">[{thread.category_name}]</span>
                                        <span className="muted-text" style={{ fontSize: '16px' }}>— {thread.last_poster_name} · {formatDate(thread.last_post_at)}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* CATEGORY VIEW */}
                {view === 'category' && currentCategory && (
                    <div className="forum-category-view">
                        <div className="forum-category-header">
                            <h3 className="gold-text">{currentCategory.name}</h3>
                            <p className="muted-text" style={{ fontSize: '16px' }}>{currentCategory.description}</p>
                        </div>

                        {threads.length === 0 ? (
                            <p className="muted-text" style={{ padding: '16px', fontStyle: 'italic' }}>No threads yet. Be the first to post!</p>
                        ) : (
                            <div className="forum-threads-list">
                                {threads.map(thread => (
                                    <div key={thread.id} className="forum-thread-row" onClick={() => loadThread(thread.id)}>
                                        <div className="forum-thread-icons">
                                            {thread.is_pinned && <span title="Pinned">📌</span>}
                                            {thread.is_locked && <span title="Locked">🔒</span>}
                                        </div>
                                        <div className="forum-thread-info">
                                            <span className="forum-thread-title gold-text">{thread.title}</span>
                                            <span className="muted-text" style={{ fontSize: '16px' }}>
                                                by {thread.author_name} · {formatDate(thread.created_at)}
                                            </span>
                                        </div>
                                        <div className="forum-thread-stats muted-text">
                                            <span>{thread.reply_count} replies</span>
                                            <span>{thread.view_count} views</span>
                                            {thread.last_poster_name && (
                                                <span style={{ fontSize: '16px' }}>Last: {thread.last_poster_name}</span>
                                            )}
                                        </div>
                                        {(isAdmin || isMod) && (
                                            <div className="forum-mod-actions" onClick={e => e.stopPropagation()}>
                                                <button className="btn" style={{ fontSize: '12px' }} onClick={() => handlePin(thread.id)}>
                                                    {thread.is_pinned ? 'Unpin' : 'Pin'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {totalPages > 1 && (
                            <div className="forum-pagination">
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                                    <button key={p} className={`btn ${p === page ? 'btn-gold' : ''}`} onClick={() => loadCategory(currentCategory, p)}>
                                        {p}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* THREAD VIEW */}
                {view === 'thread' && currentThread && (
                    <div className="forum-thread-view">
                        <div className="forum-thread-header">
                            <h3 className="gold-text">{currentThread.title}</h3>
                            <div className="forum-thread-meta muted-text">
                                <span>{currentThread.reply_count} replies · {currentThread.view_count} views</span>
                                {currentThread.is_locked && (
                                    <span className="forum-locked-badge">🔒 Locked{currentThread.locked_reason ? `: ${currentThread.locked_reason}` : ''}</span>
                                )}
                            </div>
                            {(isAdmin || isMod) && (
                                <div className="forum-mod-actions">
                                    <button className="btn" style={{ fontSize: '12px' }} onClick={() => handlePin(currentThread.id)}>
                                        {currentThread.is_pinned ? 'Unpin' : 'Pin'}
                                    </button>
                                    <button className="btn" style={{ fontSize: '12px' }} onClick={() => handleLock(currentThread.id)}>
                                        {currentThread.is_locked ? 'Unlock' : 'Lock'}
                                    </button>
                                </div>
                            )}
                        </div>

                        {!currentThread.is_locked && !showReply && (
                            <div style={{ marginBottom: '8px' }}>
                                <button className="btn btn-gold" onClick={() => setShowReply(true)}>Reply</button>
                            </div>
                        )}

                        {/* Poll */}
                        {poll && (
                            <div className="forum-poll">
                                <p className="forum-poll-question gold-text">{poll.question}</p>
                                {poll.myVoteOptionId ? (
                                    <div className="forum-poll-results">
                                        {poll.options.map(opt => {
                                            const total = poll.options.reduce((sum, o) => sum + o.vote_count, 0)
                                            const pct = total > 0 ? Math.round((opt.vote_count / total) * 100) : 0
                                            return (
                                                <div key={opt.id} className="forum-poll-option-result">
                                                    <div className="forum-poll-bar-label">
                                                        <span>{opt.option_text}</span>
                                                        <span className="muted-text">{opt.vote_count} ({pct}%)</span>
                                                    </div>
                                                    <div className="forum-poll-bar">
                                                        <div className="forum-poll-bar-fill" style={{ width: `${pct}%` }} />
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                ) : (
                                    <div className="forum-poll-options">
                                        {poll.options.map(opt => (
                                            <button key={opt.id} className="btn" onClick={() => handlePollVote(opt.id)}>
                                                {opt.option_text}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Posts */}
                        <div className="forum-posts-list">
                            {posts.map(post => (
                                <div key={post.id} className="forum-post">
                                    <div className="forum-post-sidebar">
                                        <div className="forum-post-avatar">
                                            {post.avatar_url ? (
                                                <img src={post.avatar_url} alt={post.author_name} />
                                            ) : (
                                                <div className="forum-post-avatar-placeholder">
                                                    {post.author_name.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                        <span
                                            className="forum-post-author gold-text"
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => onViewProfile?.(post.author_id)}
                                        >
                                            {post.author_name}
                                            {post.guild_tag && <span className="chat-guild-tag">[{post.guild_tag}]</span>}
                                        </span>
                                        {post.is_admin && <span className="forum-post-badge admin">Admin</span>}
                                        {post.is_mod && !post.is_admin && <span className="forum-post-badge mod">Mod</span>}
                                        <span className="muted-text" style={{ fontSize: '14px' }}>Posts: {post.forum_post_count}</span>
                                        <span className="muted-text" style={{ fontSize: '14px' }}>
                                            Joined: {formatGameDate(new Date(post.player_joined))}                                        </span>
                                    </div>
                                    <div className="forum-post-content">
                                        <div className="forum-post-timestamp muted-text">{formatDate(post.created_at)}</div>
                                        {editingPostId === post.id ? (
                                            <div className="forum-post-edit">
                                                <MarkdownToolbar onInsert={insertEditMarkdown} />
                                                <textarea
                                                    ref={editTextareaRef}
                                                    className="forum-edit-textarea"
                                                    value={editContent}
                                                    onChange={e => setEditContent(e.target.value)}
                                                    rows={8}
                                                />
                                                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                                    <button className="btn btn-gold" style={{ fontSize: '13px' }} onClick={() => handleEditPost(post.id)}>
                                                        Save
                                                    </button>
                                                    <button className="btn" style={{ fontSize: '13px' }} onClick={() => { setEditingPostId(null); setEditContent('') }}>
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <MarkdownRenderer content={post.content} className="forum-post-body" />
                                        )}
                                        {post.edited_at && (
                                            <p className="forum-post-edited muted-text">
                                                Last edited {formatDate(post.edited_at)}
                                            </p>
                                        )}
                                        {post.forum_signature && (
                                            <div className="forum-post-signature muted-text">
                                                <div className="forum-signature-divider" />
                                                {post.forum_signature}
                                            </div>
                                        )}

                                        <div className="forum-post-actions">
                                            {(post.author_name === playerUsername || isAdmin || isMod) && (
                                                <button
                                                    className="btn"
                                                    style={{ fontSize: '12px' }}
                                                    onClick={() => {
                                                        setEditingPostId(post.id)
                                                        setEditContent(post.content)
                                                    }}
                                                >
                                                    Edit
                                                </button>
                                            )}
                                            {currentThread.has_voting && (
                                                <div className="forum-vote-buttons">
                                                    <button
                                                        className={`forum-vote-btn ${post.myVote === 1 ? 'active-up' : ''}`}
                                                        onClick={() => handleVote(post.id, 1)}
                                                    >▲ {post.upvotes}</button>
                                                    <button
                                                        className={`forum-vote-btn ${post.myVote === -1 ? 'active-down' : ''}`}
                                                        onClick={() => handleVote(post.id, -1)}
                                                    >▼ {post.downvotes}</button>
                                                </div>
                                            )}
                                            {(post.author_name === playerUsername || isAdmin || isMod) && (
                                                <button className="btn btn-red" style={{ fontSize: '10px' }} onClick={() => handleDeletePost(post.id)}>
                                                    Delete
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {totalPages > 1 && (
                            <div className="forum-pagination">
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                                    <button key={p} className={`btn ${p === page ? 'btn-gold' : ''}`} onClick={() => loadThread(currentThread.id, p)}>
                                        {p}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Reply */}
                        {!currentThread.is_locked && (
                            <div className="forum-reply-section">
                                {!showReply ? (
                                    <button className="btn btn-gold" onClick={() => setShowReply(true)}>Reply</button>
                                ) : (
                                    <div className="forum-reply-form">
                                        <p className="gold-text" style={{ fontSize: '14px' }}>Your Reply</p>
                                        <MarkdownToolbar onInsert={insertReplyMarkdown} />
                                        <textarea
                                            ref={replyTextareaRef}
                                            className="chat-input forum-reply-textarea"
                                            value={replyContent}
                                            onChange={e => setReplyContent(e.target.value)}
                                            placeholder="Write your reply..."
                                            rows={6}
                                            style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
                                        />
                                        <div className="guild-actions">
                                            <button className="btn btn-gold" onClick={handleReply}>Post Reply</button>
                                            <button className="btn" onClick={() => setShowReply(false)}>Cancel</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* NEW THREAD VIEW */}
                {view === 'new_thread' && (
                    <div className="forum-new-thread">
                        <h3 className="gold-text">New Thread</h3>

                        {!newCategoryId && (
                            <div className="guild-form-group">
                                <label className="muted-text">Category</label>
                                <select
                                    className="forum-select"
                                    value={newCategoryId || ''}
                                    onChange={e => {
                                        const id = parseInt(e.target.value)
                                        setNewCategoryId(id)
                                        const cat = categories.find(c => c.id === id)
                                        if (cat) setCurrentCategory(cat)
                                    }}
                                >
                                    <option value="">Select a category...</option>
                                    {categories.filter(c => canPost(c)).map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="guild-form-group">
                            <label className="muted-text">Title</label>
                            <input
                                className="chat-input"
                                type="text"
                                value={newTitle}
                                onChange={e => setNewTitle(e.target.value)}
                                placeholder="Thread title..."
                                maxLength={200}
                            />
                        </div>

                        <div className="guild-form-group">
                            <label className="muted-text">Content</label>
                            <MarkdownToolbar onInsert={insertNewThreadMarkdown} />
                            <textarea
                                ref={newThreadTextareaRef}
                                className="chat-input"
                                value={newContent}
                                onChange={e => setNewContent(e.target.value)}
                                placeholder="Write your post..."
                                rows={8}
                                style={{ width: '100%', resize: 'vertical', fontSize: '16px', borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
                            />
                        </div>

                        {/* Poll option — only for feedback category */}
                        {categories.find(c => c.id === newCategoryId)?.has_voting && (
                            <div className="guild-form-group">
                                <label className="muted-text">
                                    <input type="checkbox" checked={hasPoll} onChange={e => setHasPoll(e.target.checked)} />
                                    {' '}Add a poll
                                </label>
                                {hasPoll && (
                                    <div className="forum-poll-builder">
                                        <input
                                            className="chat-input"
                                            type="text"
                                            value={pollQuestion}
                                            onChange={e => setPollQuestion(e.target.value)}
                                            placeholder="Poll question..."
                                        />
                                        {pollOptions.map((opt, i) => (
                                            <input
                                                key={i}
                                                className="chat-input"
                                                type="text"
                                                value={opt}
                                                onChange={e => {
                                                    const next = [...pollOptions]
                                                    next[i] = e.target.value
                                                    setPollOptions(next)
                                                }}
                                                placeholder={`Option ${i + 1}...`}
                                            />
                                        ))}
                                        {pollOptions.length < 6 && (
                                            <button className="btn" onClick={() => setPollOptions([...pollOptions, ''])}>
                                                + Add Option
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="guild-actions">
                            <button className="btn btn-gold" onClick={handleNewThread}>Post Thread</button>
                            <button className="btn" onClick={() => setView(currentCategory ? 'category' : 'home')}>Cancel</button>
                        </div>
                    </div>
                )}
            </div>

            {confirmDialog && (
                <ConfirmModal
                    message={confirmDialog.message}
                    onConfirm={confirmDialog.onConfirm}
                    onCancel={() => setConfirmDialog(null)}
                />
            )}
        </div>
    )
}