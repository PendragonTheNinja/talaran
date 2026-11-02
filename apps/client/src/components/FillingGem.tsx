import { useEffect, useState } from 'react'
import { getItemIcon } from '../lib/items'
import './FillingGem.css'

/**
 * A gem part-way through filling at the Rift: the cut stone, with the charged
 * stone it is becoming laid over it and revealed from the bottom up as the
 * light goes in (Nathan, 2026-11-02). 3 of 100 Talar shows a sliver of the Lit
 * Quartz at the base; 75 shows three quarters. Used for the pack's pinned tile
 * (LeftPanel) and the stone in hand in the Rift scene (GameView).
 *
 * The fraction is measured against the stone itself, not the picture's box:
 * gem art sits in the middle of a mostly transparent square, so 25% of the
 * box barely reached the gem. Each picture's opaque top and bottom are found
 * once (a canvas read of its alpha) and cached. The edge is a short soft
 * gradient, so it reads as light rising rather than a cut.
 *
 * The names come from the server (services/talar.ts chargedNameFor), never
 * guessed here. If the charged picture is missing, only the cut stone shows.
 */

/** Opaque rows of a picture, as fractions of its height: [top, bottom]. */
const boundsCache = new Map<string, Promise<[number, number]>>()

function opaqueBounds(src: string): Promise<[number, number]> {
    let p = boundsCache.get(src)
    if (p) return p
    p = new Promise(resolve => {
        const img = new Image()
        img.onload = () => {
            try {
                const w = img.naturalWidth, h = img.naturalHeight
                const canvas = document.createElement('canvas')
                canvas.width = w
                canvas.height = h
                const ctx = canvas.getContext('2d', { willReadFrequently: true })
                if (!ctx || !w || !h) return resolve([0, 1])
                ctx.drawImage(img, 0, 0)
                const data = ctx.getImageData(0, 0, w, h).data
                const rowOpaque = (y: number) => {
                    for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 24) return true
                    return false
                }
                let top = 0, bottom = h - 1
                while (top < h && !rowOpaque(top)) top++
                while (bottom > top && !rowOpaque(bottom)) bottom--
                resolve(top >= h ? [0, 1] : [top / h, (bottom + 1) / h])
            } catch {
                resolve([0, 1])
            }
        }
        img.onerror = () => resolve([0, 1])
        img.src = src
    })
    boundsCache.set(src, p)
    return p
}

/** How soft the rising edge is, as a fraction of the stone's height. */
const EDGE = 0.06

export default function FillingGem({ cutName, chargedName, fraction, className }: {
    cutName: string
    chargedName: string | null | undefined
    /** 0 to 1. */
    fraction: number
    /** Sizes the box; both pictures fill it. */
    className?: string
}) {
    const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0))
    const lightSrc = chargedName ? getItemIcon(chargedName) : null
    const [bounds, setBounds] = useState<[number, number]>([0, 1])

    useEffect(() => {
        if (!lightSrc) return
        let live = true
        opaqueBounds(lightSrc).then(b => { if (live) setBounds(b) })
        return () => { live = false }
    }, [lightSrc])

    // The level of the light, from the top of the box, in percent: the stone's
    // bottom at 0, its top at 1. Full means fully shown, edge and all.
    const [top, bottom] = bounds
    const level = f >= 1 ? -EDGE * 100 : (bottom - f * (bottom - top)) * 100
    const soft = (bottom - top) * EDGE * 100
    const mask = `linear-gradient(to bottom, transparent ${(level - soft).toFixed(1)}%, black ${level.toFixed(1)}%)`

    return (
        <span
            className={`filling-gem ${className ?? ''}`}
            role="img"
            aria-label={`${cutName}, ${Math.round(f * 100)}% filled`}
        >
            <img src={getItemIcon(cutName)} alt="" className="filling-gem-base" draggable={false} />
            {lightSrc && f > 0 && (
                <img
                    src={lightSrc}
                    alt=""
                    className="filling-gem-light"
                    draggable={false}
                    style={{ maskImage: mask, WebkitMaskImage: mask }}
                    onError={e => { e.currentTarget.style.display = 'none' }}
                />
            )}
        </span>
    )
}
