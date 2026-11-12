import { useEffect, useState } from 'react'
import { BELL_EVENTS, bellEvents, onBellEvents, setBellEvent, type BellEvent } from '../lib/bell'
import './BellEventsPicker.css'

/**
 * Which moments ring the bell (lib/bell.ts), as tick boxes. Shown from the
 * arrow on the bell and in Settings > Game; both read and write the same
 * setting, kept on this device.
 */
export default function BellEventsPicker() {
    const [chosen, setChosen] = useState<BellEvent[]>(bellEvents)
    useEffect(() => onBellEvents(setChosen), [])
    return (
        <div className="bell-events" role="group" aria-label="What rings the bell">
            {BELL_EVENTS.map(e => (
                <label key={e.id} className="bell-event">
                    <input
                        type="checkbox"
                        checked={chosen.includes(e.id)}
                        onChange={ev => setBellEvent(e.id, ev.target.checked)}
                    />
                    <span className="bell-event-text">
                        <span className="bell-event-label">{e.label}</span>
                        <span className="bell-event-hint">{e.hint}</span>
                    </span>
                </label>
            ))}
        </div>
    )
}
