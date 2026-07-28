import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import ManualRenderer from './ManualRenderer'
import { loadManifest, loadShippedPage, type ManualManifest } from '../lib/manual'
import { createZip } from '../lib/zip'
import './Manual.css'

// Live manual editing (docs/manual-spec.md §2).
//
// Rows here OVERRIDE the markdown shipped in apps/client/public/manual/.
// Reverting deletes the override so the committed file takes over again. That is
// why the editor always shows whether a page has a file behind it: reverting a
// file-backed page restores it, reverting a database-only page deletes it.

interface OverrideRow {
    id: number
    section: string
    slug: string
    title: string | null
    blurb: string | null
    sort_order: number | null
    is_published: boolean
    updated_at: string
    updated_by_name: string | null
}

interface Draft {
    section: string
    slug: string
    title: string
    blurb: string
    content: string
    sortOrder: string
    isPublished: boolean
}

const EMPTY: Draft = {
    section: '', slug: '', title: '', blurb: '', content: '', sortOrder: '', isPublished: true,
}

export default function AdminManualEditor() {
    const [manifest, setManifest] = useState<ManualManifest | null>(null)
    const [overrides, setOverrides] = useState<OverrideRow[]>([])
    const [draft, setDraft] = useState<Draft>(EMPTY)
    const [shipped, setShipped] = useState<string | null>(null)
    const [preview, setPreview] = useState(false)
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    // Registry keys, so a mistyped directive is caught before it ships. A bad
    // directive renders the in-voice empty state, which looks deliberate — the
    // worst kind of bug, because nothing appears to be wrong.
    const [knownQueries, setKnownQueries] = useState<string[]>([])

    // What was last loaded or saved, for the unsaved-changes guard.
    const [baseline, setBaseline] = useState<Draft>(EMPTY)

    const refresh = useCallback(async () => {
        try {
            const d = await apiFetch<{ pages: OverrideRow[] }>('/api/admin/manual/pages')
            setOverrides(d.pages)
        } catch {
            setError('Could not load the list of edited pages.')
        }
    }, [])

    useEffect(() => {
        loadManifest().then(setManifest).catch(() => setError('Could not load the manual index.'))
        refresh()

        fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/manual/queries`)
            .then(r => r.json())
            .then(d => setKnownQueries(d.queries || []))
            .catch(() => setKnownQueries([]))
    }, [refresh])

    const dirty = JSON.stringify(draft) !== JSON.stringify(baseline)

    /** Directives in the draft that name a query the server does not have. */
    const badDirectives = Array.from(
        draft.content.matchAll(/\{\{data:([a-z-]+)(?::[^}]+)?\}\}/gi),
    )
        .map(m => m[1].toLowerCase())
        .filter((q, i, all) => all.indexOf(q) === i)
        .filter(q => knownQueries.length > 0 && !knownQueries.includes(q))

    const unbalanced: string[] = []
    {
        const opens = (draft.content.match(/\{\{details:/g) || []).length
        const closes = (draft.content.match(/\{\{\/details\}\}/g) || []).length
        if (opens !== closes) unbalanced.push(`details (${opens} open, ${closes} closed)`)

        const tOpen = (draft.content.match(/\{\{tabs\}\}/g) || []).length
        const tClose = (draft.content.match(/\{\{\/tabs\}\}/g) || []).length
        if (tOpen !== tClose) unbalanced.push(`tabs (${tOpen} open, ${tClose} closed)`)
    }

    /** Confirms before throwing away edits. Used by every navigation away. */
    const leaveGuard = (): boolean => {
        if (!dirty) return true
        return window.confirm('You have unsaved changes to this page. Discard them?')
    }

    const openPage = async (section: string, slug: string) => {
        if (!leaveGuard()) return
        setError(null)
        setMessage(null)
        setPreview(false)

        const file = await loadShippedPage(section, slug)
        setShipped(file)

        try {
            const d = await apiFetch<{ page: OverrideRow & { content: string } }>(
                `/api/admin/manual/page/${section}/${slug}`,
            )
            const loaded: Draft = {
                section,
                slug,
                title: d.page.title || '',
                blurb: d.page.blurb || '',
                content: d.page.content,
                sortOrder: d.page.sort_order == null ? '' : String(d.page.sort_order),
                isPublished: d.page.is_published,
            }
            setDraft(loaded)
            setBaseline(loaded)
        } catch {
            // No override yet: start from the shipped file.
            const page = manifest?.sections
                .find(s => s.key === section)?.pages.find(p => p.slug === slug)
            const fresh: Draft = {
                section,
                slug,
                title: page?.title || '',
                blurb: page?.blurb || '',
                content: file || '',
                sortOrder: '',
                isPublished: true,
            }
            setDraft(fresh)
            setBaseline(fresh)
        }
    }

    const save = async () => {
        setBusy(true)
        setError(null)
        setMessage(null)

        try {
            const parsed = parseInt(draft.sortOrder, 10)
            await apiFetch('/api/admin/manual/page', {
                method: 'PUT',
                body: JSON.stringify({
                    section: draft.section,
                    slug: draft.slug,
                    title: draft.title || null,
                    blurb: draft.blurb || null,
                    content: draft.content,
                    sortOrder: Number.isFinite(parsed) ? parsed : null,
                    isPublished: draft.isPublished,
                }),
            })
            setMessage(`Saved ${draft.section}/${draft.slug}. It is live now.`)
            setBaseline(draft)
            await refresh()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save.')
        } finally {
            setBusy(false)
        }
    }

    const revert = async () => {
        const backed = shipped !== null
        const warning = backed
            ? `Discard your edits to ${draft.section}/${draft.slug} and restore the version shipped with the game?`
            : `${draft.section}/${draft.slug} has no file behind it. Reverting DELETES this page entirely. Continue?`

        if (!window.confirm(warning)) return

        setBusy(true)
        setError(null)
        setMessage(null)

        try {
            await apiFetch(`/api/admin/manual/page/${draft.section}/${draft.slug}`, { method: 'DELETE' })
            setMessage(backed ? 'Reverted to the shipped version.' : 'Page deleted.')
            setDraft(EMPTY)
            setBaseline(EMPTY)
            setShipped(null)
            await refresh()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not revert.')
        } finally {
            setBusy(false)
        }
    }

    /**
     * Downloads every override as a zip laid out in the repo's own directory
     * structure, so applying it is `unzip` at the repo root rather than copying
     * blocks out of a bundle by hand.
     *
     * This is the step that stops the files in git drifting from what players
     * see. The included how-to spells out the ordering that matters: commit and
     * deploy BEFORE reverting the overrides, or players briefly get the old text.
     */
    const exportAll = async () => {
        setBusy(true)
        setError(null)

        try {
            const d = await apiFetch<{ files: { path: string; content: string }[] }>(
                '/api/admin/manual/export',
            )

            if (d.files.length === 0) {
                setMessage('Nothing to export: no pages have been edited in game.')
                return
            }

            const stamp = new Date().toISOString().slice(0, 10)

            const howTo = [
                'Talaran manual overrides',
                `Exported ${stamp}`,
                '',
                'These are pages edited in game. Each one is a row in manual_pages that',
                'currently OVERRIDES the markdown file of the same name, so what players',
                'see is not what is in git.',
                '',
                'To put them back into the repo:',
                '',
                '  1. Unzip this at the ROOT of the talaran repo. The paths inside are',
                '     already correct, so files land where they belong.',
                '  2. git add apps/client/public/manual && git commit && git push',
                '  3. Deploy the client.',
                '  4. ONLY THEN, in Admin > Manual, open each page below and press',
                '     "Revert to shipped".',
                '',
                'Step 4 last, and only after deploying. Reverting deletes the override,',
                'so doing it earlier means players see the old file until the deploy lands.',
                '',
                'Until you revert, the database still wins. A later edit to the .md file',
                'in the repo would be silently invisible.',
                '',
                'Pages in this export:',
                ...d.files.map(f => `  - ${f.path}`),
                '',
            ].join('\n')

            const blob = createZip([
                ...d.files.map(f => ({ path: f.path, content: f.content })),
                { path: 'HOW-TO-APPLY.txt', content: howTo },
            ])

            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `talaran-manual-overrides-${stamp}.zip`
            a.click()
            URL.revokeObjectURL(url)

            setMessage(
                `Exported ${d.files.length} page${d.files.length === 1 ? '' : 's'}. `
                + 'Unzip at the repo root, commit, deploy, then revert.',
            )
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not export.')
        } finally {
            setBusy(false)
        }
    }

    const startNew = () => {
        if (!leaveGuard()) return
        const blank = { ...EMPTY, section: manifest?.sections[0]?.key || '' }
        setDraft(blank)
        setBaseline(blank)
        setShipped(null)
        setPreview(false)
        setMessage(null)
        setError(null)
    }

    const edited = new Set(overrides.map(o => `${o.section}/${o.slug}`))
    const isDirtyPage = draft.slug !== ''
    const hasOverride = edited.has(`${draft.section}/${draft.slug}`)

    return (
        <div className="admin-manual">
            <aside className="admin-manual-list">
                <button className="btn btn-gold admin-manual-new" onClick={startNew}>
                    + New page
                </button>

                <button className="btn admin-manual-new" onClick={exportAll} disabled={busy}>
                    Export for commit
                </button>

                {manifest?.sections.map(section => (
                    <div key={section.key} className="admin-manual-section">
                        <p className="manual-nav-label">{section.title}</p>
                        {section.pages.length === 0 && (
                            <p className="manual-nav-pending">No pages.</p>
                        )}
                        {section.pages.map(page => (
                            <button
                                key={page.slug}
                                className={`manual-nav-link ${draft.section === section.key && draft.slug === page.slug ? 'active' : ''}`}
                                onClick={() => openPage(section.key, page.slug)}
                            >
                                {page.title}
                                {edited.has(`${section.key}/${page.slug}`) && (
                                    <span className="admin-manual-flag" title="Edited in game">✎</span>
                                )}
                            </button>
                        ))}
                    </div>
                ))}
            </aside>

            <div className="admin-manual-editor">
                {error && <p className="guild-error">{error}</p>}
                {message && <p className="guild-success">{message}</p>}

                {!isDirtyPage ? (
                    <p className="manual-nav-pending">
                        Pick a page to edit, or start a new one. Pages marked ✎ have been edited in
                        game and no longer match the version shipped with the build.
                    </p>
                ) : (
                    <>
                        <div className="admin-manual-fields">
                            <label>
                                <span>Section</span>
                                <select
                                    value={draft.section}
                                    onChange={e => setDraft({ ...draft, section: e.target.value })}
                                >
                                    {manifest?.sections.map(s => (
                                        <option key={s.key} value={s.key}>{s.title}</option>
                                    ))}
                                </select>
                            </label>

                            <label>
                                <span>Slug</span>
                                <input
                                    type="text"
                                    value={draft.slug}
                                    placeholder="lowercase-with-hyphens"
                                    onChange={e => setDraft({ ...draft, slug: e.target.value })}
                                />
                            </label>

                            <label>
                                <span>Title</span>
                                <input
                                    type="text"
                                    value={draft.title}
                                    onChange={e => setDraft({ ...draft, title: e.target.value })}
                                />
                            </label>

                            <label>
                                <span>Order</span>
                                <input
                                    type="text"
                                    value={draft.sortOrder}
                                    placeholder="optional"
                                    onChange={e => setDraft({ ...draft, sortOrder: e.target.value })}
                                />
                            </label>

                            <label className="admin-manual-wide">
                                <span>Blurb</span>
                                <input
                                    type="text"
                                    value={draft.blurb}
                                    onChange={e => setDraft({ ...draft, blurb: e.target.value })}
                                />
                            </label>
                        </div>

                        <div className="admin-manual-toolbar">
                            <button
                                className={`btn ${preview ? '' : 'btn-gold'}`}
                                onClick={() => setPreview(false)}
                            >
                                Write
                            </button>
                            <button
                                className={`btn ${preview ? 'btn-gold' : ''}`}
                                onClick={() => setPreview(true)}
                            >
                                Preview
                            </button>

                            <span className="admin-manual-status">
                                {shipped === null
                                    ? 'No file behind this page. It exists only in the database.'
                                    : hasOverride
                                        ? 'Overriding the shipped file.'
                                        : 'Matches the shipped file.'}
                            </span>
                        </div>

                        {preview ? (
                            <div className="admin-manual-preview manual">
                                <article className="manual-article">
                                    <ManualRenderer content={draft.content} onNavigate={() => {}} />
                                </article>
                            </div>
                        ) : (
                            <textarea
                                className="admin-manual-textarea"
                                value={draft.content}
                                spellCheck
                                onChange={e => setDraft({ ...draft, content: e.target.value })}
                                placeholder={'Markdown. Directives:\n{{data:xp-curve}}\n{{data:training-path:Mining}}\n{{details:Label}} … {{/details}}'}
                            />
                        )}

                        {(badDirectives.length > 0 || unbalanced.length > 0) && (
                            <div className="admin-manual-warnings">
                                {badDirectives.length > 0 && (
                                    <p>
                                        Unknown data {badDirectives.length === 1 ? 'directive' : 'directives'}:{' '}
                                        <strong>{badDirectives.join(', ')}</strong>. Available:{' '}
                                        {knownQueries.join(', ')}.
                                    </p>
                                )}
                                {unbalanced.map(u => (
                                    <p key={u}>Unbalanced {u}.</p>
                                ))}
                            </div>
                        )}

                        <div className="admin-manual-actions">
                            <label className="admin-manual-publish">
                                <input
                                    type="checkbox"
                                    checked={draft.isPublished}
                                    onChange={e => setDraft({ ...draft, isPublished: e.target.checked })}
                                />
                                <span>Published</span>
                            </label>

                            <button className="btn btn-gold" onClick={save} disabled={busy}>
                                {busy ? 'Saving…' : dirty ? 'Save changes' : 'Save'}
                            </button>

                            {dirty && <span className="admin-manual-dirty">Unsaved changes</span>}

                            {hasOverride && (
                                <button className="btn" onClick={revert} disabled={busy}>
                                    {shipped === null ? 'Delete page' : 'Revert to shipped'}
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
