import { useEffect, useRef, useState } from 'react'
import { avatarSrc } from '../lib/avatar'
import { getCreatureImage, getItemIcon } from '../lib/items'
import { openBestiary, type FightFood, type FightState, type Hp } from '../lib/combat'
import { useItemTooltip } from './ItemTooltip'
import './FightView.css'

export interface FightLogLine {
    id: number
    text: string
    kind: 'you' | 'foe' | 'kill' | 'info'
    /** A swing that drew blood: the side it landed on flashes. */
    hit?: boolean
    /** On a kill: who fell, and when, so the portrait can grey out before the next one. */
    creature?: string
    at?: number
}

/** The last kill's pay: what GameView keeps as lastResult for a kill. */
export interface FightSpoils {
    message?: string
    xpAwards?: { skill: string; xp: number }[]
    drops?: { name: string; quantity: number; notable?: boolean }[]
    eventXp?: number
}

/** How long a fallen creature stays on screen, greyed, before the next one shows. */
const FALLEN_MS = 1500

interface FightViewProps {
    fight: FightState | null
    hp: Hp | null
    log: FightLogLine[]
    food: FightFood[]
    /** The last kill's XP and drops, shown in the fight rather than below it. */
    spoils: FightSpoils | null
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
 * One side of the face-off. The picture falls back to an initial in a frame
 * (a player with no avatar, a creature whose art is not drawn yet). `flashKey`
 * is the id of the last swing that landed on this side; keying the flash on it
 * replays the animation once per hit.
 */
function Portrait({ src, name, flashKey, state }: { src: string | null; name: string; flashKey: number | null; state?: 'approaching' | 'fallen' }) {
    const [failed, setFailed] = useState<string | null>(null)
    const showImage = src && failed !== src
    return (
        <div className={`fight-portrait ${state ?? ''}`}>
            {showImage
                ? <img src={src} alt={name} onError={() => setFailed(src)} />
                : <span className="fight-portrait-initial">{name.charAt(0).toUpperCase()}</span>}
            {flashKey !== null && <span key={flashKey} className="fight-portrait-flash" />}
        </div>
    )
}

/** An item as a tile: the icon grid every surface uses, with its tooltip. */
function Tile({ name, quantity, className, hover, onClick }: {
    name: string; quantity: number; className?: string; hover: Record<string, unknown>; onClick?: () => void
}) {
    return (
        <div className={`inventory-slot occupied ${className ?? ''}`} {...hover} onClick={onClick}>
            <img
                src={getItemIcon(name)}
                alt={name}
                className="inventory-item-icon"
                onError={e => {
                    e.currentTarget.style.display = 'none'
                    e.currentTarget.nextElementSibling?.removeAttribute('style')
                }}
            />
            <span className="inventory-item-text" style={{ display: 'none' }}>{name}</span>
            {quantity > 1 && <span className="inventory-item-qty">{quantity}</span>}
        </div>
    )
}

/**
 * The fight, while it runs (docs/combat-spec.md §9, §10): food along the top,
 * a tap eats one; the face-off with both health bars; the last kill's pay; the
 * swings as they land; and the way out. Everything shown comes from the
 * server's pushes (GameView listens). It fills the scene and never scrolls:
 * the swing log takes whatever height is left.
 */
export default function FightView({ fight, hp, log, food, spoils, fleeLabel, busy, onEat, onFlee }: FightViewProps) {
    const { hoverProps, tooltipEl } = useItemTooltip()

    // The approach is the only thing that counts down on the client, toward a
    // moment the server set, on this browser's clock (localizeFight).
    const [now, setNow] = useState(() => Date.now())
    const engageAt = fight?.engageAtLocal ?? 0
    // A bot check freezes the fight between kills. The next creature's
    // approach is not running then (the server restarts it from the answer),
    // so nothing counts down and nothing new is shown until the check is
    // answered: one approach, after it, rather than one during and another after.
    const frozen = !!fight?.frozen
    const approaching = !!fight && !frozen && engageAt > now
    const fighting = !!fight
    useEffect(() => {
        if (!fighting) return
        const t = window.setInterval(() => setNow(Date.now()), 250)
        return () => clearInterval(t)
    }, [fighting])

    // The face-off: who was last hit, and whether a creature has just fallen.
    const lastHit = (kind: FightLogLine['kind']) => {
        for (let i = log.length - 1; i >= 0; i--) if (log[i].kind === kind && log[i].hit) return log[i].id
        return null
    }
    const lastKill = [...log].reverse().find(l => l.kind === 'kill')
    const fallen = lastKill?.creature && lastKill.at && now - lastKill.at < FALLEN_MS ? lastKill.creature : null
    // The next creature is not shown until it closes in: at a spot that sends
    // whatever comes, nobody knows what is coming, so it is a "?" with no
    // health; at a spot where the player chose, the picture shows faded and
    // the health bar waits.
    const unknown = (approaching || frozen) && !fallen && fight?.spot.kind !== 'chosen'
    const foeName = fallen ?? (unknown ? null : fight?.creature.name) ?? null

    // Least mending first, always, so a meal stays where you last saw it
    // (Nathan, 2026-10-13): top of the left edge down, then the right edge.
    const meals = [...food].sort((a, b) => a.heal - b.heal || a.name.localeCompare(b.name))
    // How many tiles fit down one edge, measured, so the left fills first.
    const leftRef = useRef<HTMLDivElement>(null)
    const [perSide, setPerSide] = useState(8)
    useEffect(() => {
        const el = leftRef.current
        if (!el) return
        const measure = () => {
            const style = getComputedStyle(el)
            const tile = parseFloat(style.getPropertyValue('--food-tile')) || 44
            const gap = parseFloat(style.rowGap) || 4
            const room = el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
            setPerSide(Math.max(1, Math.floor((room + gap) / (tile + gap))))
        }
        measure()
        const ro = new ResizeObserver(measure)
        ro.observe(el)
        return () => ro.disconnect()
    }, [])
    // Columns of perSide: the first down the left edge, the second down the
    // right, and any more step inward, left side first.
    const columns: FightFood[][] = []
    for (let i = 0; i < meals.length; i += perSide) columns.push(meals.slice(i, i + perSide))
    const leftColumns = columns.filter((_, i) => i % 2 === 0)
    const rightColumns = columns.filter((_, i) => i % 2 === 1)
    const mealTile = (f: FightFood) => (
        <Tile
            key={f.itemId}
            name={f.name}
            quantity={f.quantity}
            className={`fight-food-slot ${busy ? 'busy' : ''}`}
            hover={hoverProps({ name: f.name }, 'Click to eat one')}
            onClick={() => !busy && onEat(f.itemId)}
        />
    )

    const xp = (spoils?.xpAwards ?? []).filter(a => a.xp > 0)

    return (
        <div className="fight-view">
            {/* Food down the left edge, overflow down the right; the fight keeps the middle. */}
            <div className="fight-food-side">
                <div className="fight-food-col" ref={leftRef}>{(leftColumns[0] ?? []).map(mealTile)}</div>
                {leftColumns.slice(1).map((c, i) => <div key={i} className="fight-food-col">{c.map(mealTile)}</div>)}
            </div>
            <div className="fight-main">
                {meals.length === 0 && (
                    <span className="fight-food-empty muted-text">You carry nothing that mends.</span>
                )}

                <div className="fight-faceoff">
                    <div className="fight-side">
                        <Portrait
                            src={avatarSrc(fight?.you.avatarUrl)}
                            name={fight?.you.name ?? 'You'}
                            flashKey={lastHit('foe')}
                        />
                        <span className="fight-side-name">You</span>
                        {hp ? <Bar current={hp.current} max={hp.max} kind="you" /> : <div className="fight-bar" />}
                        {fight?.weapon && <span className="fight-side-note muted-text">{fight.weapon}</span>}
                    </div>

                    <div className="fight-middle">
                        {frozen ? (
                            <span className="fight-middle-label muted-text">resting</span>
                        ) : approaching ? (
                            <>
                                <span className="fight-countdown tabular-num">{Math.max(1, Math.ceil((engageAt - now) / 1000))}</span>
                                <span className="fight-middle-label muted-text">closing in</span>
                            </>
                        ) : (
                            <span className="fight-vs">vs</span>
                        )}
                    </div>

                    <div className="fight-side">
                        {foeName
                            ? <Portrait
                                src={getCreatureImage(foeName)}
                                name={foeName}
                                flashKey={fallen ? null : lastHit('you')}
                                state={fallen ? 'fallen' : approaching || frozen ? 'approaching' : undefined}
                            />
                            : <div className="fight-portrait approaching"><span className="fight-portrait-initial">?</span></div>}
                        <span className="fight-side-name">
                            {!fight ? '...' : unknown ? (frozen ? 'Nothing yet' : 'Something comes') : fight.creature.name}
                            {fight && !unknown && <span className="muted-text"> (level {fight.creature.level})</span>}
                        </span>
                        {fight && !approaching && !frozen
                            ? <Bar current={fight.enemyHp} max={fight.enemyMaxHp} kind="foe" />
                            : <div className="fight-bar" />}
                        {!unknown && fight?.stances && (fight.stances.weak.length > 0 || fight.stances.resists.length > 0) && (
                            <span className="fight-side-note">
                                {fight.stances.weak.length > 0 && <span className="fight-weak">Weak to {fight.stances.weak.join(', ')}</span>}
                                {fight.stances.weak.length > 0 && fight.stances.resists.length > 0 && ' · '}
                                {fight.stances.resists.length > 0 && <span className="muted-text">shrugs off {fight.stances.resists.join(', ')}</span>}
                            </span>
                        )}
                        {fight && !unknown && (
                            <span className="fight-side-note muted-text">
                                {fight.kills} {fight.kills === 1 ? 'kill' : 'kills'}, {(fight.totalKills ?? fight.kills).toLocaleString()} total ·{' '}
                                <button className="fight-bestiary-link" onClick={() => openBestiary(fight.creature.id)}>Bestiary</button>
                            </span>
                        )}
                    </div>
                </div>

                {fight?.frozen && (
                    <p className="fight-frozen gold-text">You catch your breath. Answer the question to carry on.</p>
                )}

                <div className="fight-spoils">
                    {spoils ? (
                        <>
                            <div className="fight-spoils-head">
                                <span className="fight-spoils-message">{spoils.message}</span>
                                <span className="fight-spoils-xp">
                                    {xp.map(a => (
                                        <span key={a.skill} className="fight-xp-chip tabular-num">+{a.xp} {a.skill}</span>
                                    ))}
                                    {spoils.eventXp ? <span className="fight-xp-chip event tabular-num">+{spoils.eventXp} event</span> : null}
                                </span>
                            </div>
                            {(spoils.drops?.length ?? 0) > 0 && (
                                <div className="fight-spoils-drops">
                                    {spoils.drops!.map((d, i) => (
                                        <Tile
                                            key={`${d.name}-${i}`}
                                            name={d.name}
                                            quantity={d.quantity}
                                            className={`fight-drop-slot ${d.notable ? 'notable' : ''}`}
                                            hover={hoverProps({ name: d.name }, d.notable ? 'A find worth keeping' : null)}
                                        />
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <span className="fight-spoils-empty muted-text">What your first kill earns shows here.</span>
                    )}
                </div>

                <div className="fight-log">
                    {log.length === 0
                        ? <p className="fight-log-line info muted-text">You wait for the first blow.</p>
                        : [...log].reverse().slice(0, 12).map(line => (
                            <p key={line.id} className={`fight-log-line ${line.kind}`}>{line.text}</p>
                        ))}
                </div>

                <button className="btn btn-red scene-cancel-btn fight-flee" disabled={busy} onClick={onFlee}>{fleeLabel}</button>
            </div>
            <div className="fight-food-side right">
                {rightColumns.map((c, i) => <div key={i} className="fight-food-col">{c.map(mealTile)}</div>).reverse()}
            </div>
            {tooltipEl}
        </div>
    )
}
