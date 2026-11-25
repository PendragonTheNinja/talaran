import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Rnd } from 'react-rnd'
import { useFeatsLedger } from '../lib/useFeatsLedger'
import { pinBox, savePinBox, setPinnedFeat, usePinnedFeat, type PinBox } from '../lib/pinnedFeat'
import './FeatsPanel.css'
import './PinnedFeat.css'

const num = (n: number) => n.toLocaleString()

/**
 * One feat kept on screen with its bar moving as you work (Nathan,
 * 2026-11-22). Pinned from the Feats panel; dragged by its name and resized
 * from any edge or corner, and it stays where it was left (lib/pinnedFeat.ts).
 */
export default function PinnedFeat() {
    const slug = usePinnedFeat()
    if (!slug) return null
    return <PinnedFeatWindow slug={slug} />
}

function PinnedFeatWindow({ slug }: { slug: string }) {
    const { data } = useFeatsLedger()
    const [box, setBox] = useState<PinBox>(() => pinBox({
        x: Math.max(8, window.innerWidth - 280), y: 90, width: 250, height: 96,
    }))
    const feat = data?.feats.find(f => f.slug === slug)
    // A feat that has gone (made inactive) unpins itself once the ledger is read.
    if (data && !feat) return null

    const done = !!feat?.earnedAt
    const pct = feat ? Math.min(100, Math.round((feat.progress / Math.max(1, feat.target)) * 100)) : 0
    const keep = (next: PinBox) => { setBox(next); savePinBox(next) }

    // On the page itself, not inside the scene: its place is the window's.
    return createPortal(
        <Rnd
            className="pinned-feat"
            position={{ x: box.x, y: box.y }}
            size={{ width: box.width, height: box.height }}
            onDragStop={(_e, d) => keep({ ...box, x: d.x, y: d.y })}
            onResizeStop={(_e, _dir, ref, _delta, pos) => keep({ x: pos.x, y: pos.y, width: ref.offsetWidth, height: ref.offsetHeight })}
            bounds="window"
            minWidth={170}
            minHeight={58}
            dragHandleClassName="pinned-feat-head"
            cancel=".pinned-feat-close"
        >
            <div className={`pinned-feat-inner ${done ? 'done' : ''}`}>
                <div className="pinned-feat-head">
                    <span className="pinned-feat-name">{feat?.name ?? 'Feat'}</span>
                    <button className="pinned-feat-close" onClick={() => setPinnedFeat(null)} title="Unpin" aria-label="Unpin">✕</button>
                </div>
                {feat && (
                    <>
                        <div className="pinned-feat-count">
                            {done ? 'Earned' : `${num(feat.progress)} / ${num(feat.target)}`}
                            <span className="pinned-feat-pct">{pct}%</span>
                        </div>
                        <div className="feat-bar pinned-feat-bar">
                            <div className="feat-bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="pinned-feat-desc">{feat.description}</p>
                    </>
                )}
            </div>
        </Rnd>,
        document.body,
    )
}
