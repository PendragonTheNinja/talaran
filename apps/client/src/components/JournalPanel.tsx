import { useState, useEffect, useRef, useMemo, useCallback, type ReactNode, type ChangeEvent } from 'react'
import { apiFetch } from '../lib/api'
import DockableWindow from './DockableWindow'
import { useDockableWindow } from '../lib/useDockableWindow'
import { useIsMobile } from '../lib/useIsMobile'
import ConfirmModal from './ConfirmModal'
import './SettingsPanel.css'
import './JournalPanel.css'

/**
 * The Journal (Nathan, 2026-11-03): a player's own notes, kept on their
 * account (services/journal.ts). Written as plain text; read with checklists
 * ("- [ ]" / "- [x]" lines become tick boxes) and item names linked to their
 * Manual page. Saves itself a moment after the last keystroke.
 */

interface Note {
    id: number
    title: string
    body: string
    color: string | null
    pinned: boolean
    createdAt: string
    updatedAt: string
}

const COLORS: { key: string; label: string }[] = [
    { key: 'red', label: 'Red' }, { key: 'gold', label: 'Gold' }, { key: 'green', label: 'Green' },
    { key: 'blue', label: 'Blue' }, { key: 'purple', label: 'Purple' },
]
const BODY_MAX = 2000
const SAVE_AFTER_MS = 700

interface JournalPanelProps {
    onClose: () => void
    closing?: boolean
    /** Open an item's Manual page (a linked name in a note). */
    onOpenItem?: (name: string) => void
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Most recently changed and pinned first, as the server orders them. */
function ordered(notes: Note[]): Note[] {
    return [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt))
}

