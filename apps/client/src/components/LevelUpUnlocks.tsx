import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import { getItemIcon } from '../lib/items'

/**
 * What a new level opens, under the level-up popup (services/unlocks.ts):
 * gear now wearable, recipes, places to gather, animals, roads. Nothing
 * opened at this level means no section at all.
 */

interface Unlock {
    name: string
    icon: string | null
}

const SHOWN = 6

export default function LevelUpUnlocks({ skill, level }: { skill: string; level: number }) {
    const [unlocks, setUnlocks] = useState<Unlock[]>([])

    useEffect(() => {
        let live = true
        apiFetch<{ unlocks: Unlock[] }>(`/api/player/unlocks/${encodeURIComponent(skill)}/${level}`)
            .then(d => { if (live) setUnlocks(d.unlocks ?? []) })
            .catch(() => { /* the popup works without it */ })
        return () => { live = false }
    }, [skill, level])

    if (!unlocks.length) return null
    const extra = unlocks.length - SHOWN

    return (
        <div className="levelup-unlocks">
            <p className="levelup-unlocks-title">Now open to you</p>
            <ul className="levelup-unlocks-list">
                {unlocks.slice(0, SHOWN).map(u => (
                    <li key={u.name} className="levelup-unlock">
                        {u.icon && (
                            <img
                                src={getItemIcon(u.icon)}
                                alt=""
                                className="levelup-unlock-icon"
                                onError={e => { e.currentTarget.style.display = 'none' }}
                            />
                        )}
                        <span>{u.name}</span>
                    </li>
                ))}
            </ul>
            {extra > 0 && <p className="levelup-unlocks-more muted-text">and {extra} more</p>}
        </div>
    )
}
