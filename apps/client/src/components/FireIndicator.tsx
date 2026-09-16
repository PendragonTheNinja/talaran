import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { getItemIcon } from '../lib/items'
import './FireIndicator.css'

interface Fuel {
    exists: boolean
    isTemporary: boolean
    fuelSecondsLeft: number
    fuelMaxSeconds: number
    nextFuel: { itemName: string; held: number; cost: number } | null
}

/**
 * Four frames, not a smooth bar.
 *
 * A fire burning down reads at a glance in a way a percentage does not, and
 * thresholds mean the art only has to work at four states rather than at every
 * value between them. Embers is deliberately a state rather than an empty box:
 * "your fire is out" is the single most useful thing this can say.
 */
function frameFor(secondsLeft: number, max: number): { key: string; label: string } {
    if (secondsLeft <= 0) return { key: 'out', label: 'The fire is out' }
    const share = max > 0 ? secondsLeft / max : 0
    if (share > 0.6) return { key: 'high', label: 'Burning well' }
    if (share > 0.3) return { key: 'steady', label: 'Burning steadily' }
    return { key: 'low', label: 'Burning low' }
}

function fmtLeft(seconds: number): string {
    if (seconds <= 0) return 'out'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m`
    return `${seconds}s`
}

/**
 * Shown beside the cooking scene while a cook is running.
 *
 * Counts down locally between fetches. The server is the authority and refuels
 * on its own, so this only has to look right; a refuel is picked up on the next
 * poll and the frame jumps back up, which is the correct thing to see happen.
 */
export default function FireIndicator() {
    const [fuel, setFuel] = useState<Fuel | null>(null)
    const [left, setLeft] = useState(0)
    const [failed, setFailed] = useState(false)

    const load = useCallback(() => {
        apiFetch<Fuel>('/api/workstations/cooking')
            .then(f => { setFuel(f); setLeft(f.fuelSecondsLeft) })
            .catch(() => setFuel(null))
    }, [])

    useEffect(() => {
        load()
        // Slow poll: the only thing that changes without the player acting is
        // the clock, and that is counted down locally.
        const t = setInterval(load, 30000)
        return () => clearInterval(t)
    }, [load])

    useEffect(() => {
        const t = setInterval(() => setLeft(v => (v > 0 ? v - 1 : 0)), 1000)
        return () => clearInterval(t)
    }, [])

    // No hearth of your own here means you are on somebody else's fire, and
    // they keep it in. Say so rather than render nothing: an empty space where
    // a fire should be reads as broken.
    if (!fuel) return null
    if (!fuel.exists) {
        return (
            <div className="fire-indicator fire-borrowed" title="You are cooking on a fire somebody else keeps in">
                <span className="fire-glyph">▲</span>
                <div className="fire-lines">
                    <span className="fire-left">Their fire</span>
                    <span className="fire-next">costs you no wood</span>
                </div>
            </div>
        )
    }

    const frame = frameFor(left, fuel.fuelMaxSeconds)

    return (
        <div className="fire-indicator" title={frame.label}>
            {failed ? (
                <span className={`fire-glyph fire-${frame.key}`}>{left > 0 ? '▲' : '·'}</span>
            ) : (
                <img
                    className="fire-art"
                    src={`/images/fire/${frame.key}.png`}
                    alt={frame.label}
                    onError={() => setFailed(true)}
                />
            )}

            <div className="fire-lines">
                <span className="fire-left">{fmtLeft(left)}</span>
                {/* The wood that goes on next, and how much of it is left. Worst
                    first, matching what the hearth actually burns, so this is the
                    number that is about to go down. */}
                {fuel.nextFuel ? (
                    <span className="fire-next">
                        <img
                            src={getItemIcon(fuel.nextFuel.itemName)}
                            alt={fuel.nextFuel.itemName}
                            onError={e => { e.currentTarget.style.display = 'none' }}
                        />
                        {fuel.nextFuel.held}
                    </span>
                ) : (
                    <span className="fire-next fire-none">no wood</span>
                )}
            </div>
        </div>
    )
}