export default function JournalPanel({ onClose, closing, onOpenItem }: JournalPanelProps) {
    const isMobile = useIsMobile()
    const dock = useDockableWindow('journal')
    const [notes, setNotes] = useState<Note[] | null>(null)
    const [max, setMax] = useState(50)
    const [openId, setOpenId] = useState<number | null>(null)
    const [mode, setMode] = useState<'read' | 'write'>('read')
    const [search, setSearch] = useState('')
    const [itemNames, setItemNames] = useState<string[]>([])
    const [status, setStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
    const [error, setError] = useState<string | null>(null)
    const [confirmDelete, setConfirmDelete] = useState(false)

    // Edits waiting to be saved, per note, and the timer that will send them.
    const pending = useRef<Map<number, Partial<Note>>>(new Map())
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        apiFetch<{ notes: Note[]; max: number }>('/api/journal')
            .then(d => { setNotes(d.notes); setMax(d.max) })
            .catch(() => setError('Could not open your journal.'))
        // The names that link: every item the Manual knows.
        apiFetch<{ items: { name: string }[] }>('/api/manual/items')
            .then(d => setItemNames(d.items.map(i => i.name).filter(n => n && n.length >= 3)))
            .catch(() => { /* notes still work without links */ })
    }, [])

    const flush = useCallback(async () => {
        if (timer.current) { clearTimeout(timer.current); timer.current = null }
        const batch = [...pending.current.entries()]
        pending.current.clear()
        if (!batch.length) return
        setStatus('saving')
        try {
            for (const [id, fields] of batch) {
                const res = await apiFetch<{ note: Note }>(`/api/journal/${id}`, { method: 'PATCH', body: JSON.stringify(fields) })
                setNotes(ns => ns ? ns.map(n => n.id === id ? { ...n, updatedAt: res.note.updatedAt } : n) : ns)
            }
            setStatus('saved')
        } catch (err) {
            setStatus('unsaved')
            setError((err as { message?: string }).message ?? 'That did not save.')
        }
    }, [])

    // Save anything still waiting when the panel closes.
    useEffect(() => () => { void flush() }, [flush])

    const edit = (id: number, fields: Partial<Note>, now = false) => {
        setNotes(ns => ns ? ns.map(n => n.id === id ? { ...n, ...fields } : n) : ns)
        pending.current.set(id, { ...(pending.current.get(id) ?? {}), ...fields })
        setStatus('unsaved')
        if (timer.current) clearTimeout(timer.current)
        if (now) void flush()
        else timer.current = setTimeout(() => { void flush() }, SAVE_AFTER_MS)
    }

    const open = (id: number | null) => {
        void flush()
        setError(null)
        setOpenId(id)
        const note = notes?.find(n => n.id === id)
        setMode(note && note.body.trim() ? 'read' : 'write')
    }

    const create = async () => {
        await flush()
        setError(null)
        try {
            const res = await apiFetch<{ note: Note }>('/api/journal', { method: 'POST', body: JSON.stringify({ title: '' }) })
            setNotes(ns => [res.note, ...(ns ?? [])])
            setOpenId(res.note.id)
            setMode('write')
        } catch (err) {
            setError((err as { message?: string }).message ?? 'Could not add a note.')
        }
    }

    const remove = async () => {
        if (openId === null) return
        setConfirmDelete(false)
        pending.current.delete(openId)
        try {
            await apiFetch(`/api/journal/${openId}`, { method: 'DELETE' })
            setNotes(ns => ns ? ns.filter(n => n.id !== openId) : ns)
            setOpenId(null)
        } catch (err) {
            setError((err as { message?: string }).message ?? 'Could not remove it.')
        }
    }

    // One pattern for every item name, longest first so "Lanai Planks" wins
    // over "Lanai". Exact spelling: a name is linked only when written right.
    const itemPattern = useMemo(() => {
        if (!itemNames.length) return null
        const names = [...new Set(itemNames)].sort((a, b) => b.length - a.length).map(escapeRegExp)
        return new RegExp(`(?<![\\w'])(${names.join('|')})(?![\\w'])`, 'g')
    }, [itemNames])

    const linkItems = (text: string, key: string): ReactNode[] => {
        if (!itemPattern || !onOpenItem) return [text]
        const out: ReactNode[] = []
        let last = 0
        for (const m of text.matchAll(itemPattern)) {
            const at = m.index ?? 0
            if (at > last) out.push(text.slice(last, at))
            const name = m[1]
            out.push(<button key={`${key}-${at}`} className="jr-item-link" onClick={() => onOpenItem(name)}>{name}</button>)
            last = at + name.length
        }
        if (last < text.length) out.push(text.slice(last))
        return out
    }

    const note = notes?.find(n => n.id === openId) ?? null

    // Tick a checklist line while reading, and save it.
    const toggleLine = (lineIndex: number) => {
        if (!note) return
        const lines = note.body.split('\n')
        const line = lines[lineIndex]
        const m = line.match(/^(\s*[-*] \[)([ xX])(\].*)$/)
        if (!m) return
        lines[lineIndex] = `${m[1]}${m[2] === ' ' ? 'x' : ' '}${m[3]}`
        edit(note.id, { body: lines.join('\n') }, true)
    }

    const onCheck = (e: ChangeEvent<HTMLInputElement>) => toggleLine(Number(e.currentTarget.dataset.line))

    const renderBody = (body: string): ReactNode => {
        const lines = body.split('\n')
        const total = lines.filter(l => /^\s*[-*] \[[ xX]\]/.test(l)).length
        const done = lines.filter(l => /^\s*[-*] \[[xX]\]/.test(l)).length
        return (
            <div className="jr-read">
                {total > 0 && <p className="jr-progress muted-text">{done} of {total} done</p>}
                {lines.map((line, i) => {
                    const check = line.match(/^\s*[-*] \[([ xX])\]\s?(.*)$/)
                    if (check) {
                        const ticked = check[1] !== ' '
                        return (
                            <label key={i} className={`jr-check ${ticked ? 'done' : ''}`}>
                                <input type="checkbox" checked={ticked} data-line={i} onChange={onCheck} />
                                <span>{linkItems(check[2], `l${i}`)}</span>
                            </label>
                        )
                    }
                    const bullet = line.match(/^\s*[-*]\s+(.*)$/)
                    if (bullet) return <p key={i} className="jr-bullet">{linkItems(bullet[1], `l${i}`)}</p>
                    if (!line.trim()) return <div key={i} className="jr-gap" />
                    return <p key={i} className="jr-line">{linkItems(line, `l${i}`)}</p>
                })}
            </div>
        )
    }

    // A new checklist line at the cursor (or at the end), and focus back.
    const bodyRef = useRef<HTMLTextAreaElement | null>(null)
    const addChecklistLine = () => {
        if (!note) return
        const el = bodyRef.current
        const body = note.body
        const at = el ? el.selectionStart : body.length
        const before = body.slice(0, at)
        const prefix = before.length && !before.endsWith('\n') ? '\n' : ''
        const insert = `${prefix}- [ ] `
        const next = (before + insert + body.slice(at)).slice(0, BODY_MAX)
        edit(note.id, { body: next })
        requestAnimationFrame(() => {
            if (!el) return
            el.focus()
            const pos = Math.min(next.length, at + insert.length)
            el.setSelectionRange(pos, pos)
        })
    }

    const needle = search.trim().toLowerCase()
    const shown = notes ? ordered(notes).filter(n => !needle || n.title.toLowerCase().includes(needle) || n.body.toLowerCase().includes(needle)) : []

    return (
        <DockableWindow
            dock={dock}
            enabled={!isMobile}
            onClose={onClose}
            className={`journal-panel ${closing ? 'closing' : ''}`}
            dragHandleClassName="settings-header"
        >
            <div className="settings-header">
                <h3 className="gold-text">Journal</h3>
                <div className="settings-header-actions">
                    {!isMobile && (
                        <button className="dock-btn" onClick={dock.togglePop} title={dock.isPopped ? 'Dock panel' : 'Pop out'}>
                            {dock.isPopped ? '⤡' : '⤢'}
                        </button>
                    )}
                    {!isMobile && dock.isPopped && (
                        <button className={`dock-btn ${dock.isPinned ? 'active' : ''}`} onClick={dock.togglePin} title={dock.isPinned ? 'Unpin (click-away closes)' : 'Pin on top'}>📌</button>
                    )}
                    <button className="modal-close-btn" onClick={onClose} aria-label="Close">{'✕'}</button>
                </div>
            </div>

            <div className={`jr-body ${note ? 'reading' : 'listing'}`}>
                <aside className="jr-list">
                    <div className="jr-list-head">
                        <input
                            className="jr-search"
                            placeholder="Search your notes"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        <button className="btn btn-gold jr-new" onClick={create} disabled={!notes || notes.length >= max}>+ New</button>
                    </div>
                    <p className="jr-count muted-text tabular-num">{notes ? `${notes.length} of ${max} notes` : 'Opening…'}</p>
                    {notes && notes.length === 0 && (
                        <p className="jr-empty muted-text">
                            Nothing written yet. Notes are yours alone: what you are saving for, what to fetch next
                            time you pass a town, a list to tick off.
                        </p>
                    )}
                    {shown.map(n => (
                        <button key={n.id} className={`jr-note-row ${n.id === openId ? 'active' : ''}`} onClick={() => open(n.id)}>
                            <span className={`jr-dot ${n.color ? `jr-c-${n.color}` : ''}`} />
                            <span className="jr-row-text">
                                <span className="jr-row-title">{n.pinned ? '📌 ' : ''}{n.title}</span>
                                <span className="jr-row-snippet muted-text">{n.body.replace(/^\s*[-*] \[[ xX]\]\s?/gm, '').split('\n').find(l => l.trim()) ?? 'Empty'}</span>
                            </span>
                        </button>
                    ))}
                    {notes && notes.length > 0 && shown.length === 0 && <p className="jr-empty muted-text">No note mentions that.</p>}
                </aside>

                <section className="jr-note">
                    {error && <p className="guild-error">{error}</p>}
                    {!note ? (
                        <p className="jr-empty muted-text">Pick a note, or start a new one.</p>
                    ) : (
                        <>
                            <button className="btn mobile-back-btn" onClick={() => open(null)}>‹ Notes</button>
                            <input
                                className="jr-title"
                                value={note.title}
                                maxLength={80}
                                placeholder="Untitled"
                                onChange={e => edit(note.id, { title: e.target.value })}
                            />
                            <div className="jr-tools">
                                <div className="jr-modes">
                                    <button className={`btn ${mode === 'read' ? 'btn-gold' : ''}`} onClick={() => setMode('read')}>Read</button>
                                    <button className={`btn ${mode === 'write' ? 'btn-gold' : ''}`} onClick={() => setMode('write')}>Write</button>
                                </div>
                                <div className="jr-colors" role="radiogroup" aria-label="Colour">
                                    <button className={`jr-swatch ${!note.color ? 'on' : ''}`} onClick={() => edit(note.id, { color: null }, true)} title="No colour" aria-label="No colour" />
                                    {COLORS.map(c => (
                                        <button
                                            key={c.key}
                                            className={`jr-swatch jr-c-${c.key} ${note.color === c.key ? 'on' : ''}`}
                                            onClick={() => edit(note.id, { color: c.key }, true)}
                                            title={c.label}
                                            aria-label={c.label}
                                        />
                                    ))}
                                </div>
                                <button className={`btn jr-pin ${note.pinned ? 'btn-gold' : ''}`} onClick={() => edit(note.id, { pinned: !note.pinned }, true)}>
                                    {note.pinned ? 'Pinned' : 'Pin'}
                                </button>
                                <button className="btn jr-delete" onClick={() => setConfirmDelete(true)}>Remove</button>
                            </div>

                            {mode === 'write' ? (
                                <>
                                    <div className="jr-write-bar">
                                        <button className="btn" onClick={addChecklistLine}>☐ Checklist line</button>
                                        <span className="muted-text tabular-num">{note.body.length.toLocaleString()} / {BODY_MAX.toLocaleString()}</span>
                                    </div>
                                    <textarea
                                        ref={bodyRef}
                                        className="jr-textarea"
                                        value={note.body}
                                        maxLength={BODY_MAX}
                                        placeholder={'Write anything. A line starting "- [ ] " is a checklist item; item names spelled right become links when you read it.'}
                                        onChange={e => edit(note.id, { body: e.target.value })}
                                    />
                                </>
                            ) : (
                                note.body.trim()
                                    ? renderBody(note.body)
                                    : <p className="jr-empty muted-text">This note is empty. Choose Write to add to it.</p>
                            )}
                            <p className="jr-status muted-text">{status === 'saving' ? 'Saving…' : status === 'unsaved' ? 'Not saved yet' : 'Saved'}</p>
                        </>
                    )}
                </section>
            </div>

            {confirmDelete && note && (
                <ConfirmModal
                    message={`Remove "${note.title}" from your journal? This cannot be undone.`}
                    confirmLabel="Remove"
                    onConfirm={remove}
                    onCancel={() => setConfirmDelete(false)}
                />
            )}
        </DockableWindow>
    )
}
