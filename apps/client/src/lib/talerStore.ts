import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from './api'

/**
 * The Taler store as the client sees it (server: routes/store.ts,
 * services/store.ts). One hook for every panel that reads or sells from it:
 * Support sells themes and perks, Settings only needs to know what is owned.
 * A purchase in one tells the others to refetch, so an open Settings panel
 * picks up a theme bought in Support without a reload.
 */

export interface StoreItem {
    key: string
    name: string
    description: string
    price: number
    effectivePrice: number
    grants: string[]
    available: boolean
    seasonal: boolean
    saleEndsAt: string | null
    owned: boolean
}

export interface StoreState {
    balance: number
    unlocks: string[]
    items: StoreItem[]
}

const STORE_CHANGED = 'talaran:store-changed'

/** Open the Support panel at a tab ('talers' | 'themes' | 'perks'). GameLayout listens. */
export function openSupport(tab?: SupportTab) {
    window.dispatchEvent(new CustomEvent<{ tab?: SupportTab }>('talaran:open-support', { detail: { tab } }))
}

export type SupportTab = 'talers' | 'themes' | 'perks'

export function useTalerStore() {
    const [store, setStore] = useState<StoreState | null>(null)

    const refresh = useCallback(async () => {
        const s = await apiFetch<StoreState>('/api/store')
        setStore(s)
        return s
    }, [])

    useEffect(() => {
        apiFetch<StoreState>('/api/store')
            .then(setStore)
            .catch(() => { /* the store is optional; callers degrade to free themes */ })
        const onChanged = () => { refresh().catch(() => { }) }
        window.addEventListener(STORE_CHANGED, onChanged)
        return () => window.removeEventListener(STORE_CHANGED, onChanged)
    }, [refresh])

    /** Buy by key. Throws the server's refusal (e.g. 'Not enough Talers.'). */
    const buy = useCallback(async (key: string) => {
        const res = await apiFetch<{ balance: number; granted: string[] }>('/api/store/purchase', {
            method: 'POST',
            body: JSON.stringify({ key }),
        })
        window.dispatchEvent(new Event(STORE_CHANGED))
        return res
    }, [])

    const item = useCallback((key: string) => store?.items.find(i => i.key === key), [store])
    const owns = useCallback((unlock: string) => !!store?.unlocks.includes(unlock), [store])

    return { store, refresh, buy, item, owns }
}
