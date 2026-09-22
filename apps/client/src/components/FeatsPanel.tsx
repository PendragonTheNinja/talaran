import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { getSocket } from '../lib/socket'
import Badge from './Badge'
import './FeatsPanel.css'

interface Feat {
    slug: string
    name: string
    description: string
    title: string | null
    badge: string | null
    badgeKey: string | null
    category: string
    isHidden: boolean
    earnedAt: string | null
    progress: number
    target: number
    criterionKind: string
    criterionTarget: string | null
}

interface FeatsData {
    feats: Feat[]
    earnedCount: number
    totalCount: number
    titles: string[]
    badges: { key: string; glyph: string | null }[]
    wornTitle: string | null
    wornBadge: string | null
}

/** 1,000 rather than 1000. Long counters are the whole point of some of these. */
const num = (n: number) => n.toLocaleString()

export default function FeatsPanel() {
    const [data, setData] = useState<FeatsData | null>(null)
    const [error, setError] = useState('')
    const [showEarned, setShowEarned] = useState(true)
    /**
     * Collapsed by category.
     *
     * Fifty feats in one scroll is a wall. Everything starts closed except the
     * categories with something still to do in them, so opening the panel shows
     * you what is within reach rather than the full history.
     */
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
    const [touched, setTouched] = useState(false)

    const load = useCallback(() => {
        apiFetch<FeatsData>('/api/feats')
            .then(setData)
            .catch(() => setError('Could not reach the ledger.'))
    }, [])

    useEffect(() => { load() }, [load])

    // A feat earned mid-session should appear without a refresh. The socket
    // event fires from the tick, so the panel just re-reads.
    useEffect(() => {
        const onEarned = () => load()
        window.addEventListener('talaran:feat-earned', onEarned)
        return () => window.removeEventListener('talaran:feat-earned', onEarned)
    }, [load])

    /**
     * Live counters.
     *
     * The server pushes the delta it just wrote, not a fresh page of feats, so
     * chopping a log moves First Timber here and now without a request. Two
     * cases send us back to the server, and only those two:
     *
     *   - a bar reaching its target, because a feat is EARNED by evaluation on
     *     the server and never by the client deciding it has been. The re-read
     *     is what performs that evaluation.
     *   - a level up, which moves the kinds no single delta can describe
     *     (total level, breadth across trades).
     *
     * Everything else is arithmetic on numbers we already have.
     */
    useEffect(() => {
        const socket = getSocket()
        if (!socket) return

        /** Apply a change to matching feats; re-read if one of them just arrived. */
        const bump = (
            matches: (feat: Feat) => boolean,
            next: (feat: Feat) => number,
        ) => {
            let reachedTarget = false
            setData(current => {
                if (!current) return current
                const feats = current.feats.map(feat => {
                    if (feat.earnedAt || !matches(feat)) return feat
                    const progress = Math.min(next(feat), feat.target)
                    if (progress === feat.progress) return feat
                    if (progress >= feat.target) reachedTarget = true
                    return { ...feat, progress }
                })
                return { ...current, feats }
            })
            if (reachedTarget) load()
        }

        const onStats = (payload: { stats: Record<string, number> }) => {
            const deltas = payload?.stats
            if (!deltas) return
            bump(
                feat => feat.criterionKind === 'stat'
                    && !!feat.criterionTarget
                    && deltas[feat.criterionTarget] !== undefined,
                feat => feat.progress + Number(deltas[feat.criterionTarget as string] || 0),
            )
        }

        const onSkillXp = (payload: { skillName: string; level: number; leveledUp: boolean }) => {
            if (!payload?.skillName) return
            // A skill feat's progress IS the level, so it is set rather than added to.
            bump(
                feat => feat.criterionKind === 'skill' && feat.criterionTarget === payload.skillName,
                () => payload.level,
            )
            if (payload.leveledUp) load()
        }

        socket.on('stats_changed', onStats)
        socket.on('skill_xp_changed', onSkillXp)
        return () => {
            socket.off('stats_changed', onStats)
            socket.off('skill_xp_changed', onSkillXp)
        }
    }, [load])

    const wear = async (what: 'title' | 'badge', value: string | null) => {
        try {
            await apiFetch(`/api/feats/${what}`, {
                method: 'POST',
                body: JSON.stringify(what === 'title' ? { title: value } : { badge: value }),
            })
            load()
            // The Skills header shows the title, and it is a sibling panel.
            window.dispatchEvent(new CustomEvent('talaran:worn-changed'))
        } catch (err: any) {
            window.dispatchEvent(new CustomEvent('talaran:notice', {
                detail: { message: err.message || 'That did not work.', type: 'error' },
            }))
        }
    }

    // First load only: fold away any category that is entirely finished. After
    // the player touches a header, their choices stand.
    useEffect(() => {
        if (!data || touched) return
        const done: Record<string, boolean> = {}
        for (const feat of data.feats) {
            if (done[feat.category] === undefined) done[feat.category] = true
            if (!feat.earnedAt) done[feat.category] = false
        }
        setCollapsed(done)
    }, [data, touched])

    const toggle = (category: string) => {
        setTouched(true)
        setCollapsed(c => ({ ...c, [category]: !c[category] }))
    }

    if (error) return <p className="feats-error">{error}</p>
    if (!data) return <p className="feats-empty">Opening the ledger…</p>

    const shown = showEarned ? data.feats : data.feats.filter(f => !f.earnedAt)

    // Grouped in render rather than by the server, so the ordering rule stays
    // in one place: display_order decides everything, categories just fall out.
    const groups: { category: string; feats: Feat[] }[] = []
    for (const feat of shown) {
        const last = groups[groups.length - 1]
        if (last && last.category === feat.category) last.feats.push(feat)
        else groups.push({ category: feat.category, feats: [feat] })
    }

    return (
        <div className="feats-panel">
            <div className="feats-header">
                <span className="feats-count gold-text">
                    {data.earnedCount} of {data.totalCount}
                </span>
                <button className="feats-filter" onClick={() => setShowEarned(s => !s)}>
                    {showEarned ? 'Hide earned' : 'Show all'}
                </button>
            </div>

            {/* Always shown, even with nothing to put in it.
                Hiding it until the first title was earned meant a player six
                feats in had no idea titles existed at all, and the panel gave
                them no reason to look. An empty row that says what it is for
                does more work than no row. */}
            <div className="feats-worn">
                    {/* Both worn things in one place, because "what am I showing
                        people" is a single question. A title appears where there
                        is room for a phrase; a badge appears beside your name. */}
                    <label className="feats-worn-row">
                        <span className="feats-worn-label">Title</span>
                        {data.titles.length > 0 ? (
                            <select
                                value={data.wornTitle ?? ''}
                                onChange={e => wear('title', e.target.value || null)}
                            >
                                <option value="">None</option>
                                {data.titles.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        ) : (
                            <span className="feats-worn-none">None earned yet</span>
                        )}
                    </label>

                    <div className="feats-worn-row">
                        <span className="feats-worn-label">Badge</span>
                        {data.badges.length > 0 ? (
                            <div className="feats-badge-picker">
                                <button
                                    className={`feats-badge ${!data.wornBadge ? 'on' : ''}`}
                                    title="Wear no badge"
                                    onClick={() => wear('badge', null)}
                                >&ndash;</button>
                                {data.badges.map(b => (
                                    <button
                                        key={b.key}
                                        className={`feats-badge ${data.wornBadge === b.key ? 'on' : ''}`}
                                        onClick={() => wear('badge', b.key)}
                                    ><Badge badgeKey={b.key} glyph={b.glyph} size={18} /></button>
                                ))}
                            </div>
                        ) : (
                            <span className="feats-worn-none">None earned yet</span>
                        )}
                    </div>
                </div>

            {groups.map(group => {
                const shut = !!collapsed[group.category]
                const earnedHere = group.feats.filter(f => f.earnedAt).length
                return (
                <div key={group.category} className="feats-group">
                    <button className="feats-category" onClick={() => toggle(group.category)}>
                        <span className="feats-caret">{shut ? '▶' : '▼'}</span>
                        {group.category}
                        <span className="feats-group-count">{earnedHere} / {group.feats.length}</span>
                    </button>
                    {!shut && group.feats.map(feat => {
                        const done = !!feat.earnedAt
                        const pct = Math.min(100, Math.round((feat.progress / feat.target) * 100))
                        return (
                            <div key={feat.slug} className={`feat ${done ? 'earned' : ''}`}>
                                <div className="feat-top">
                                    <span className="feat-name">{feat.name}</span>
                                    {done
                                        ? <span className="feat-tick">✦</span>
                                        : <span className="feat-progress-text">{num(feat.progress)} / {num(feat.target)}</span>}
                                </div>
                                <p className="feat-desc">{feat.description}</p>
                                {(feat.title || feat.badge) && (
                                    <p className="feat-title-note">
                                        {feat.title && <>Title: {feat.title}</>}
                                        {feat.title && feat.badge && ' · '}
                                        {feat.badgeKey && <>Badge: <Badge badgeKey={feat.badgeKey} glyph={feat.badge} /></>}
                                    </p>
                                )}
                                {!done && (
                                    <div className="feat-bar">
                                        <div className="feat-bar-fill" style={{ width: `${pct}%` }} />
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
                )
            })}

            {shown.length === 0 && (
                <p className="feats-empty">Every one of them done. There will be more.</p>
            )}
        </div>
    )
}
