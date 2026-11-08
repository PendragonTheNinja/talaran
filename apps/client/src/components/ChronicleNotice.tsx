import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { onSocket } from '../lib/socket'
import { openChronicle } from '../lib/chronicleLink'
import './CrierNotice.css'

// "Wenna sang of you" (docs/chronicle-spec.md §2 Elsewhere, step 4): a small
// card on the scene when a page has named this player, at midnight or at their
// next login. Kept until they read it or put it away, on every device
// (players.chronicle_seen_day). It wears the Crier's card, low on the scene so
// the two never sit on each other.

interface Notice { dayKey: string; title: string; inLines: boolean }

export default function ChronicleNotice() {
    const [notice, setNotice] = useState<Notice | null>(null)

    const load = useCallback(() => {
        apiFetch<{ notice: Notice | null }>('/api/chronicle/notice')
            .then(d => setNotice(d.notice))
            .catch(() => { })
    }, [])

    useEffect(() => { load() }, [load])
    useEffect(() => onSocket('chronicle_named', () => load()), [load])

    if (!notice) return null

    const putAway = () => {
        setNotice(null)
        apiFetch('/api/chronicle/notice/seen', { method: 'POST', body: JSON.stringify({ day: notice.dayKey }) }).catch(() => { })
    }

    return (
        <div className="crier-card crier-notice chronicle-notice" role="status">
            <div className="crier-head">
                <span className="crier-kicker">🪶 The tidings</span>
                <button className="crier-x" onClick={putAway} aria-label="Close">×</button>
            </div>
            <p className="crier-q">
                {notice.inLines
                    ? `Wenna sang of you in the tidings for the ${notice.title}.`
                    : `Wenna named you in the long roll for the ${notice.title}.`}
            </p>
            <div className="crier-foot">
                <button className="crier-link" onClick={putAway}>Not now</button>
                <button className="btn btn-gold" onClick={() => { openChronicle(notice.dayKey); putAway() }}>Read it</button>
            </div>
        </div>
    )
}
