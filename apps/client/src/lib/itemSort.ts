import { useState } from 'react'

// Ordering and filtering a grid of items, for display only: nothing is written
// back. One rule for every grid that offers it (the pack in LeftPanel.tsx,
// property and shop storage), so a "Name" sort means the same thing anywhere.
//
// `category` sorts by type, then subtype, then name. Type alone is too coarse:
// `material` is roughly half the item table, so without the subtype pass a
// "sorted" bag is still one enormous undifferentiated block.

export type ItemSortMode = 'category' | 'name' | 'quantity' | 'recent'
export type ItemSortDir = 'asc' | 'desc'

export interface SortableItem {
    name: string
    quantity: number
    type?: string | null
    subtype?: string | null
    /** Ascends with when the stack was gained, where a grid has it (the pack). */
    id?: number
}

export function sortItems<T extends SortableItem>(items: T[], mode: ItemSortMode, dir: ItemSortDir, filter: string): T[] {
    const q = filter.trim().toLowerCase()
    const filtered = q
        ? items.filter(i =>
            i.name.toLowerCase().includes(q) ||
            (i.subtype || '').toLowerCase().includes(q) ||
            (i.type || '').toLowerCase().includes(q))
        : items

    const byName = (a: T, b: T) => a.name.localeCompare(b.name)

    // Comparators are written ascending; direction is applied once at the end,
    // so every mode reverses consistently and there is one place to get wrong.
    let cmp: (a: T, b: T) => number
    switch (mode) {
        case 'name':
            cmp = byName
            break
        case 'quantity':
            cmp = (a, b) => (a.quantity - b.quantity) || byName(a, b)
            break
        case 'recent':
            cmp = (a, b) => ((a.id ?? 0) - (b.id ?? 0)) || byName(a, b)
            break
        case 'category':
        default:
            cmp = (a, b) =>
                (a.type || '').localeCompare(b.type || '') ||
                (a.subtype || '').localeCompare(b.subtype || '') ||
                byName(a, b)
    }

    const sorted = [...filtered].sort(cmp)
    return dir === 'desc' ? sorted.reverse() : sorted
}

// ── A storage grid's sort, remembered per grid (StoreSortBar.tsx) ────────────

export interface StoreSort { mode: ItemSortMode; dir: ItemSortDir; filter: string }

export const SORT_MODES: { mode: ItemSortMode; label: string }[] = [
    { mode: 'category', label: 'Category' },
    { mode: 'name', label: 'Name' },
    { mode: 'quantity', label: 'Quantity' },
]

function remembered(key: string): Pick<StoreSort, 'mode' | 'dir'> {
    try {
        const saved = JSON.parse(localStorage.getItem(key) || 'null')
        if (saved && SORT_MODES.some(m => m.mode === saved.mode) && (saved.dir === 'asc' || saved.dir === 'desc')) return saved
    } catch { /* private window or bad data: the default */ }
    return { mode: 'category', dir: 'asc' }
}

/** The sort state for one grid, remembered under `key`. */
export function useStoreSort(key: string): [StoreSort, (next: StoreSort) => void] {
    const [sort, setSort] = useState<StoreSort>(() => ({ ...remembered(key), filter: '' }))
    const update = (next: StoreSort) => {
        setSort(next)
        try { localStorage.setItem(key, JSON.stringify({ mode: next.mode, dir: next.dir })) } catch { /* not saved */ }
    }
    return [sort, update]
}

