import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import MarkdownRenderer from './MarkdownRenderer'
import { formatGameDateTime, formatGameDate } from '../lib/time'
// The main forum's stylesheet, so a guild post looks like a forum post
// rather than merely similar to one.
import './ForumPanel.css'
import './GuildForum.css'

// The guild's own forum, shown inside the guild page.
//
// Permissions come from the server on every response (canPost, canManage) rather
// than being computed here from a role string. The client only decides what to
// draw; the server decides what is allowed. Hiding a button is a courtesy, not a
// control.

const RANK_LABELS: Record<number, string> = {
    1: 'All members',
    2: 'Leaders and founder',
    3: 'Founder only',
}

interface Category {
    id: number
    name: string
    description: string | null
    sort_order: number
    min_role_view: number
    min_role_post: number
    threadCount: number
    canPost: boolean
    lastThread: { id: number; title: string; last_post_at: string; last_post_username: string } | null
}

interface Thread {
    id: number
    title: string
    author_id: number
    author_name: string
    author_avatar: string | null
    is_pinned: boolean
    is_locked: boolean
    reply_count: number
    last_post_at: string | null
    last_post_username: string | null
}

interface Post {
    id: number
    author_id: number
    author_name: string
    author_role: string | null
    avatar_url: string | null
    is_admin: boolean
    is_mod: boolean
    player_joined: string
    guild_post_count: number
    content: string
    created_at: string
    edited_at: string | null
}

type View =
    | { kind: 'boards' }
    | { kind: 'threads'; category: Category }
    | { kind: 'thread'; threadId: number }
    | { kind: 'compose'; category: Category }
    | { kind: 'manage' }

export default function GuildForum() {
    const [view, setView] = useState<View>({ kind: 'boards' })
    const [categories, setCategories] = useState<Category[]>([])
    const [canManage, setCanManage] = useState(false)
    const [myRank, setMyRank] = useState(1)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const loadBoards = useCallback(async () => {
        try {
            const d = await apiFetch<{
                categories: Category[]
                canManage: boolean
                myRank: number
            }>('/api/guilds/forum/categories')
            setCategories(d.categories)
            setCanManage(d.canManage)
            setMyRank(d.myRank)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not load the guild forum.')
        }
    }, [])

    useEffect(() => { loadBoards() }, [loadBoards])

    return (
        <div className="guild-forum">
            {error && <p className="guild-error">{error}</p>}

            {view.kind === 'boards' && (
                <Boards
                    categories={categories}
                    canManage={canManage}
                    onOpen={category => setView({ kind: 'threads', category })}
                    onManage={() => setView({ kind: 'manage' })}
                />
            )}

            {view.kind === 'threads' && (
                <Threads
                    category={view.category}
                    onBack={() => { setView({ kind: 'boards' }); loadBoards() }}
                    onOpen={threadId => setView({ kind: 'thread', threadId })}
                    onCompose={() => setView({ kind: 'compose', category: view.category })}
                    canManage={canManage}
                />
            )}

            {view.kind === 'thread' && (
                <ThreadView
                    threadId={view.threadId}
                    onBack={() => setView({ kind: 'boards' })}
                />
            )}

            {view.kind === 'compose' && (
                <Compose
                    category={view.category}
                    busy={busy}
                    setBusy={setBusy}
                    onDone={threadId => setView({ kind: 'thread', threadId })}
                    onCancel={() => setView({ kind: 'threads', category: view.category })}
                />
            )}

            {view.kind === 'manage' && (
                <ManageBoards
                    categories={categories}
                    myRank={myRank}
                    onChanged={loadBoards}
                    onBack={() => setView({ kind: 'boards' })}
                />
            )}
        </div>
    )
}

