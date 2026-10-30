import { useState } from 'react'
import './ManualItem.css'

export interface SpellPage {
    kind: 'spell'
    name: string
    description: string | null
    level: number
    cost: string
    cast: string
    xp: number
    vigil: { minutes: number; offering: string | null; writ: string | null }
    taughtAt: { church: string; place: string }[]
}

/** Spell art, when there is any: /images/spells/<Name>.png, as item art is named. */
const spellArt = (name: string) => `/images/spells/${name.replace(/'/g, '').replace(/ /g, '_')}.png`

/**
 * The page for one spell. Spells are not items, but they are linked from the
 * same tables (the Talar ledger), so they get a page of the same shape: the
 * plate, the facts, then how it is learned.
 */
export default function ManualSpell({
    page,
    onNavigate,
    onOpenItem,
}: {
    page: SpellPage
    onNavigate: (section: string, slug: string) => void
    onOpenItem: (item: string) => void
}) {
    const [broken, setBroken] = useState(false)

    const facts: [string, string][] = [
        ['Kind', 'Spell'],
        ['Talar level', String(page.level)],
        ['Costs', page.cost],
        ['Can be cast', page.cast],
        ['XP a cast', page.xp.toLocaleString()],
    ]

    const where = page.taughtAt.length
        ? page.taughtAt.map(t => `${t.church}, ${t.place}`).join('; ')
        : 'a church'

    return (
        <div className="mitem">
            <header className="mitem-plate">
                {!broken && (
                    <img
                        src={spellArt(page.name)}
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
                <h2 className="mitem-section-title">How it is learned</h2>
                <ul className="mitem-list">
                    <li className="mitem-entry">
                        <span className="mitem-entry-kind">Vigil</span>
                        <span className="mitem-entry-main">
                            <span className="mitem-entry-name">{page.vigil.minutes} minutes on your knees</span>
                            <span className="mitem-entry-where">{where}</span>
                        </span>
                        <span className="mitem-entry-detail">
                            <span className="mitem-entry-level">Talar level {page.level}</span>
                            {(page.vigil.offering || page.vigil.writ) && (
                                <ul className="mitem-inputs">
                                    {[page.vigil.offering, page.vigil.writ].filter((n): n is string => !!n).map(n => (
                                        <li key={n}>
                                            1 ×{' '}
                                            <button className="mitem-link mitem-link-inline" onClick={() => onOpenItem(n)}>
                                                {n}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </span>
                        <button className="mitem-entry-more" onClick={() => onNavigate('skills', 'talar')}>
                            Read
                        </button>
                    </li>
                </ul>
                <p className="mitem-none">
                    {page.vigil.writ
                        ? 'The stone and the writ are given up when the vigil ends. A spell learned is never forgotten.'
                        : 'The stone is given up when the vigil ends. A spell learned is never forgotten.'}
                </p>
            </section>
        </div>
    )
}
