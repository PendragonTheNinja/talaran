import { useEffect, useRef, useState } from 'react'
import BellEventsPicker from './BellEventsPicker'
import { bellMode, onBellMode, setBellMode, unlockAudio, type BellMode } from '../lib/bell'
import './BellButton.css'

// The timer bell, beside the bot-check button (lib/bell.ts). A tap arms it for
// the next countdown only; holding it down keeps it on for every countdown;
// a tap while it is armed or on turns it off.

const HOLD_MS = 600

const TITLES: Record<BellMode, string> = {
    off: 'Bell: off. Tap to ring once, the next time. Hold to ring every time. The arrow chooses what rings it.',
    once: 'Bell: rings once, the next time. Tap to turn it off.',
    always: 'Bell: rings every time. Tap to turn it off.',
}

export default function BellButton() {
    const [mode, setMode] = useState<BellMode>(bellMode)
    const [picking, setPicking] = useState(false)
    const holdTimer = useRef<number | null>(null)
    const held = useRef(false)
    const pickerRef = useRef<HTMLDivElement>(null)

    useEffect(() => onBellMode(setMode), [])

    // The checklist closes on a press anywhere outside it (and outside its arrow).
    useEffect(() => {
        if (!picking) return
        const away = (e: PointerEvent) => {
            const t = e.target as Node
            if (pickerRef.current?.contains(t) || (t as HTMLElement).closest?.('.bell-events-toggle')) return
            setPicking(false)
        }
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPicking(false) }
        document.addEventListener('pointerdown', away)
        document.addEventListener('keydown', esc)
        return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc) }
    }, [picking])

    const press = () => {
        // A browser plays nothing until the page has been touched; this is that touch.
        unlockAudio()
        held.current = false
        holdTimer.current = window.setTimeout(() => {
            held.current = true
            setBellMode('always')
            navigator.vibrate?.(30)
        }, HOLD_MS)
    }

    const release = () => {
        if (holdTimer.current !== null) window.clearTimeout(holdTimer.current)
        holdTimer.current = null
        if (held.current) return          // the hold already decided
        setBellMode(bellMode() === 'off' ? 'once' : 'off')
    }

    const cancel = () => {
        if (holdTimer.current !== null) window.clearTimeout(holdTimer.current)
        holdTimer.current = null
    }

    return (
        <>
            <button
                className={`bell-fab bell-${mode}`}
                onPointerDown={press}
                onPointerUp={release}
                onPointerLeave={cancel}
                onPointerCancel={cancel}
                onContextMenu={e => e.preventDefault()}
                onKeyDown={e => {
                    // Keyboard: Enter or Space taps; Shift with either holds.
                    if (e.key !== 'Enter' && e.key !== ' ') return
                    e.preventDefault()
                    unlockAudio()
                    if (e.shiftKey) setBellMode('always')
                    else setBellMode(bellMode() === 'off' ? 'once' : 'off')
                }}
                aria-label={TITLES[mode]}
                aria-pressed={mode !== 'off'}
                title={TITLES[mode]}
            >
                <span className="bell-icon" aria-hidden="true">🔔</span>
                {mode === 'always' && <span className="bell-mark" aria-hidden="true">∞</span>}
                {mode === 'once' && <span className="bell-mark" aria-hidden="true">1</span>}
            </button>
            <button
                className={`bell-events-toggle ${picking ? 'open' : ''}`}
                onClick={() => setPicking(p => !p)}
                aria-expanded={picking}
                aria-label="Choose what rings the bell"
                title="Choose what rings the bell"
            >
                <span aria-hidden="true">{picking ? '▾' : '▴'}</span>
            </button>
            {picking && (
                <div className="bell-events-popover" ref={pickerRef}>
                    <div className="bell-events-title">Ring the bell for</div>
                    <BellEventsPicker />
                    <p className="bell-events-foot">The bell itself decides when: tap for the next one, hold for every one.</p>
                </div>
            )}
        </>
    )
}
