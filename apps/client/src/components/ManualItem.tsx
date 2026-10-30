import { useState, useEffect, Fragment } from 'react'
import { getItemIcon } from '../lib/items'
import { apiFetch } from '../lib/api'
import { openBestiary } from '../lib/combat'
import './ManualItem.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

interface Entry {
    kind: string
    from?: string
    into?: string
    where?: string
    detail?: string
    link?: string
    /** A recipe's ingredients, each linked to its own page. */
    inputs?: { name: string; qty: number }[]
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
    /** Health it mends when eaten; null when it is not food. */
    mends?: number | null
    /** What a provision does. */
    provision?: { effect: string; skill: string | null; magnitude: number; seconds: number } | null
    /** A creature carries it; which one only the Bestiary tells. */
    fromCreature?: boolean
}

/** A provision's effect, in the words the pack's tooltip uses. */
function provisionWords(p: NonNullable<ItemPage['provision']>): string {
    const where = p.skill || 'every skill'
    const effect = p.effect === 'timer' ? `${p.magnitude}% faster at ${where}`
        : p.effect === 'rare' ? `${p.magnitude}% better rare finds at ${where}`
        : p.effect === 'double' ? `${p.magnitude}% chance of a double yield at ${where}`
        : p.effect === 'travel' ? `${p.magnitude}% faster travel`
        : `A boon to ${where}`
    const mins = Math.round(p.seconds / 60)
    return mins ? `${effect}, for ${mins >= 60 && mins % 60 === 0 ? `${mins / 60} h` : `${mins} min`}` : effect
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
/**
 * An item's kind in plain words: its type ("Food", "Tool"), plus its subtype
 * only when that says something the name does not ("Food · cooked fish" for
 * Cooked Tiddle; just "Ore" for Ambren Ore, whose subtype is "ambren"). This
 * printed the raw codes, subtype then type: "Cooked_fish food".
 */
function kindOf(page: { name: string; type: string; subtype: string | null }): string {
    const words = (code: string) => code.replace(/_/g, ' ').trim().toLowerCase()
    const type = words(page.type)
    const kind = type.charAt(0).toUpperCase() + type.slice(1)
    const sub = page.subtype ? words(page.subtype) : ''
    if (!sub || sub === type || page.name.toLowerCase().includes(sub)) return kind
    return `${kind} · ${sub}`
}

export default function ManualItem({
    name,
    onNavigate,
    onOpenItem,
    inGame,
}: {
    name: string
    onNavigate: (section: string, slug: string) => void
    onOpenItem: (item: string) => void
    /** In the game's own panel, where the Bestiary can be opened. */
    inGame?: boolean
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
    facts.push(['Kind', kindOf(page)])
    if (page.quality) facts.push(['Grade', sentence(page.quality)])
    if (page.tier) facts.push(['Tier', String(page.tier)])
    if (page.slot) facts.push(['Worn', SLOT_WORDS[page.slot] || sentence(page.slot)])
    if (page.levelRequired && page.levelRequired > 1) facts.push(['Needs level', String(page.levelRequired)])
    // items.value is the economy's reference value, derived from time per
    // docs/economy-spec.md. It is not what any particular merchant pays, so it
    // is labelled for what it is.
    if (page.value) facts.push(['Value', `${page.value} gold`])
    if (page.mends) facts.push(['Mends', `${page.mends} health`])
    if (page.provision) facts.push(['Provision', provisionWords(page.provision)])

    // A creature drop: the page never names the creature (the Bestiary's to
    // tell), but in the game the Bestiary can be opened, at the creature itself
    // when this player's kills have already revealed the drop there.
    const openCarrier = async () => {
        try {
            const b = await apiFetch<{ entries: { id: number; drops: { name: string }[] | null }[] }>('/api/combat/bestiary')
            const found = b.entries.find(e => e.drops?.some(d => d.name === page.name))
            openBestiary(found?.id)
        } catch {
            openBestiary()
        }
    }

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
            {e.inputs && e.inputs.length > 0 && (
                <span className="mitem-entry-detail">
                    From{' '}
                    {e.inputs.map((input, n) => (
                        <Fragment key={input.name}>
                            {n > 0 && ', '}
                            {input.qty} ×{' '}
                            <button className="mitem-link mitem-link-inline" onClick={() => onOpenItem(input.name)}>
                                {input.name}
                            </button>
                        </Fragment>
                    ))}
                </span>
            )}
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
                ) : page.fromCreature ? (
                    <p className="mitem-none">
                        Carried by a creature somewhere in the wild. The Bestiary tells which, once
                        you have killed enough of them to know.
                        {inGame && (
                            <>
                                {' '}
                                <button className="mitem-link mitem-link-inline" onClick={openCarrier}>Open the Bestiary</button>
                            </>
                        )}
                    </p>
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
