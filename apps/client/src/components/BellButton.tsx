import { useEffect, useRef, useState } from 'react'
import { bellMode, onBellMode, setBellMode, unlockAudio, type BellMode } from '../lib/bell'
import './BellButton.css'

// The timer bell, beside the bot-check button (lib/bell.ts). A tap arms it for
// the next countdown only; holding it down keeps it on for every countdown;
// a tap while it is armed or on turns it off.

const HOLD_MS = 600

const TITLES: Record<BellMode, string> = {
    off: 'Timer bell: off. Tap to ring once when this countdown ends. Hold to ring at every one.',
    once: 'Timer bell: rings once, at the end of this countdown. Tap to turn it off.',
    always: 'Timer bell: rings at the end of every countdown. Tap to turn it off.',
}

export default function BellButton() {
    const [mode, setMode] = useState<BellMode>(bellMode)
    const holdTimer = useRef<number | null>(null)
    const held = useRef(false)

    useEffect(() => onBellMode(setMode), [])

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
    )
}
