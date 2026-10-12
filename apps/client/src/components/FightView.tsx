import { useEffect, useState } from 'react'
import { getItemIcon } from '../lib/items'
import { openBestiary, type FightFood, type FightState, type Hp } from '../lib/combat'
import { useItemTooltip } from './ItemTooltip'
import './FightView.css'

export interface FightLogLine {
    id: number
    text: string
    kind: 'you' | 'foe' | 'kill' | 'info'
}

interface FightViewProps {
    fight: FightState | null
    hp: Hp | null
    log: FightLogLine[]
    food: FightFood[]
    sceneText: string
    fleeLabel: string
    busy: boolean
    onEat: (itemId: number) => void
    onFlee: () => void
}

function Bar({ current, max, kind }: { current: number; max: number; kind: 'you' | 'foe' }) {
    const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0
    return (
        <div className="fight-bar">
            <div className={`fight-bar-fill ${kind}`} style={{ width: `${pct}%` }} />
            <span className="fight-bar-label">{Math.max(0, current)} / {max}</span>
        </div>
    )
}

/**
 * The fight, while it runs (docs/combat-spec.md §9, §10): food along the top,
 * a tap eats one; both health bars; the swings as they land; and the way out.
 * Everything shown comes from the server's pushes (GameView listens).
 */
export default function FightView({ fight, hp, log, food, sceneText, fleeLabel, busy, onEat, onFlee }: FightViewProps) {
    const { hoverProps, tooltipEl } = useItemTooltip()

    // The approach is the only thing that counts down on the client, and it
    // only counts toward a time the server set.
    const [now, setNow] = useState(() => Date.now())
    const engageAt = fight ? new Date(fight.engageAt).getTime() : 0
    const approaching = !!fight && engageAt > now
    const fighting = !!fight
    useEffect(() => {
        if (!fighting) return
        const t = window.setInterval(() => setNow(Date.now()), 250)
        return () => clearInterval(t)
    }, [fighting])

    return (
        <div className="fight-view">
            <p className="scene-action-text gold-text">{sceneText}</p>

            <div className="fight-food">
                {food.length === 0 ? (
                    <span className="fight-food-empty muted-text">You carry nothing that mends.</span>
                ) : food.map(f => (
                    <div
                        key={f.itemId}
                        className={`inventory-slot occupied fight-food-slot ${busy ? 'busy' : ''}`}
                        {...hoverProps({ name: f.name }, `Click to eat (mends ${f.heal})`)}
                        onClick={() => !busy && onEat(f.itemId)}
                    >
                        <img
                            src={getItemIcon(f.name)}
                            alt={f.name}
                            className="inventory-item-icon"
                            onError={e => {
                                e.currentTarget.style.display = 'none'
                                e.currentTarget.nextElementSibling?.removeAttribute('style')
                            }}
                        />
                        <span className="inventory-item-text" style={{ display: 'none' }}>{f.name}</span>
                        <span className="inventory-item-qty">{f.quantity}</span>
                    </div>
                ))}
            </div>

            <div className="fight-sides">
                <div className="fight-side">
                    <span className="fight-side-name">You</span>
                    {hp ? <Bar current={hp.current} max={hp.max} kind="you" /> : <div className="fight-bar" />}
                    {fight?.weapon && <span className="fight-side-note muted-text">{fight.weapon}</span>}
                </div>
                <div className="fight-side">
                    <span className="fight-side-name">
                        {fight ? `${fight.creature.name}` : '...'}
                        {fight && <span className="muted-text"> (level {fight.creature.level})</span>}
                    </span>
                    {fight && !approaching
                        ? <Bar current={fight.enemyHp} max={fight.enemyMaxHp} kind="foe" />
                        : <div className="fight-bar"><span className="fight-bar-label">
                            {fight ? `Closing in, ${Math.max(1, Math.ceil((engageAt - now) / 1000))}s` : ''}
                        </span></div>}
                    {fight?.stances && (fight.stances.weak.length > 0 || fight.stances.resists.length > 0) && (
                        <span className="fight-side-note">
                            {fight.stances.weak.length > 0 && <span className="fight-weak">Weak to {fight.stances.weak.join(', ')}</span>}
                            {fight.stances.weak.length > 0 && fight.stances.resists.length > 0 && ' · '}
                            {fight.stances.resists.length > 0 && <span className="muted-text">shrugs off {fight.stances.resists.join(', ')}</span>}
                        </span>
                    )}
                    {fight && (
                        <span className="fight-side-note muted-text">
                            {fight.kills} {fight.kills === 1 ? 'kill' : 'kills'} ·{' '}
                            <button className="fight-bestiary-link" onClick={() => openBestiary(fight.creature.id)}>Bestiary</button>
                        </span>
                    )}
                </div>
            </div>

            {fight?.frozen && (
                <p className="fight-frozen gold-text">You catch your breath. Answer the question to carry on.</p>
            )}

            <div className="fight-log">
                {log.length === 0
                    ? <p className="fight-log-line info muted-text">You wait for the first blow.</p>
                    : [...log].reverse().slice(0, 8).map(line => (
                        <p key={line.id} className={`fight-log-line ${line.kind}`}>{line.text}</p>
                    ))}
            </div>

            <button className="btn btn-red scene-cancel-btn" disabled={busy} onClick={onFlee}>{fleeLabel}</button>
            {tooltipEl}
        </div>
    )
}