function Boards({
    categories, canManage, onOpen, onManage,
}: {
    categories: Category[]
    canManage: boolean
    onOpen: (c: Category) => void
    onManage: () => void
}) {
    return (
        <>
            <div className="guild-forum-head">
                <p className="guild-section-title gold-text">Guild Forum</p>
                {canManage && (
                    <button className="btn" onClick={onManage}>Manage boards</button>
                )}
            </div>

            {categories.length === 0 ? (
                <p className="muted-text">
                    No boards yet. {canManage ? 'Create one to get started.' : 'Ask a leader to create one.'}
                </p>
            ) : categories.map(cat => (
                <div key={cat.id} className="guild-forum-board" onClick={() => onOpen(cat)}>
                    <div className="guild-forum-board-main">
                        <span className="guild-forum-board-name gold-text">
                            {cat.name}
                            {cat.min_role_view > 1 && (
                                <span className="guild-forum-lock" title={RANK_LABELS[cat.min_role_view]}>
                                    🔒
                                </span>
                            )}
                        </span>
                        {cat.description && (
                            <span className="guild-forum-board-desc muted-text">{cat.description}</span>
                        )}
                    </div>

                    <div className="guild-forum-board-stats muted-text">
                        <span>{cat.threadCount} {cat.threadCount === 1 ? 'thread' : 'threads'}</span>
                        {cat.lastThread && (
                            <span className="guild-forum-board-last">
                                {cat.lastThread.title} — {cat.lastThread.last_post_username}
                                {cat.lastThread.last_post_at
                                    ? ` · ${formatGameDateTime(new Date(cat.lastThread.last_post_at))}`
                                    : ''}
                            </span>
                        )}
                    </div>
                </div>
            ))}
        </>
    )
}

function Threads({
    category, onBack, onOpen, onCompose, canManage,
}: {
    category: Category
    onBack: () => void
    onOpen: (id: number) => void
    onCompose: () => void
    canManage: boolean
}) {
    const [threads, setThreads] = useState<Thread[]>([])
    const [canPost, setCanPost] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        try {
            const d = await apiFetch<{ threads: Thread[]; canPost: boolean }>(
                `/api/guilds/forum/categories/${category.id}/threads`,
            )
            setThreads(d.threads)
            setCanPost(d.canPost)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not load that board.')
        }
    }, [category.id])

    useEffect(() => { load() }, [load])

    const act = async (id: number, what: 'pin' | 'lock') => {
        try {
            await apiFetch(`/api/guilds/forum/threads/${id}/${what}`, { method: 'POST' })
            await load()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'That did not work.')
        }
    }

    return (
        <>
            <div className="guild-forum-head">
                <button className="btn guild-forum-back" onClick={onBack}>‹ Boards</button>
                <p className="guild-section-title gold-text">{category.name}</p>
                {canPost && <button className="btn btn-gold" onClick={onCompose}>New thread</button>}
            </div>

            {error && <p className="guild-error">{error}</p>}

            {threads.length === 0 ? (
                <p className="muted-text">Nothing here yet.</p>
            ) : threads.map(t => (
                <div key={t.id} className="guild-forum-thread">
                    <div className="guild-forum-thread-main" onClick={() => onOpen(t.id)}>
                        <span className="guild-forum-thread-title">
                            {t.is_pinned && <span title="Pinned">📌 </span>}
                            {t.is_locked && <span title="Locked">🔒 </span>}
                            {t.title}
                        </span>
                        <span className="muted-text guild-forum-thread-meta">
                            {t.author_name} · {t.reply_count} {t.reply_count === 1 ? 'reply' : 'replies'}
                            {t.last_post_at && (
                                <> · last {formatGameDateTime(new Date(t.last_post_at))}
                                    {t.last_post_username ? ` by ${t.last_post_username}` : ''}</>
                            )}
                        </span>
                    </div>

                    {canManage && (
                        <div className="guild-forum-thread-actions">
                            <button className="btn" onClick={() => act(t.id, 'pin')}>
                                {t.is_pinned ? 'Unpin' : 'Pin'}
                            </button>
                            <button className="btn" onClick={() => act(t.id, 'lock')}>
                                {t.is_locked ? 'Unlock' : 'Lock'}
                            </button>
                        </div>
                    )}
                </div>
            ))}
        </>
    )
}

