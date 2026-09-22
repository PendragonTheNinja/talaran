import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { getItemIcon } from '../lib/items'
import './PropertyStorage.css'
import { useItemTooltip } from './ItemTooltip'

interface StoredItem { itemId: number; quantity: number; name: string; type: string; subtype?: string }

/** A row of the player's own pack, as /api/inventory returns it. */
interface CarriedItem {
    item_id: number
    quantity: number
    name: string
    type: string
    subtype?: string
    description?: string
    quality?: string
}

interface StorageState {
    hasProperty: boolean
    propertyType?: string
    slots: number
    used: number
    items: StoredItem[]
}

interface PropertyStorageProps {
    storeMode: boolean
    onToggleStoreMode: () => void
    storeAmount: number
    onStoreAmountChange: (n: number) => void
    /** bumped by the parent whenever the inventory changes, so the grid refreshes */
    refreshKey?: number
}

export default function PropertyStorage({
    storeMode, onToggleStoreMode, storeAmount, onStoreAmountChange, refreshKey,
}: PropertyStorageProps) {
    const [data, setData] = useState<StorageState | null>(null)
    const [loading, setLoading] = useState(true)
    // Stored items get the same tooltip the pack does.
    const { hoverProps, tooltipEl } = useItemTooltip()
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    // Kept as text so the field can be cleared/retyped; only valid values commit.
    const [amountText, setAmountText] = useState(String(storeAmount))
    useEffect(() => { setAmountText(String(storeAmount)) }, [storeAmount])

    /**
     * The pack, shown beneath the store.
     *
     * Deposit Mode works by tapping the real inventory panel, which is fine on
     * a desktop where both are on screen at once. On a phone they cannot be:
     * the homestead window covers the inventory, so there was NO way to deposit
     * anything at all until you got to a computer. A copy of the pack here,
     * tapped to send items up, is how the shop already solves it.
     */
    const [carried, setCarried] = useState<CarriedItem[]>([])

    const load = useCallback(() => {
        return Promise.all([
            apiFetch<StorageState>('/api/property/storage'),
            apiFetch<{ inventory: CarriedItem[] }>('/api/inventory'),
        ])
            .then(([store, pack]) => {
                setData(store)
                setCarried(pack.inventory ?? [])
            })
            .catch(() => setError('Could not open your store.'))
            .finally(() => setLoading(false))
    }, [])
    useEffect(() => { load() }, [load, refreshKey])

    async function deposit(item: CarriedItem) {
        setBusy(true); setError('')
        try {
            const qty = Math.min(storeAmount || 1, item.quantity)
            await apiFetch('/api/property/storage/deposit', {
                method: 'POST',
                body: JSON.stringify({ itemId: item.item_id, quantity: qty }),
            })
            await load()
            // The inventory panel hears about this from the server's
            // inventory_changed socket event, which the deposit path now
            // emits the same way withdraw always has.
        } catch (e: any) {
            setError(e.message || 'That did not work.')
        } finally {
            setBusy(false)
        }
    }

    async function withdraw(item: StoredItem) {
        setBusy(true); setError('')
        try {
            const qty = Math.min(storeAmount || 1, item.quantity)
            await apiFetch('/api/property/storage/withdraw', {
                method: 'POST',
                body: JSON.stringify({ itemId: item.itemId, quantity: qty }),
            })
            await load()
        } catch (e: any) {
            setError(e.message || 'That did not work.')
        } finally {
            setBusy(false)
        }
    }

    if (loading) return <p className="store-empty">Opening the store…</p>
    if (!data?.hasProperty) return <p className="store-empty">You have nothing of your own here.</p>

    const full = data.used >= data.slots


    return (
        <div className="store">
            <div className="store-head">
                <span className={full ? 'store-full' : ''}>{data.used} / {data.slots} slots</span>
                <div className="store-controls">
                    <label className="store-amt-label">
                        Amount
                        <input
                            className="store-amt"
                            type="number"
                            min={1}
                            value={amountText}
                            onChange={e => {
                                const text = e.target.value
                                setAmountText(text)
                                const n = parseInt(text)
                                if (!Number.isNaN(n) && n >= 1) onStoreAmountChange(n)
                            }}
                            onBlur={() => {
                                const n = parseInt(amountText)
                                if (Number.isNaN(n) || n < 1) { setAmountText('1'); onStoreAmountChange(1) }
                            }}
                        />
                    </label>
                    <button
                        className={`store-mode-btn ${storeMode ? 'active' : ''}`}
                        onClick={onToggleStoreMode}
                        title={storeMode
                            ? 'Deposit Mode ON. Tap items in your inventory to store them'
                            : 'Turn on Deposit Mode, then tap items in your inventory to store them'}
                    >
                        {storeMode ? 'Deposit Mode: ON' : 'Deposit Mode: OFF'}
                    </button>
                </div>
            </div>

            {storeMode && (
                <p className="store-note">Tap items in your inventory to store them. Tap items in the store to take them back.</p>
            )}
            {full && <p className="store-note">The store is full, though existing stacks can still be topped up.</p>}
            {error && <p className="store-error">{error}</p>}

            <div className="store-grid panel-inset">
                {data.items.length === 0 && <p className="store-empty">Nothing stored here yet.</p>}
                {data.items.map(item => (
                    <div
                        key={item.itemId}
                        className="inventory-slot occupied store-slot"
                        {...hoverProps(item, `Left-click to take ${Math.min(storeAmount || 1, item.quantity)}`)}
                        onClick={() => !busy && withdraw(item)}
                    >
                        <img
                            src={getItemIcon(item.name)}
                            alt={item.name}
                            className="inventory-item-icon"
                            onError={e => {
                                e.currentTarget.style.display = 'none'
                                e.currentTarget.nextElementSibling?.setAttribute('style', '')
                            }}
                        />
                        <span className="store-fallback" style={{ display: 'none' }}>{item.name}</span>
                        <span className="inventory-item-qty">{item.quantity.toLocaleString()}</span>
                    </div>
                ))}
            </div>

            {/* Carrying. Works on any screen and needs no mode: tap to store,
                tap above to take back. Deposit Mode still works for tapping the
                real inventory panel on a desktop. */}
            <p className="store-section">Carrying</p>
            <div className="store-grid panel-inset">
                {carried.length === 0 && <p className="store-empty">Your pack is empty.</p>}
                {carried.map(item => (
                    <div
                        key={item.item_id}
                        className="inventory-slot occupied store-slot"
                        {...hoverProps(item, `Left-click to store ${Math.min(storeAmount || 1, item.quantity)}`)}
                        onClick={() => !busy && deposit(item)}
                    >
                        <img
                            src={getItemIcon(item.name)}
                            alt={item.name}
                            className="inventory-item-icon"
                            onError={e => {
                                e.currentTarget.style.display = 'none'
                                e.currentTarget.nextElementSibling?.setAttribute('style', '')
                            }}
                        />
                        <span className="store-fallback" style={{ display: 'none' }}>{item.name}</span>
                        <span className="inventory-item-qty">{item.quantity.toLocaleString()}</span>
                    </div>
                ))}
            </div>
            {tooltipEl}
        </div>
    )
}
