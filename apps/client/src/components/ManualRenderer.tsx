import { useState } from 'react'
import MarkdownRenderer from './MarkdownRenderer'
import ManualDataBlock from './ManualDataBlock'
import { parseManual, type ManualNode } from '../lib/manual'

interface ManualRendererProps {
    content: string
    onNavigate: (section: string, slug: string) => void
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
export default function ManualRenderer({ content, onNavigate }: ManualRendererProps) {
    const nodes = parseManual(content)

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
                <ManualNodeView key={i} node={node} first={i === 0} />
            ))}
        </div>
    )
}

function ManualNodeView({ node, first }: { node: ManualNode; first?: boolean }) {
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
        return <ManualTabs tabs={node.tabs} />
    }

    return <ManualDetails label={node.label} nodes={node.children} />
}

/**
 * Faces of one skill, shown on one page. Trapping is part of Hunting and the
 * tanning vats are part of Crafting, so they are tabs here rather than separate
 * entries in the contents.
 */
function ManualTabs({ tabs }: { tabs: { label: string; children: ManualNode[] }[] }) {
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
                    <ManualNodeView key={i} node={n} />
                ))}
            </div>
        </div>
    )
}

function ManualDetails({ label, nodes }: { label: string; nodes: ManualNode[] }) {
    const [open, setOpen] = useState(false)

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
                        <ManualNodeView key={i} node={n} />
                    ))}
                </div>
            )}
        </div>
    )
}
