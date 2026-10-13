import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../lib/api'
import { AVATAR_MAX_UPLOAD_BYTES, AVATAR_TYPES, announceAvatar, avatarSrc } from '../lib/avatar'
import './SettingsPanel.css'
import './AvatarSetting.css'

/**
 * Your picture (Settings > Profile): shown beside your forum posts, on your
 * profile and on your side of a fight.
 *
 * Choosing a file opens a square cropper: drag to move, the slider to zoom.
 * The ORIGINAL file is sent with the square chosen on it, in the original's
 * pixels, and the server does the cut (services/avatars.ts), so an animated
 * GIF stays animated and nothing the browser made is trusted.
 */

const VIEW = 240
const MAX_ZOOM = 4

interface Source { file: File; url: string; w: number; h: number }

export default function AvatarSetting() {
    const [current, setCurrent] = useState<string | null>(null)
    const [blocked, setBlocked] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const [source, setSource] = useState<Source | null>(null)
    const [zoom, setZoom] = useState(1)
    const [offset, setOffset] = useState({ x: 0, y: 0 })
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const fileRef = useRef<HTMLInputElement>(null)
    const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)

    useEffect(() => {
        apiFetch<{ avatarUrl?: string | null; avatarBlocked?: boolean }>('/api/settings')
            .then(d => { setCurrent(d.avatarUrl ?? null); setBlocked(!!d.avatarBlocked) })
            .catch(() => { })
            .finally(() => setLoaded(true))
    }, [])

    // Release the preview's object URL when it is replaced or the panel closes.
    useEffect(() => () => { if (source) URL.revokeObjectURL(source.url) }, [source])

    const scaleFor = (src: Source, z: number) => (VIEW / Math.min(src.w, src.h)) * z

    /** Keep the image covering the whole square. */
    const clamp = (src: Source, s: number, x: number, y: number) => ({
        x: Math.min(0, Math.max(VIEW - src.w * s, x)),
        y: Math.min(0, Math.max(VIEW - src.h * s, y)),
    })

    const pick = (file: File | undefined) => {
        setError('')
        if (!file) return
        if (!AVATAR_TYPES.includes(file.type)) { setError('Use a PNG, JPEG, WebP or GIF.'); return }
        if (file.size > AVATAR_MAX_UPLOAD_BYTES) { setError('That file is over 4 MB. Try a smaller one.'); return }
        const url = URL.createObjectURL(file)
        const img = new Image()
        img.onload = () => {
            const src = { file, url, w: img.naturalWidth, h: img.naturalHeight }
            if (Math.min(src.w, src.h) < 32) { URL.revokeObjectURL(url); setError('That picture is too small.'); return }
            const s = scaleFor(src, 1)
            setSource(src)
            setZoom(1)
            // Centred to start.
            setOffset({ x: (VIEW - src.w * s) / 2, y: (VIEW - src.h * s) / 2 })
        }
        img.onerror = () => { URL.revokeObjectURL(url); setError('That file is not a picture we can read.') }
        img.src = url
    }

    const onZoom = (z: number) => {
        if (!source) return
        // Zoom about the middle of the square.
        const before = scaleFor(source, zoom), after = scaleFor(source, z)
        const cx = (VIEW / 2 - offset.x) / before, cy = (VIEW / 2 - offset.y) / before
        setZoom(z)
        setOffset(clamp(source, after, VIEW / 2 - cx * after, VIEW / 2 - cy * after))
    }

    const onPointerDown = (e: React.PointerEvent) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y }
    }
    const onPointerMove = (e: React.PointerEvent) => {
        if (!drag.current || !source) return
        const d = drag.current
        setOffset(clamp(source, scaleFor(source, zoom), d.ox + e.clientX - d.px, d.oy + e.clientY - d.py))
    }
    const onPointerUp = () => { drag.current = null }

    const cancel = () => { setSource(null); if (fileRef.current) fileRef.current.value = '' }

    const save = async () => {
        if (!source) return
        const s = scaleFor(source, zoom)
        const size = Math.max(32, Math.min(Math.floor(VIEW / s), source.w, source.h))
        const x = Math.max(0, Math.min(Math.round(-offset.x / s), source.w - size))
        const y = Math.max(0, Math.min(Math.round(-offset.y / s), source.h - size))
        setBusy(true)
        setError('')
        try {
            const res = await apiFetch<{ avatarUrl: string }>(`/api/settings/avatar?x=${x}&y=${y}&size=${size}`, {
                method: 'POST',
                headers: { 'Content-Type': source.file.type },
                body: source.file,
            })
            setCurrent(res.avatarUrl)
            announceAvatar(res.avatarUrl)
            cancel()
        } catch (err) {
            setError(err instanceof Error && err.message ? err.message : 'That did not save. Try again.')
        } finally {
            setBusy(false)
        }
    }

    const remove = async () => {
        setBusy(true)
        setError('')
        try {
            await apiFetch('/api/settings/avatar', { method: 'DELETE' })
            setCurrent(null)
            announceAvatar(null)
        } catch (err) {
            setError(err instanceof Error && err.message ? err.message : 'That did not save. Try again.')
        } finally {
            setBusy(false)
        }
    }

    const s = source ? scaleFor(source, zoom) : 1
    const shown = avatarSrc(current)

    return (
        <div className="avatar-setting">
            {!source ? (
                <div className="avatar-current">
                    <div className="avatar-frame">
                        {shown ? <img src={shown} alt="Your picture" /> : <span className="avatar-empty muted-text">No picture</span>}
                    </div>
                    <div className="avatar-current-info">
                        <span className="settings-toggle-label">Your Picture</span>
                        <span className="muted-text" style={{ fontSize: '13px' }}>
                            Shown beside your forum posts, on your profile and in your fights.
                            PNG, JPEG, WebP or GIF (animated is fine), up to 4 MB.
                        </span>
                        {blocked ? (
                            <span className="avatar-error">Staff have stopped you changing your picture.</span>
                        ) : loaded && (
                            <div className="avatar-buttons">
                                <button className="btn btn-gold" disabled={busy} onClick={() => fileRef.current?.click()}>
                                    {current ? 'Change' : 'Choose a picture'}
                                </button>
                                {current && <button className="btn" disabled={busy} onClick={remove}>Remove</button>}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="avatar-cropper">
                    <div
                        className="avatar-crop-view"
                        style={{ width: VIEW, height: VIEW }}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp}
                    >
                        <img
                            src={source.url}
                            alt=""
                            draggable={false}
                            style={{ left: offset.x, top: offset.y, width: source.w * s, height: source.h * s }}
                        />
                    </div>
                    <label className="avatar-zoom">
                        <span className="muted-text">Zoom</span>
                        <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} onChange={e => onZoom(Number(e.target.value))} />
                    </label>
                    <span className="muted-text" style={{ fontSize: '13px' }}>Drag the picture to place it in the square.</span>
                    <div className="avatar-buttons">
                        <button className="btn btn-gold" disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save'}</button>
                        <button className="btn" disabled={busy} onClick={cancel}>Cancel</button>
                    </div>
                </div>
            )}
            {error && <span className="avatar-error">{error}</span>}
            <input
                ref={fileRef}
                type="file"
                accept={AVATAR_TYPES.join(',')}
                style={{ display: 'none' }}
                onChange={e => pick(e.target.files?.[0])}
            />
        </div>
    )
}
