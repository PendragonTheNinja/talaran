import './PropertyStorage.css'
import { SORT_MODES, type ItemSortMode, type StoreSort } from '../lib/itemSort'

// Search and sort for a storage grid (property and shop storage), the same
// choices the pack offers in LeftPanel.tsx. The choice is remembered per grid
// in this browser only; the search is not.

export default function StoreSortBar({ sort, onChange }: { sort: StoreSort; onChange: (next: StoreSort) => void }) {
    return (
        <div className="store-sortbar">
            <input
                className="store-search"
                type="search"
                placeholder="Search…"
                value={sort.filter}
                onChange={e => onChange({ ...sort, filter: e.target.value })}
            />
            <select
                className="store-sort-select"
                value={sort.mode}
                onChange={e => onChange({ ...sort, mode: e.target.value as ItemSortMode, dir: e.target.value === 'quantity' ? 'desc' : 'asc' })}
            >
                {SORT_MODES.map(m => <option key={m.mode} value={m.mode}>{m.label}</option>)}
            </select>
            <button
                type="button"
                className="store-sort-dir"
                title={sort.dir === 'asc' ? 'Ascending' : 'Descending'}
                onClick={() => onChange({ ...sort, dir: sort.dir === 'asc' ? 'desc' : 'asc' })}
            >
                {sort.dir === 'asc' ? '↑' : '↓'}
            </button>
        </div>
    )
}
