import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import { getItemIcon } from '../lib/items'
import './PropertyStorage.css'

// Sending (server: services/spells.ts): one stack between the pack and a store
// of your own, from anywhere on the island. The store chosen in the spellbook
// shows here beside the pack, on the storage panel's own tiles; tapping a
// stack sends all of it the other way.

export interface SendingStore {
    label: string
    cost: number
    params: Record<string, unknown>
    detail?: { slots: number; used: number; items: { itemId: number; name: string; quantity: number }[] }
}

interface Carried { item_id: number; name: string; quantity: number; synthetic?: boolean }

function Tile({ name, quantity, hint, disabled, onClick }: {
    name: string; quantity: number; hint: string; disabled: boolean; onClick: () => void
}) {
    return (
        <div className="inventory-slot occupied store-slot" title={`${name}: ${hint}`} onClick={() => !disabled && onClick()}>
            <img
                src={getItemIcon(name)}
                alt={name}
                className="inventory-item-icon"
                onError={e => {
                    e.currentTarget.style.display = 'none'
                    e.currentTarget.nextElementSibling?.setAttribute('style', '')
                }}
            />
            <span className="store-fallback" style={{ display: 'none' }}>{name}</span>
            <span className="inventory-item-qty">{quantity.toLocaleString()}</span>
        </div>
    )
}

export default function SendingPicker({ store, busy, onSend }: {
    store: SendingStore
    busy: boolean
    onSend: (params: Record<string, unknown>) => void
}) {
    const [carried, setCarried] = useState<Carried[] | null>(null)
    useEffect(() => {
        // Open containers ride along as synthetic tiles; they have no stack to send.
        apiFetch<{ inventory: Carried[] }>('/api/inventory')
            .then(d => setCarried(d.inventory.filter(i => !i.synthetic && i.quantity > 0)))
            .catch(() => setCarried([]))
    }, [])

    const stored = store.detail?.items ?? []
    const full = (store.detail?.used ?? 0) >= (store.detail?.slots ?? 50)
    const send = (itemId: number, quantity: number, direction: 'store' | 'fetch') =>
        onSend({ ...store.params, itemId, quantity, direction })

    return (
        <div className="spell-sending">
            <p className="store-section">In your {store.label.toLowerCase()} ({store.detail?.used ?? 0} / {store.detail?.slots ?? 50})</p>
            <div className="store-grid panel-inset">
                {stored.length === 0 && <p className="store-empty">Nothing stored there.</p>}
                {stored.map(i => (
                    <Tile key={i.itemId} name={i.name} quantity={i.quantity} hint="fetch the stack to your pack"
                        disabled={busy} onClick={() => send(i.itemId, i.quantity, 'fetch')} />
                ))}
            </div>
            <p className="store-section">Carrying{full ? ' (the store is full; only stacks already there can be topped up)' : ''}</p>
            <div className="store-grid panel-inset">
                {carried === null && <p className="store-empty">Opening your pack…</p>}
                {carried?.length === 0 && <p className="store-empty">Your pack is empty.</p>}
                {carried?.map(i => (
                    <Tile key={i.item_id} name={i.name} quantity={i.quantity} hint="send the stack to the store"
                        disabled={busy} onClick={() => send(i.item_id, i.quantity, 'store')} />
                ))}
            </div>
        </div>
    )
}
