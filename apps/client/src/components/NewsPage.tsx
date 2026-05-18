import { useState, useEffect } from 'react'
import './NewsPage.css'
import { Link } from 'react-router-dom'

interface NewsPost {
    id: number
    title: string
    body: string
    published_at: string
    author_name: string
    forum_thread_id: number | null
}

export default function NewsPage() {
    const [posts, setPosts] = useState<NewsPost[]>([])
    const [selected, setSelected] = useState<NewsPost | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetch('http://localhost:3000/api/news/latest')
            .then(r => r.json())
            .then(d => {
                setPosts(d.posts || [])
                if (d.posts?.length > 0) setSelected(d.posts[0])
            })
            .catch(() => { })
            .finally(() => setLoading(false))
    }, [])

    const formatDate = (str: string) => new Date(str).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
    })

    return (
        <div className="news-page">
            {/* Header */}
            <div className="news-page-header">
                <Link to="/" className="news-page-back">
                    <span>✦</span>
                    <span className="news-page-wordmark">Talaran</span>
                </Link>
                <nav className="news-page-nav">
                    <Link to="/" className="news-page-nav-link">Play</Link>
                    <Link to="/news" className="news-page-nav-link active">News</Link>
                </nav>
            </div>

            <div className="news-page-hero">
                <p className="news-page-eyebrow">✦ Updates & Patch Notes</p>
                <h1 className="news-page-title">Talaran News</h1>
                <p className="news-page-subtitle">Follow the development of Taiar Island</p>
            </div>

            {loading ? (
                <div className="news-page-loading">
                    <p className="news-page-loading-text">Loading updates...</p>
                </div>
            ) : posts.length === 0 ? (
                <div className="news-page-empty">
                    <p>No updates yet. Check back soon.</p>
                </div>
            ) : (
                <div className="news-page-body">
                    {/* Sidebar */}
                    <div className="news-page-sidebar">
                        <p className="news-page-sidebar-label">All Updates</p>
                        {posts.map(post => (
                            <div
                                key={post.id}
                                className={`news-page-sidebar-item ${selected?.id === post.id ? 'active' : ''}`}
                                onClick={() => setSelected(post)}
                            >
                                <span className="news-page-sidebar-title">{post.title}</span>
                                <span className="news-page-sidebar-date">{formatDate(post.published_at)}</span>
                            </div>
                        ))}
                    </div>

                    {/* Content */}
                    <div className="news-page-content">
                        {selected && (
                            <article className="news-page-article">
                                <header className="news-page-article-header">
                                    <p className="news-page-article-date">{formatDate(selected.published_at)}</p>
                                    <h2 className="news-page-article-title">{selected.title}</h2>
                                    <p className="news-page-article-author">Posted by {selected.author_name}</p>
                                    {selected.forum_thread_id && (
                                        <a href="/" className="news-page-discuss">
                                            💬 Discuss in Forum
                                        </a>
                                    )}
                                </header>
                                <div className="news-page-article-body">
                                    {selected.body.split('\n').map((line, i) => (
                                        line.trim() === ''
                                            ? <div key={i} className="news-page-spacer" />
                                            : <p key={i}>{line}</p>
                                    ))}
                                </div>
                            </article>
                        )}
                    </div>
                </div>
            )}

            {/* Footer */}
            <div className="news-page-footer">
                <span>© 2026 Talaran · Alpha</span>
                <span>·</span>
                <Link to="/" className="news-page-footer-link">Play the Game</Link>
            </div>
        </div>
    )
}