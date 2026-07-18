import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'

type ColumnKind = 'boolean' | 'integer' | 'float' | 'string' | 'text' | 'json' | 'array'

interface RefRow { id: number; name: string }

// FK id columns rendered as dropdowns — mirror of the server's REF_ID_COLUMNS
const REF_ID_COLUMNS: Record<string, string> = {
    item_id: 'items',
    npc_id: 'npcs',
    skill_id: 'skills',
    location_id: 'locations',
    from_location_id: 'locations',
    to_location_id: 'locations',
    trap_type_id: 'trap_types',
    quest_id: 'quests',
    resource_node_id: 'resource_nodes',
}

// Name-reference columns rendered as dropdowns — mirror of the server's REF_COLUMNS
const REF_NAME_COLUMNS: Record<string, string> = {
    output_item_name: 'items',
    item_name: 'items',
    target_item: 'items',
    npc_name: 'npcs',
    skill: 'skills',
    for_skill: 'skills',
}

interface Props {
    table: string
    label: string
    columns: string[]
    columnKinds: Record<string, ColumnKind>
    initialValues?: Record<string, string>
    onCreated: () => void
    onCancel: () => void
}

export default function AdminContentCreate({ table, label, columns, columnKinds, initialValues, onCreated, onCancel }: Props) {
    const [refs, setRefs] = useState<Record<string, RefRow[]>>({})
    const [values, setValues] = useState<Record<string, string>>(initialValues ?? {})
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    const fields = columns.filter(c => !['id', 'created_at', 'updated_at'].includes(c))

    useEffect(() => {
        apiFetch<{ refs: Record<string, RefRow[]> }>('/api/admin/content/refs')
            .then(d => setRefs(d.refs))
            .catch((err: any) => setError(err.message || 'Could not load reference options.'))
    }, [])

    const setField = (c: string, v: string) => setValues(prev => ({ ...prev, [c]: v }))

    const submit = async () => {
        setSaving(true)
        setError(null)
        const payload: Record<string, unknown> = {}
        try {
            for (const c of fields) {
                const raw = values[c]
                if (raw === undefined || raw === '') continue  // blank = omit, DB default applies
                const kind = columnKinds[c] || 'string'
                if (REF_ID_COLUMNS[c]) payload[c] = parseInt(raw)
                else if (kind === 'boolean') payload[c] = raw === 'true'
                else if (kind === 'integer') {
                    const n = parseInt(raw)
                    if (!Number.isInteger(n)) throw new Error(`${c}: must be a whole number`)
                    payload[c] = n
                } else if (kind === 'float') {
                    const n = parseFloat(raw)
                    if (!Number.isFinite(n)) throw new Error(`${c}: must be a number`)
                    payload[c] = n
                } else if (kind === 'json' || kind === 'array') {
                    try { payload[c] = JSON.stringify(JSON.parse(raw)) }
                    catch { throw new Error(`${c}: invalid JSON`) }
                } else {
                    payload[c] = raw
                }
            }
        } catch (err: any) {
            setError(err.message)
            setSaving(false)
            return
        }

        try {
            await apiFetch(`/api/admin/content/table/${table}`, {
                method: 'POST',
                body: JSON.stringify({ values: payload }),
            })
            onCreated()
        } catch (err: any) {
            setError(err.message || 'Create failed.')
        } finally {
            setSaving(false)
        }
    }

    const renderField = (c: string) => {
        const kind = columnKinds[c] || 'string'
        const v = values[c] ?? ''

        if (REF_ID_COLUMNS[c]) {
            const options = refs[REF_ID_COLUMNS[c]] || []
            return (
                <select className="chat-input" value={v} onChange={e => setField(c, e.target.value)}>
                    <option value="">— none —</option>
                    {options.map(o => <option key={o.id} value={o.id}>{o.name} (#{o.id})</option>)}
                </select>
            )
        }
        if (REF_NAME_COLUMNS[c]) {
            const options = refs[REF_NAME_COLUMNS[c]] || []
            return (
                <select className="chat-input" value={v} onChange={e => setField(c, e.target.value)}>
                    <option value="">— none —</option>
                    {options.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
                </select>
            )
        }
        if (kind === 'boolean') {
            return (
                <select className="chat-input" value={v} onChange={e => setField(c, e.target.value)}>
                    <option value="">— default —</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                </select>
            )
        }
        if (kind === 'text' || kind === 'json' || kind === 'array') {
            return (
                <textarea
                    className="admin-overlay-textarea"
                    rows={kind === 'text' ? 2 : 3}
                    placeholder={kind === 'array' ? '["First line.", "Second line."]' : kind === 'json' ? '{ ... } or [ ... ]' : ''}
                    value={v}
                    onChange={e => setField(c, e.target.value)}
                    spellCheck={false}
                />
            )
        }
        return (
            <input
                className="chat-input"
                type={kind === 'string' ? 'text' : 'number'}
                step={kind === 'float' ? 'any' : undefined}
                value={v}
                onChange={e => setField(c, e.target.value)}
            />
        )
    }

    return (
        <div className="admin-overlay-editor">
            <p className="admin-section-title" style={{ marginBottom: '8px' }}>
                New row · {label}
                <span className="muted-text" style={{ marginLeft: '8px', letterSpacing: 'normal' }}>
                    {initialValues ? 'duplicated — give it a new name' : 'blank fields use the column default'}
                </span>
            </p>
            {error && <p className="guild-error">{error}</p>}
            <div className="admin-create-grid">
                {fields.map(c => (
                    <label key={c} className="admin-balance-field">
                        <span>{c}</span>
                        {renderField(c)}
                    </label>
                ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button className="btn btn-gold" disabled={saving} onClick={submit}>{saving ? 'Creating...' : 'Create Row'}</button>
                <button className="btn" onClick={onCancel}>Cancel</button>
            </div>
        </div>
    )
}