function ThreadView({ threadId, onBack }: { threadId: number; onBack: () => void }) {
    const [data, setData] = useState<{
        thread: Thread
        posts: Post[]
        canPost: boolean
        canManage: boolean
        myPlayerId: number
    } | null>(null)
    const [reply, setReply] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const load = useCallback(async () => {
        try {
            setData(await apiFetch(`/api/guilds/forum/threads/${threadId}`))
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not load that thread.')
        }
    }, [threadId])

    useEffect(() => { load() }, [load])

    const send = async () => {
        if (!reply.trim()) return
        setBusy(true)
        try {
            await apiFetch(`/api/guilds/forum/threads/${threadId}/reply`, {
                method: 'POST',
                body: JSON.stringify({ content: reply }),
            })
            setReply('')
            await load()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not post that.')
        } finally {
            setBusy(false)
        }
    }

    const removePost = async (id: number) => {
        if (!window.confirm('Delete this post?')) return
        try {
            await apiFetch(`/api/guilds/forum/posts/${id}`, { method: 'DELETE' })
            await load()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not delete that.')
        }
    }

    if (!data) return <p className="muted-text">{error || 'Loading…'}</p>

    return (
        <>
            <div className="guild-forum-head">
                <button className="btn guild-forum-back" onClick={onBack}>‹ Boards</button>
                <p className="guild-section-title gold-text">{data.thread.title}</p>
            </div>

            {error && <p className="guild-error">{error}</p>}

            <div className="forum-posts-list">
                {data.posts.map(post => (
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

                            <span className="forum-post-author gold-text">{post.author_name}</span>

                            {post.author_role && post.author_role !== 'member' && (
                                <span className="forum-post-badge mod">
                                    {post.author_role.charAt(0).toUpperCase() + post.author_role.slice(1)}
                                </span>
                            )}
                            {post.is_admin && <span className="forum-post-badge admin">Admin</span>}
                            {post.is_mod && !post.is_admin && <span className="forum-post-badge mod">Mod</span>}

                            {/* Posts in THIS guild's forum, not the global count.
                                Sized by CSS, not inline, so the narrow guild panel
                                can scale the whole sidebar down. */}
                            <span className="muted-text forum-post-meta">
                                Guild posts: {post.guild_post_count}
                            </span>
                            <span className="muted-text forum-post-meta">
                                Joined: {formatGameDate(new Date(post.player_joined))}
                            </span>
                        </div>

                        <div className="forum-post-content">
                            <div className="forum-post-timestamp muted-text">
                                {formatGameDateTime(new Date(post.created_at))}
                                {post.edited_at && <span> · edited</span>}

                                {(post.author_id === data.myPlayerId || data.canManage) && (
                                    <button
                                        className="guild-forum-post-delete"
                                        onClick={() => removePost(post.id)}
                                        title="Delete post"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            <MarkdownRenderer content={post.content} />
                        </div>
                    </div>
                ))}
            </div>

            {data.thread.is_locked ? (
                <p className="muted-text">This thread is locked.</p>
            ) : data.canPost ? (
                <div className="guild-forum-reply">
                    <textarea
                        value={reply}
                        onChange={e => setReply(e.target.value)}
                        placeholder="Write a reply…"
                    />
                    <button className="btn btn-gold" onClick={send} disabled={busy || !reply.trim()}>
                        {busy ? 'Posting…' : 'Reply'}
                    </button>
                </div>
            ) : (
                <p className="muted-text">Your rank cannot post on this board.</p>
            )}
        </>
    )
}

function Compose({
    category, busy, setBusy, onDone, onCancel,
}: {
    category: Category
    busy: boolean
    setBusy: (b: boolean) => void
    onDone: (threadId: number) => void
    onCancel: () => void
}) {
    const [title, setTitle] = useState('')
    const [content, setContent] = useState('')
    const [error, setError] = useState<string | null>(null)

    const submit = async () => {
        setBusy(true)
        setError(null)
        try {
            const d = await apiFetch<{ threadId: number }>('/api/guilds/forum/threads', {
                method: 'POST',
                body: JSON.stringify({ categoryId: category.id, title, content }),
            })
            onDone(d.threadId)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not post that.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <>
            <div className="guild-forum-head">
                <button className="btn guild-forum-back" onClick={onCancel}>‹ Cancel</button>
                <p className="guild-section-title gold-text">New thread in {category.name}</p>
            </div>

            {error && <p className="guild-error">{error}</p>}

            <input
                className="guild-forum-input"
                type="text"
                value={title}
                placeholder="Title"
                onChange={e => setTitle(e.target.value)}
            />

            <textarea
                className="guild-forum-textarea"
                value={content}
                placeholder="Say your piece…"
                onChange={e => setContent(e.target.value)}
            />

            <button
                className="btn btn-gold"
                onClick={submit}
                disabled={busy || !title.trim() || !content.trim()}
            >
                {busy ? 'Posting…' : 'Post thread'}
            </button>
        </>
    )
}

function ManageBoards({
    categories, myRank, onChanged, onBack,
}: {
    categories: Category[]
    myRank: number
    onChanged: () => void
    onBack: () => void
}) {
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [minView, setMinView] = useState(1)
    const [minPost, setMinPost] = useState(1)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const create = async () => {
        setBusy(true)
        setError(null)
        try {
            await apiFetch('/api/guilds/forum/categories', {
                method: 'POST',
                body: JSON.stringify({
                    name,
                    description,
                    minRoleView: minView,
                    minRolePost: minPost,
                    sortOrder: categories.length,
                }),
            })
            setName('')
            setDescription('')
            setMinView(1)
            setMinPost(1)
            onChanged()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not create that board.')
        } finally {
            setBusy(false)
        }
    }

    const update = async (cat: Category, patch: Partial<Category>) => {
        try {
            await apiFetch(`/api/guilds/forum/categories/${cat.id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    minRoleView: patch.min_role_view ?? cat.min_role_view,
                    minRolePost: patch.min_role_post ?? cat.min_role_post,
                }),
            })
            onChanged()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not update that board.')
        }
    }

    const remove = async (cat: Category) => {
        if (!window.confirm(`Delete "${cat.name}" and every thread in it? This cannot be undone.`)) return
        try {
            await apiFetch(`/api/guilds/forum/categories/${cat.id}`, { method: 'DELETE' })
            onChanged()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not delete that board.')
        }
    }

    return (
        <>
            <div className="guild-forum-head">
                <button className="btn guild-forum-back" onClick={onBack}>‹ Boards</button>
                <p className="guild-section-title gold-text">Manage boards</p>
            </div>

            {error && <p className="guild-error">{error}</p>}

            {categories.map(cat => (
                <div key={cat.id} className="guild-forum-manage-row">
                    <span className="gold-text">{cat.name}</span>

                    <label>
                        <span className="muted-text">Read</span>
                        <select
                            value={cat.min_role_view}
                            onChange={e => update(cat, { min_role_view: parseInt(e.target.value) })}
                        >
                            {[1, 2, 3].map(r => (
                                <option key={r} value={r}>{RANK_LABELS[r]}</option>
                            ))}
                        </select>
                    </label>

                    <label>
                        <span className="muted-text">Post</span>
                        <select
                            value={cat.min_role_post}
                            onChange={e => update(cat, { min_role_post: parseInt(e.target.value) })}
                        >
                            {[1, 2, 3].map(r => (
                                <option key={r} value={r}>{RANK_LABELS[r]}</option>
                            ))}
                        </select>
                    </label>

                    {/* Deleting a board destroys its threads, so it is founder-only. */}
                    {myRank >= 3 && (
                        <button className="btn" onClick={() => remove(cat)}>Delete</button>
                    )}
                </div>
            ))}

            <div className="guild-forum-manage-new">
                <p className="guild-section-title gold-text">New board</p>

                <input
                    className="guild-forum-input"
                    type="text"
                    value={name}
                    placeholder="Board name"
                    onChange={e => setName(e.target.value)}
                />

                <input
                    className="guild-forum-input"
                    type="text"
                    value={description}
                    placeholder="Description (optional)"
                    onChange={e => setDescription(e.target.value)}
                />

                <div className="guild-forum-manage-perms">
                    <label>
                        <span className="muted-text">Who can read</span>
                        <select value={minView} onChange={e => setMinView(parseInt(e.target.value))}>
                            {[1, 2, 3].map(r => <option key={r} value={r}>{RANK_LABELS[r]}</option>)}
                        </select>
                    </label>

                    <label>
                        <span className="muted-text">Who can post</span>
                        <select value={minPost} onChange={e => setMinPost(parseInt(e.target.value))}>
                            {[1, 2, 3].map(r => <option key={r} value={r}>{RANK_LABELS[r]}</option>)}
                        </select>
                    </label>
                </div>

                <button className="btn btn-gold" onClick={create} disabled={busy || !name.trim()}>
                    {busy ? 'Creating…' : 'Create board'}
                </button>
            </div>
        </>
    )
}
