import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * An island's full map, zoomed and panned in its frame (Nathan, 2026-11-26).
 * Scroll to zoom toward the pointer, drag to move about, pinch on a phone,
 * double-click or double-tap to look closer (or back out), and the buttons
 * in the corner for anyone who prefers them. The picture never leaves its
 * frame, and zooming out all the way puts it back as it opened.
 */

const MIN = 1
const MAX = 5
const STEP = 1.5
const DOUBLE_ZOOM = 2.5

interface View { s: number; x: number; y: number }

export default function ZoomableMap({ src, alt }: { src: string; alt: string }) {
    const frame = useRef<HTMLDivElement>(null)
    const [view, setView] = useState<View>({ s: 1, x: 0, y: 0 })
    const pointers = useRef(new Map<number, { x: number; y: number }>())
    const pinch = useRef<{ dist: number; s: number } | null>(null)
    const lastTap = useRef(0)

    /** Keep the scaled picture covering the frame. */
    const clamp = useCallback((v: View): View => {
        const el = frame.current
        if (!el) return v
        const w = el.clientWidth, h = el.clientHeight
        const s = Math.min(MAX, Math.max(MIN, v.s))
        return {
            s,
            x: Math.min(0, Math.max(w - w * s, v.x)),
            y: Math.min(0, Math.max(h - h * s, v.y)),
        }
    }, [])

    /** Zoom to `s`, keeping the frame point (px, py) where it is. */
    const zoomAt = useCallback((s: number, px: number, py: number) => {
        setView(v => {
            const next = Math.min(MAX, Math.max(MIN, s))
            const k = next / v.s
            return clamp({ s: next, x: px - (px - v.x) * k, y: py - (py - v.y) * k })
        })
    }, [clamp])

    const local = (clientX: number, clientY: number) => {
        const r = frame.current!.getBoundingClientRect()
        return { x: clientX - r.left, y: clientY - r.top }
    }

    // The wheel, as a non-passive listener so the page does not scroll too.
    useEffect(() => {
        const el = frame.current
        if (!el) return
        const onWheel = (e: WheelEvent) => {
            e.preventDefault()
            const p = local(e.clientX, e.clientY)
            setView(v => {
                const next = Math.min(MAX, Math.max(MIN, v.s * Math.exp(-e.deltaY * 0.0015)))
                const k = next / v.s
                return clamp({ s: next, x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k })
            })
        }
        el.addEventListener('wheel', onWheel, { passive: false })
        return () => el.removeEventListener('wheel', onWheel)
    }, [clamp])

    const onPointerDown = (e: React.PointerEvent) => {
        frame.current?.setPointerCapture(e.pointerId)
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()]
            pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), s: view.s }
        } else if (pointers.current.size === 1 && e.pointerType !== 'mouse') {
            // A double tap on a phone, as a double click is on a desktop.
            const now = Date.now()
            if (now - lastTap.current < 300) {
                const p = local(e.clientX, e.clientY)
                zoomAt(view.s > 1.05 ? 1 : DOUBLE_ZOOM, p.x, p.y)
                lastTap.current = 0
            } else {
                lastTap.current = now
            }
        }
    }

    const onPointerMove = (e: React.PointerEvent) => {
        const prev = pointers.current.get(e.pointerId)
        if (!prev) return
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (pointers.current.size === 2 && pinch.current) {
            const [a, b] = [...pointers.current.values()]
            const mid = local((a.x + b.x) / 2, (a.y + b.y) / 2)
            zoomAt(pinch.current.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist, mid.x, mid.y)
            return
        }
        if (pointers.current.size === 1) {
            const dx = e.clientX - prev.x, dy = e.clientY - prev.y
            setView(v => clamp({ ...v, x: v.x + dx, y: v.y + dy }))
        }
    }

    const onPointerUp = (e: React.PointerEvent) => {
        pointers.current.delete(e.pointerId)
        if (pointers.current.size < 2) pinch.current = null
    }

    const centre = () => {
        const el = frame.current
        return { x: (el?.clientWidth ?? 0) / 2, y: (el?.clientHeight ?? 0) / 2 }
    }

    return (
        <div
            ref={frame}
            className={`map-zoom ${view.s > 1.01 ? 'zoomed' : ''}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={e => {
                const p = local(e.clientX, e.clientY)
                zoomAt(view.s > 1.05 ? 1 : DOUBLE_ZOOM, p.x, p.y)
            }}
        >
            <img
                src={src}
                alt={alt}
                className="map-image"
                draggable={false}
                style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
            />
            <div className="map-zoom-controls" onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
                <button type="button" aria-label="Zoom in" title="Zoom in" disabled={view.s >= MAX}
                    onClick={() => { const c = centre(); zoomAt(view.s * STEP, c.x, c.y) }}>+</button>
                <button type="button" aria-label="Zoom out" title="Zoom out" disabled={view.s <= MIN}
                    onClick={() => { const c = centre(); zoomAt(view.s / STEP, c.x, c.y) }}>−</button>
                <button type="button" aria-label="Whole map" title="Whole map" disabled={view.s <= MIN}
                    onClick={() => setView({ s: 1, x: 0, y: 0 })}>⤢</button>
            </div>
        </div>
    )
}
