import { useState, useEffect, useCallback, useRef } from 'react'
import { onSocket } from '../lib/socket'
import './UpdateBar.css'

/**
 * Offers a refresh once the site has been rebuilt since this tab loaded.
 *
 * Each build carries a stamp (vite.config.ts) and writes it to /version.json.
 * The tab asks for that file when its socket connects again (a deploy restarts
 * the server, so every tab reconnects), when it comes back into view, and every
 * ten minutes. A different stamp means this tab is running old code against a
 * new server: the Town Crier's polls went unseen for a whole evening that way
 * (2026-11-05). The question is never cached (no-store, and a fresh address).
 */

const EVERY_MS = 10 * 60_000

async function siteBuild(): Promise<string | null> {
    try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return null
        const body = await res.json()
        return typeof body?.build === 'string' ? body.build : null
    } catch {
        return null
    }
}

export default function UpdateBar() {
    const [stale, setStale] = useState(false)
    const [hidden, setHidden] = useState(false)
    const asking = useRef(false)

    const check = useCallback(async () => {
        if (__TALARAN_BUILD__ === 'dev' || asking.current) return
        asking.current = true
        const build = await siteBuild()
        asking.current = false
        if (build && build !== __TALARAN_BUILD__) setStale(true)
    }, [])

    useEffect(() => onSocket('connect', () => { void check() }), [check])
    useEffect(() => {
        const onVisible = () => { if (document.visibilityState === 'visible') void check() }
        document.addEventListener('visibilitychange', onVisible)
        const t = setInterval(() => { void check() }, EVERY_MS)
        return () => { document.removeEventListener('visibilitychange', onVisible); clearInterval(t) }
    }, [check])

    if (!stale || hidden) return null
    return (
        <div className="update-bar" role="status">
            <span className="update-bar-text">Talaran has been updated.</span>
            <button className="btn btn-gold update-bar-btn" onClick={() => window.location.reload()}>Refresh</button>
            <button className="update-bar-x" onClick={() => setHidden(true)} aria-label="Later">×</button>
        </div>
    )
}
