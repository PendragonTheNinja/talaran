import { useState, useEffect } from 'react'
import { getItemIcon } from '../lib/items'
import './ManualItem.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

interface Entry {
    kind: string
    from?: string
    into?: string
    where?: string
    detail?: string
    link?: string
}

interface ItemPage {
    name: string
    description: string | null
    type: string
    subtype: string | null
    quality: string | null
    tier: number | null
    slot: string | null
    levelRequired: number | null
    value: number | null
    sources: Entry[]
    uses: Entry[]
}

const SLOT_WORDS: Record<string, string> = {
    mainhand: 'Main hand', offhand: 'Off hand', head: 'Head', chest: 'Chest',
    legs: 'Legs', feet: 'Feet', hands: 'Hands', neck: 'Neck', ring: 'Ring',
    back: 'Back', mount: 'Mount',
}

const sentence = (v: string) => v.charAt(0).toUpperCase() + v.slice(1)

/**
 * The page for a single item.
 *
 * Built to be read in the order the questions arrive: what am I holding, where
 * does it come from, and what is it for. The plate at the top carries the art
 * large enough to actually see, since for a lot of items the art is the first
 * thing that tells you what it is.
 */
export default function ManualItem({
    name,
    onNavigate,
    onOpenItem,
}: {
    name: string
    onNavigate: (section: string, slug: string) => void
    onOpenItem: (item: string) => void
}) {
    const [page, setPage] = useState<ItemPage | null>(null)
    const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
    const [broken, setBroken] = useState(false)

    useEffect(() => {
        setState('loading')
        setBroken(false)
        fetch(`${API_URL}/api/manual/item/${encodeURIComponent(name)}`)
            .then(r => {
                if (r.status === 404) { setState('missing'); return null }
                if (!r.ok) throw new Error('failed')
                return r.json()
            })
            .then(d => { if (d) { setPage(d); setState('ready') } })
            .catch(() => setState('error'))
    }, [name])

    if (state === 'loading') {
        return <div className="mitem"><div className="mitem-skeleton" /></div>
    }

    if (state === 'missing') {
        return (
            <div className="mitem mitem-empty">
                <p>Nothing is recorded under that name.</p>
            </div>
        )
    }

    if (state === 'error' || !page) {
        return (
            <div className="mitem mitem-empty">
                <p>This entry could not be read just now.</p>
            </div>
        )
    }

    // Facts worth stating. A row that would only say "none" is left out rather
    // than printed empty, which is what makes a short entry look deliberate.
    const facts: [string, string][] = []
    facts.push(['Kind', page.subtype ? `${sentence(page.subtype)} ${page.type}` : sentence(page.type)])
    if (page.quality) facts.push(['Grade', sentence(page.quality)])
    if (page.tier) facts.push(['Tier', String(page.tier)])
    if (page.slot) facts.push(['Worn', SLOT_WORDS[page.slot] || sentence(page.slot)])
    if (page.levelRequired && page.levelRequired > 1) facts.push(['Needs level', String(page.levelRequired)])
    // items.value is the economy's reference value, derived from time per
    // docs/economy-spec.md. It is not what any particular merchant pays, so it
    // is labelled for what it is.
    if (page.value) facts.push(['Value', `${page.value} gold`])

    const entryRow = (e: Entry, i: number, key: 'from' | 'into') => (
        <li key={i} className="mitem-entry">
            <span className="mitem-entry-kind">{e.kind}</span>
            <span className="mitem-entry-main">
                {key === 'into' && e.into ? (
                    <button className="mitem-link" onClick={() => onOpenItem(e.into!)}>
                        {e.into}
                    </button>
                ) : (
                    <span className="mitem-entry-name">{e[key]}</span>
                )}
                {e.where && <span className="mitem-entry-where">{e.where}</span>}
            </span>
            {e.detail && <span className="mitem-entry-detail">{e.detail}</span>}
            {e.link && (
                <button
                    className="mitem-entry-more"
                    onClick={() => {
                        const [section, slug] = e.link!.split('/')
                        onNavigate(section, slug)
                    }}
                >
                    Read
                </button>
            )}
        </li>
    )

    return (
        <div className="mitem">
            <header className="mitem-plate">
                {!broken && (
                    <img
                        src={getItemIcon(page.name)}
                        alt=""
                        aria-hidden="true"
                        className="mitem-art"
                        onError={() => setBroken(true)}
                    />
                )}
                <div className="mitem-plate-text">
                    <h1 className="mitem-name">{page.name}</h1>
                    {page.description && <p className="mitem-desc">{page.description}</p>}
                </div>
            </header>

            <dl className="mitem-facts">
                {facts.map(([k, v]) => (
                    <div className="mitem-fact" key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                    </div>
                ))}
            </dl>

            <section className="mitem-section">
                <h2 className="mitem-section-title">Where it comes from</h2>
                {page.sources.length ? (
                    <ul className="mitem-list">
                        {page.sources.map((e, i) => entryRow(e, i, 'from'))}
                    </ul>
                ) : (
                    <p className="mitem-none">
                        Nothing in the world produces this yet.
                    </p>
                )}
            </section>

            <section className="mitem-section">
                <h2 className="mitem-section-title">What it is for</h2>
                {page.uses.length ? (
                    <ul className="mitem-list">
                        {page.uses.map((e, i) => entryRow(e, i, 'into'))}
                    </ul>
                ) : (
                    <p className="mitem-none">
                        Nothing takes this as a material. It is an end in itself, or it is waiting on
                        a trade that has not been built.
                    </p>
                )}
            </section>
        </div>
    )
}
