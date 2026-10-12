import { useState } from 'react'
import MarkdownRenderer from './MarkdownRenderer'
import ManualDataBlock from './ManualDataBlock'
import { parseManual, toReference, type ManualNode } from '../lib/manual'
import { openBestiary } from '../lib/combat'

/**
 * The panels a page may open with {{open:<panel>:<label>}}. Only in game: the
 * public page has no panels to open, so the button is left out there.
 */
const OPENERS: Record<string, () => void> = {
    bestiary: () => openBestiary(),
}

interface ManualRendererProps {
    content: string
    onNavigate: (section: string, slug: string) => void
    /** Strip the prose and keep the structure. See toReference in lib/manual. */
    reference?: boolean
    /** Inside the game, where {{open:…}} buttons have a panel to open. */
    inGame?: boolean
}

/**
 * Renders manual content: authored prose through the shared MarkdownRenderer,
 * live tables through ManualDataBlock, and {{details:…}} sections as real
 * collapsibles (lib/markdown.ts strips <details>, so React has to own them).
 *
 * Internal links are intercepted rather than followed: addLinkTargets() forces
 * every anchor to target="_blank", which is right for outbound links and wrong
 * for cross-references inside the manual. A click on /manual/... navigates in
 * place, on the page or inside the panel.
 */
export default function ManualRenderer({ content, onNavigate, reference, inGame }: ManualRendererProps) {
    const parsed = parseManual(content)
    const nodes = reference ? toReference(parsed) : parsed

    const interceptLinks = (e: React.MouseEvent<HTMLDivElement>) => {
        const anchor = (e.target as HTMLElement).closest('a')
        if (!anchor) return

        const href = anchor.getAttribute('href') || ''
        if (!href.startsWith('/manual/')) return

        const [, , section, slug] = href.split('/')
        if (!section || !slug) return

        e.preventDefault()
        onNavigate(section, slug)
    }

    return (
        <div className="manual-content" onClick={interceptLinks}>
            {nodes.map((node, i) => (
                <ManualNodeView key={i} node={node} first={i === 0} inGame={inGame} />
            ))}
        </div>
    )
}

function ManualNodeView({ node, first, inGame }: { node: ManualNode; first?: boolean; inGame?: boolean }) {
    if (node.type === 'prose') {
        // Only the opening paragraph of a page gets the illuminated capital.
        return (
            <MarkdownRenderer
                content={node.text}
                className={`manual-prose ${first ? 'manual-dropcap' : ''}`}
            />
        )
    }

    if (node.type === 'data') {
        return <ManualDataBlock query={node.query} param={node.param} />
    }

    if (node.type === 'tabs') {
        return <ManualTabs tabs={node.tabs} inGame={inGame} />
    }

    if (node.type === 'open') {
        const open = OPENERS[node.target]
        if (!inGame || !open) return null
        return (
            <p className="manual-open">
                <button className="btn btn-gold" onClick={open}>{node.label}</button>
            </p>
        )
    }

    return <ManualDetails label={node.label} nodes={node.children} inGame={inGame} />
}

/**
 * Faces of one skill, shown on one page. Trapping is part of Hunting and the
 * tanning vats are part of Crafting, so they are tabs here rather than separate
 * entries in the contents.
 */
function ManualTabs({ tabs, inGame }: { tabs: { label: string; children: ManualNode[] }[]; inGame?: boolean }) {
    const [active, setActive] = useState(0)
    const current = tabs[Math.min(active, tabs.length - 1)]

    return (
        <div className="manual-tabs">
            <div className="manual-tabs-bar" role="tablist">
                {tabs.map((tab, i) => (
                    <button
                        key={tab.label}
                        role="tab"
                        aria-selected={i === active}
                        className={`manual-tab ${i === active ? 'active' : ''}`}
                        onClick={() => setActive(i)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="manual-tab-body">
                {current.children.map((n, i) => (
                    <ManualNodeView key={i} node={n} inGame={inGame} />
                ))}
            </div>
        </div>
    )
}

/**
 * A ledger, open on arrival.
 *
 * These hold the tables, and a table nobody can see is a table nobody uses.
 * Collapsing them by default made sense when the manual was a guide with
 * reference tucked inside it; now that people read these pages to look things
 * up, the first thing they did on every visit was open the ledger. The control
 * stays, so a page can still be folded down to its headings.
 */
function ManualDetails({ label, nodes, inGame }: { label: string; nodes: ManualNode[]; inGame?: boolean }) {
    const [open, setOpen] = useState(true)

    return (
        <div className={`manual-details ${open ? 'open' : ''}`}>
            <button
                className="manual-details-toggle"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
            >
                <span className="manual-details-chevron">{open ? '▾' : '▸'}</span>
                <span>{label}</span>
            </button>

            {open && (
                <div className="manual-details-body">
                    {nodes.map((n, i) => (
                        <ManualNodeView key={i} node={n} inGame={inGame} />
                    ))}
                </div>
            )}
        </div>
    )
}
