import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Talar } from '../lib/talar'
import './SpellCastPopup.css'

export interface SpellCast {
    spell: string
    message: string
    xp: number
    talar: Talar
}

/**
 * What a cast did, in the level-up popup's manner. It stays until closed (the
 * button, the ✕, Escape or a click outside): the scene's log line it replaced
 * was gone in five seconds, behind the spellbook. Portalled to the body so the
 * spellbook's modal can never sit over it.
 */
export default function SpellCastPopup({ cast, onClose }: { cast: SpellCast; onClose: () => void }) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    return createPortal(
        <div className="spellcast-backdrop" onClick={onClose}>
            <div className="spellcast-card" role="dialog" aria-label={`${cast.spell} cast`} onClick={e => e.stopPropagation()}>
                <button className="spellcast-x" aria-label="Close" onClick={onClose}>✕</button>
                <div className="spellcast-rays" />
                <p className="spellcast-title">The light answers</p>
                <div className="spellcast-icon-wrap">
                    <img src="/images/skills/TalarSkill.png" alt="" aria-hidden="true" className="spellcast-icon"
                        onError={e => { e.currentTarget.style.display = 'none' }} />
                </div>
                <p className="spellcast-name">{cast.spell}</p>
                <p className="spellcast-message">{cast.message}</p>
                <p className="spellcast-xp">+{cast.xp.toLocaleString()} Talar experience</p>
                <p className="spellcast-reservoir tabular-num">
                    {Math.floor(cast.talar.current).toLocaleString()} / {Math.floor(cast.talar.max).toLocaleString()} Talar left in you
                </p>
                <button className="spellcast-ok" onClick={onClose}>Close</button>
            </div>
        </div>,
        document.body,
    )
}
