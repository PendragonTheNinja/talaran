import { useEffect, useState } from 'react'
import { getCreatureImage, getItemIcon } from '../lib/items'
import { fetchBestiary, type BestiaryData, type BestiaryEntry } from '../lib/combat'
import { useItemTooltip } from './ItemTooltip'
import './BestiaryPanel.css'

/**
 * The Bestiary (docs/combat-spec.md §8): every creature the player has killed,
 * told as far as their kills allow. The server decides what is shown
 * (services/bestiary.ts); the panel only lays it out and says how many kills
 * the next part takes.
 */

const list = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

function Entry({ entry, steps }: { entry: BestiaryEntry; steps: BestiaryData['steps'] }) {
    const { hoverProps, tooltipEl } = useItemTooltip()
    return (
        <div className="bestiary-entry">
            <div className="bestiary-entry-head">
                <div className="bestiary-portrait">
                    <img
                        src={getCreatureImage(entry.name)}
                        alt={entry.name}
                        onError={e => { e.currentTarget.style.display = 'none' }}
                    />
                </div>
                <div>
                    <h3 className="gold-text bestiary-name">
                        {entry.name}{entry.mastered && <span className="bestiary-mark" title="Mastered"> ✦</span>}
                    </h3>
                    <p className="muted-text bestiary-sub">Level {entry.level} · {entry.kills.toLocaleString()} {entry.kills === 1 ? 'kill' : 'kills'}</p>
                    {entry.places.length > 0 && <p className="bestiary-sub">Found at {list(entry.places)}.</p>}
                </div>
            </div>

            {entry.description && <p className="bestiary-desc">{entry.description}</p>}

            <p className="bestiary-section-title">Strengths and weaknesses</p>
            {entry.stances ? (
                <p className="bestiary-line">
                    {entry.stances.weak.length ? `Weak to ${list(entry.stances.weak)}.` : 'No weakness to speak of.'}
                    {entry.stances.resists.length ? ` Shrugs off ${list(entry.stances.resists)}.` : ''}
                </p>
            ) : (
                <p className="bestiary-line muted-text">Kill {steps.stances} to learn what hurts it.</p>
            )}

            <p className="bestiary-section-title">What it carries</p>
            {entry.drops ? (
                entry.drops.length ? (
                    <div className="bestiary-drops">
                        {entry.drops.map(d => (
                            <div key={`${d.name}-${d.where ?? ''}`} className="inventory-slot occupied bestiary-drop" {...hoverProps({ name: d.name }, d.where ? `At ${d.where}` : null)}>
                                <img
                                    src={getItemIcon(d.name)}
                                    alt={d.name}
                                    className="inventory-item-icon"
                                    onError={e => {
                                        e.currentTarget.style.display = 'none'
                                        e.currentTarget.nextElementSibling?.removeAttribute('style')
                                    }}
                                />
                                <span className="inventory-item-text" style={{ display: 'none' }}>{d.name}</span>
                            </div>
                        ))}
                    </div>
                ) : <p className="bestiary-line muted-text">Nothing worth the carrying.</p>
            ) : (
                <p className="bestiary-line muted-text">Kill {steps.commonDrops} to learn what it carries.</p>
            )}
            {entry.drops && !entry.allDrops && (
                <p className="bestiary-line muted-text">Kill {steps.allDrops} and you will know the rest.</p>
            )}

            {entry.lore ? (
                <p className="bestiary-lore">{entry.lore}</p>
            ) : entry.next && !(entry.drops && !entry.allDrops) && (
                <p className="bestiary-next muted-text">More at {entry.next.toLocaleString()} kills.</p>
            )}
            {tooltipEl}
        </div>
    )
}

export default function BestiaryPanel({ initialCreatureId }: { initialCreatureId?: number }) {
    const [data, setData] = useState<BestiaryData | null>(null)
    const [error, setError] = useState('')
    const [selected, setSelected] = useState<number | null>(initialCreatureId ?? null)

    useEffect(() => {
        fetchBestiary().then(setData).catch(() => setError('The Bestiary will not open.'))
    }, [])

    if (error) return <p className="bestiary-empty">{error}</p>
    if (!data) return <p className="bestiary-empty muted-text">Opening the Bestiary...</p>

    const current = data.entries.find(e => e.id === selected) ?? data.entries[0] ?? null

    return (
        <div className="bestiary">
            <div className="bestiary-header">
                <h2 className="gold-text">Bestiary</h2>
                <span className="muted-text">
                    {data.entries.length} found{data.undiscovered > 0 ? `, ${data.undiscovered} still out there` : ', every one'}
                </span>
            </div>
            {data.entries.length === 0 ? (
                <p className="bestiary-empty">Blank pages. Every creature you bring down earns its place here.</p>
            ) : (
                <div className="bestiary-body">
                    <div className="bestiary-list">
                        {data.entries.map(e => (
                            <button
                                key={e.id}
                                className={`bestiary-list-item ${current?.id === e.id ? 'active' : ''}`}
                                onClick={() => setSelected(e.id)}
                            >
                                <span>{e.name}{e.mastered ? ' ✦' : ''}</span>
                                <span className="muted-text">{e.kills.toLocaleString()}</span>
                            </button>
                        ))}
                    </div>
                    {current && <Entry key={current.id} entry={current} steps={data.steps} />}
                </div>
            )}
        </div>
    )
}
