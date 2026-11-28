import { useEffect, useState, type ReactNode } from 'react'
import './Cosmetics.css'

/**
 * Supporter cosmetics and pets as drawn (server services/cosmetics.ts and
 * services/pets.ts). Every picture is a file at a fixed path, listed in
 * docs/art-list.md. Until a file exists, each piece falls back to something
 * that still reads: a pet to its emoji, a frame to a colored border, a
 * backdrop to a gradient, an emote to its :word:, a sign to a painted board.
 * Art that arrives later simply appears; nothing here needs to change.
 */

const frameSrc = (key: string) => `/images/frames/${key}.png`
const backdropSrc = (key: string) => `/images/backdrops/${key}.jpg`
const signSrc = (key: string) => `/images/shops/sign-${key}.png`
const emoteSrc = (key: string) => `/images/emotes/${key}.png`
const petSpriteSrc = (key: string) => `/images/pets/${key}.png`
const petBadgeSrc = (key: string) => `/images/badges/pet-${key}.png`

// One probe a path, shared by every component that asks: the answer, and its width and height.
const probes = new Map<string, Promise<{ ok: boolean; w: number; h: number }>>()
function probe(src: string) {
    let p = probes.get(src)
    if (!p) {
        p = new Promise(resolve => {
            const img = new Image()
            img.onload = () => resolve({ ok: true, w: img.naturalWidth, h: img.naturalHeight })
            img.onerror = () => resolve({ ok: false, w: 0, h: 0 })
            img.src = src
        })
        probes.set(src, p)
    }
    return p
}

function useProbe(src: string | null) {
    const [state, setState] = useState<{ src: string; ok: boolean; w: number; h: number } | null>(null)
    useEffect(() => {
        let live = true
        if (src) probe(src).then(s => { if (live) setState({ src, ...s }) })
        return () => { live = false }
    }, [src])
    // An answer for an earlier path is no answer for this one.
    return state && state.src === src ? state : null
}

/**
 * A worn pet beside a name: its sprite strip played as a short loop (frames
 * side by side, each as wide as the strip is tall), or its emoji until the
 * sprite exists. Players who prefer less motion see the first frame only.
 */
export function PetMark({ petKey, emoji, size = 18, title }: { petKey: string | null | undefined; emoji?: string | null; size?: number; title?: string }) {
    const s = useProbe(petKey ? petSpriteSrc(petKey) : null)
    if (!petKey) return null
    if (s?.ok && s.h > 0) {
        const frames = Math.max(1, Math.round(s.w / s.h))
        return (
            <span
                className="pet-mark pet-mark-sprite"
                title={title}
                style={{
                    width: size, height: size,
                    backgroundImage: `url(${petSpriteSrc(petKey)})`,
                    backgroundSize: `${size * frames}px ${size}px`,
                    ['--pet-frames' as string]: frames,
                    ['--pet-strip' as string]: `-${size * frames}px`,
                }}
            />
        )
    }
    return <span className="pet-mark" title={title} style={{ fontSize: Math.round(size * 0.85) }}>{emoji || '🐾'}</span>
}

/** A pet's badge for a list: its badge art, or its emoji on a dark round. */
export function PetBadge({ petKey, emoji, size = 40, dim = false }: { petKey: string; emoji: string; size?: number; dim?: boolean }) {
    const s = useProbe(petBadgeSrc(petKey))
    return (
        <span className={`pet-badge${dim ? ' pet-badge-dim' : ''}`} style={{ width: size, height: size }}>
            {s?.ok
                ? <img src={petBadgeSrc(petKey)} alt="" width={size} height={size} />
                : <span style={{ fontSize: Math.round(size * 0.55) }}>{emoji}</span>}
        </span>
    )
}

/**
 * An avatar in its frame. The frame art is drawn over the picture, its middle
 * clear (docs/art-list.md: border within the outer tenth). Until the art
 * exists the frame is a CSS border in the frame's colors.
 */
export function FramedAvatar({ frame, children, size }: { frame: string | null | undefined; children: ReactNode; size: number }) {
    const s = useProbe(frame ? frameSrc(frame) : null)
    if (!frame) return <>{children}</>
    return (
        <span className={`framed-avatar${s?.ok ? '' : ` frame-fallback frame-${frame}`}`} style={{ width: size, height: size }}>
            {children}
            {s?.ok && <img className="framed-avatar-frame" src={frameSrc(frame)} alt="" />}
        </span>
    )
}

/** The picture behind the top of a profile, or a gradient until it exists. */
export function ProfileBackdrop({ backdrop }: { backdrop: string | null | undefined }) {
    const s = useProbe(backdrop ? backdropSrc(backdrop) : null)
    if (!backdrop) return null
    return (
        <div
            className={`profile-backdrop${s?.ok ? '' : ` backdrop-fallback backdrop-${backdrop}`}`}
            style={s?.ok ? { backgroundImage: `url(${backdropSrc(backdrop)})` } : undefined}
            aria-hidden
        />
    )
}

/** One emote in a chat line: the picture, or the typed :word: if it is missing. */
export function Emote({ name }: { name: string }) {
    const [failed, setFailed] = useState(false)
    if (failed) return <>{`:${name}:`}</>
    return <img className="chat-emote" src={emoteSrc(name)} alt={`:${name}:`} title={`:${name}:`} onError={() => setFailed(true)} />
}

/**
 * A shop's sign behind its name, and an awning above it. The sign falls back
 * to a painted board; the awning is drawn in CSS and needs no art.
 */
export function ShopFront({ sign, awning, children }: { sign: string | null | undefined; awning: string | null | undefined; children: ReactNode }) {
    const s = useProbe(sign ? signSrc(sign) : null)
    return (
        <span className={`shop-front${sign ? ` shop-sign shop-sign-${sign}` : ''}${sign && !s?.ok ? ' shop-sign-fallback' : ''}`}
            style={sign && s?.ok ? { backgroundImage: `url(${signSrc(sign)})` } : undefined}>
            {awning && <span className={`shop-awning shop-awning-${awning}`} aria-hidden />}
            {children}
        </span>
    )
}
