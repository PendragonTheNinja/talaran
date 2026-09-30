import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { getItemIcon } from '../lib/items'
import { useItemTooltip } from './ItemTooltip'
import ConfirmModal from './ConfirmModal'
import './FarmPanel.css'
import './MuseumPanel.css'

// An island museum (docs/WORLD-EVENTS-AND-MUSEUMS.md, Part 2). One modal, a tab
// per exhibit, a case per item. A case is the item's own icon drawn black until
// you have given yours; the plaque under it names whoever gave one first.

interface MuseumCase {
    caseId: number
    itemId: number
    name: string
    donated: boolean
    held: number
    firstDonor: string | null
    firstDonatedAt: string | null
}

interface Exhibit {
    id: number
    name: string
    description: string | null
    cases: MuseumCase[]
    completedBy: number
}

interface Museum {
    id: number
    name: string
    island: string
    town: string | null
    total: number
    given: number
    exhibits: Exhibit[]
}

const shortDate = (at: string) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

function CaseIcon({ c, hover }: { c: MuseumCase; hover: Record<string, unknown> }) {
    const [failed, setFailed] = useState(false)
    if (failed) return <span className="museum-case-blank" {...hover}>?</span>
    return (
        <img
            className={`inventory-item-icon ${c.donated ? '' : 'museum-silhouette'}`}
            src={getItemIcon(c.name)}
            alt={c.name}
            onError={() => setFailed(true)}
            {...hover}
        />
    )
}

export default function MuseumPanel({ museumId, onClose }: { museumId: number; onClose: () => void }) {
    const { hoverProps, tooltipEl } = useItemTooltip()
    const [museum, setMuseum] = useState<Museum | null>(null)
    const [tab, setTab] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const [giving, setGiving] = useState<MuseumCase | null>(null)

    const load = useCallback(() => {
        return apiFetch<Museum>(`/api/museum/${museumId}`)
            .then(m => {
                setMuseum(m)
                setTab(t => t ?? m.exhibits[0]?.id ?? null)
            })
            .catch(() => setError('Could not open the museum.'))
    }, [museumId])

    useEffect(() => { load() }, [load])

    const give = async (c: MuseumCase) => {
        setGiving(null)
        setError(null)
        try {
            const r = await apiFetch<{ name: string; first: boolean; museum: string }>('/api/museum/donate', {
                method: 'POST', body: JSON.stringify({ caseId: c.caseId }),
            })
            setNotice(r.first
                ? `You gave the ${r.museum} its first ${r.name}. Your name goes on the plaque.`
                : `You gave your ${r.name} to the ${r.museum}.`)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'That did not work.')
        } finally {
            load()
        }
    }

    const pick = (c: MuseumCase) => {
        setNotice(null)
        if (c.donated) return
        if (c.held < 1) {
            setNotice(`You have no ${c.name} to give.`)
            return
        }
        setGiving(c)
    }

    const exhibit = museum?.exhibits.find(e => e.id === tab) ?? null

    return (
        <div className="farm-overlay" onClick={onClose}>
            <div className="farm-modal museum-modal" onClick={e => e.stopPropagation()}>
                <div className="farm-header">
                    <h2>{museum?.name ?? 'Museum'}</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {museum && <span className="museum-progress tabular-num">{museum.given} of {museum.total} given</span>}
                        <button className="farm-close" onClick={onClose}>✕</button>
                    </div>
                </div>

                {!museum && !error && <p className="farm-empty">Pushing open the doors…</p>}
                {error && <p className="farm-error">{error}</p>}
                {notice && <p className="farm-note museum-notice">{notice}</p>}

                {museum && (
                    <div className="farm-tabs museum-tabs">
                        {museum.exhibits.map(e => {
                            const done = e.cases.filter(c => c.donated).length
                            return (
                                <button key={e.id} className={`farm-tab ${tab === e.id ? 'active' : ''}`} onClick={() => { setTab(e.id); setNotice(null) }}>
                                    {e.name} <span className="tabular-num">{done}/{e.cases.length}</span>
                                </button>
                            )
                        })}
                    </div>
                )}

                {exhibit && (
                    <>
                        {exhibit.description && <p className="farm-build-lead">{exhibit.description}</p>}
                        <p className="farm-note">
                            {exhibit.completedBy === 0
                                ? 'No islander has filled this exhibit yet.'
                                : `${exhibit.completedBy} islander${exhibit.completedBy === 1 ? ' has' : 's have'} filled this exhibit.`}
                        </p>
                        <div className="museum-grid">
                            {exhibit.cases.map(c => (
                                <div key={c.caseId} className={`museum-case ${c.donated ? 'given' : c.held > 0 ? 'can-give' : ''}`}>
                                    <button className="inventory-slot occupied museum-slot" onClick={() => pick(c)}>
                                        <CaseIcon c={c} hover={hoverProps({ name: c.name },
                                            c.donated ? 'Given' : c.held > 0 ? 'Click to give one' : 'Not yet given')} />
                                        {!c.donated && c.held > 0 && <span className="museum-held tabular-num">{c.held}</span>}
                                    </button>
                                    <span className="museum-case-name">{c.name}</span>
                                    <span className="museum-plaque">
                                        {c.firstDonor
                                            ? <>First given by <strong>{c.firstDonor}</strong>, {shortDate(c.firstDonatedAt!)}</>
                                            : 'Nobody has given one yet'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {giving && (
                <ConfirmModal
                    message={`Give one ${giving.name} to the ${museum?.name ?? 'museum'}? It stays in the case for good.`}
                    confirmLabel="Give It"
                    onConfirm={() => give(giving)}
                    onCancel={() => setGiving(null)}
                />
            )}
            {tooltipEl}
        </div>
    )
}
