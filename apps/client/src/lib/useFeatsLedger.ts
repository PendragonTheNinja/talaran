import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from './api'
import { getSocket } from './socket'

/**
 * The feats ledger, kept live (server services/feats.ts): read once, then moved
 * by the stat and XP deltas the server pushes, and re-read when a feat is
 * earned or a bar reaches its target. Shared by the Feats panel and the pinned
 * feat (PinnedFeat.tsx), so both count the same way.
 */

export interface Feat {
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

export interface FeatsData {
    feats: Feat[]
    earnedCount: number
    totalCount: number
    titles: string[]
    badges: { key: string; glyph: string | null }[]
    wornTitle: string | null
    wornBadge: string | null
}


export function useFeatsLedger() {
    const [data, setData] = useState<FeatsData | null>(null)
    const [error, setError] = useState('')

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

    return { data, setData, error, load }
}
