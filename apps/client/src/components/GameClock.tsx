import { useEffect, useState } from 'react'
import { formatGameTime } from '../lib/time'

/**
 * The time in Talaran, which is Eastern (lib/time.ts), on the island map
 * (forum, 2026-11-13: a fire lit "at 18:00" means nothing without it).
 */
export default function GameClock() {
    const [now, setNow] = useState(() => new Date())
    useEffect(() => {
        const t = window.setInterval(() => setNow(new Date()), 15_000)
        return () => window.clearInterval(t)
    }, [])
    return (
        <div className="map-clock" title="Every clock in Talaran keeps this time">
            <span className="map-clock-label">Talaran time</span>
            <span className="map-clock-time">{formatGameTime(now)}</span>
        </div>
    )
}
