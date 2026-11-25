import { useCallback, useEffect, useState } from 'react'
import { avatarSrc } from '../lib/avatar'
import { apiFetch } from '../lib/api'
import { onSocket } from '../lib/socket'
import { coalesce } from '../lib/coalesce'
import { itemDetail, loadItemDetails, onItemDetailsLoaded } from '../lib/itemDetails'
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

/** How long a fallen creature stays on screen, greyed, before the "?" (Nathan, 2026-10-16). */
const FALLEN_MS = 3000

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
    /** Worn gear changed from the fight's own weapon column: the equipment panel reloads. */
    onEquipped?: () => void
}

interface PackRow { item_id: number; name: string; quantity: number; slot?: string | null; synthetic?: boolean }
interface WornRow { name: string; weapon_form?: string | null }

/**
 * The weapons in the pack, and the shields when one hand is free, down the
 * right edge of the fight as the food runs down the left (forum, 2026-11-22:
 * creatures are weak to different blows, and finding the right weapon in the
 * pack mid-fight, on a phone, was the hard part). A tap wears it, through the
 * equip button's own route, which plays the fight up to now with the old gear
 * first (settleBeforeGearChange), so a swap never takes a swing back.
 */
function useFightGear(onEquipped?: () => void) {
    const [pack, setPack] = useState<PackRow[]>([])
    const [main, setMain] = useState<WornRow | null>(null)
    const [, setDetailsGen] = useState(0)
    const [swapping, setSwapping] = useState(false)
    const [error, setError] = useState('')

    const load = useCallback(() => {
        Promise.all([
            apiFetch<{ inventory: PackRow[] }>('/api/inventory'),
            apiFetch<{ equipment: Record<string, WornRow | null> }>('/api/equipment'),
        ]).then(([inv, eq]) => {
            setPack((inv.inventory ?? []).filter(r => !r.synthetic))
            setMain(eq.equipment?.mainhand ?? null)
        }).catch(() => { })
    }, [])

    useEffect(() => { load() }, [load])
    useEffect(() => onSocket('inventory_changed', coalesce(() => load())), [load])
    useEffect(() => onSocket('equipment_changed', () => load()), [load])
    useEffect(() => {
        void loadItemDetails()
        return onItemDetailsLoaded(() => setDetailsGen(g => g + 1))
    }, [])

    const wear = async (itemId: number) => {
        if (swapping) return
        setSwapping(true); setError('')
        try {
            await apiFetch('/api/equipment/equip', { method: 'POST', body: JSON.stringify({ itemId }) })
            load()
            onEquipped?.()
        } catch (e) {
            setError((e as { message?: string }).message || 'That would not go on.')
        } finally {
            setSwapping(false)
        }
    }

    const weapons = pack.filter(r => !!itemDetail(r.name)?.weapon_form)
        .sort((a, b) => (itemDetail(b.name)?.tier ?? 0) - (itemDetail(a.name)?.tier ?? 0) || a.name.localeCompare(b.name))
    // A shield goes beside one hand's weapon, or bare hands; never beside a pair or a two-hander.
    const oneHandFree = !main || main.weapon_form === 'onehand' || !main.weapon_form
    const shields = oneHandFree
        ? pack.filter(r => r.slot === 'offhand' && Number(itemDetail(r.name)?.armour) > 0)
            .sort((a, b) => (itemDetail(b.name)?.armour ?? 0) - (itemDetail(a.name)?.armour ?? 0))
        : []
    return { weapons, shields, wear, swapping, error }
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
export default function FightView({ fight, hp, log, food, spoils, fleeLabel, busy, onEat, onFlee, onEquipped }: FightViewProps) {
    const { hoverProps, tooltipEl } = useItemTooltip()
    const gear = useFightGear(onEquipped)

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
    //
    // While one has fallen, everything on that side is the fallen one's: the
    // name, level, weaknesses and Bestiary line used to switch to the next
    // creature the moment the last died, under the greyed portrait (forum,
    // 2026-10). The server sends no creature at all while an unknown one
    // approaches, so there is nothing to show early either way.
    const unknown = !fight?.creature || ((approaching || frozen) && fight.spot.kind !== 'chosen')
    const foe = unknown || fallen ? null : fight?.creature ?? null
    const foeName = fallen ?? foe?.name ?? null

    // One column down the left edge, most mending first, scrolling when it
    // runs past the scene (Nathan, 2026-10-17). It used to fill the left edge
    // least-first, then the right, then step inward, and a pack with many
    // foods crowded the fight.
    const meals = [...food].sort((a, b) => b.heal - a.heal || a.name.localeCompare(b.name))
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
            {/* Food down the left edge, scrolling; the fight keeps the middle. */}
            <div className="fight-food-side">
                <div className="fight-food-col">{meals.map(mealTile)}</div>
            </div>
            <div className="fight-main">
                {meals.length === 0 && (
                    <span className="fight-food-empty muted-text">You carry nothing that mends.</span>
                )}
                {gear.error && <span className="fight-food-empty fight-gear-error">{gear.error}</span>}

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
                            {!fight ? '...' : fallen ?? (foe ? foe.name : frozen ? 'Nothing yet' : 'Something comes')}
                            {foe && <span className="muted-text"> (level {foe.level})</span>}
                        </span>
                        {fight && !approaching && !frozen
                            ? <Bar current={fight.enemyHp} max={fight.enemyMaxHp} kind="foe" />
                            : <div className="fight-bar" />}
                        {foe && fight?.stances && (fight.stances.weak.length > 0 || fight.stances.resists.length > 0) && (
                            <span className="fight-side-note">
                                {fight.stances.weak.length > 0 && <span className="fight-weak">Weak to {fight.stances.weak.join(', ')}</span>}
                                {fight.stances.weak.length > 0 && fight.stances.resists.length > 0 && ' · '}
                                {fight.stances.resists.length > 0 && <span className="muted-text">shrugs off {fight.stances.resists.join(', ')}</span>}
                            </span>
                        )}
                        {fight && foe && (
                            <span className="fight-side-note muted-text">
                                {fight.kills} {fight.kills === 1 ? 'kill' : 'kills'}, {(fight.totalKills ?? fight.kills).toLocaleString()} total ·{' '}
                                <button className="fight-bestiary-link" onClick={() => openBestiary(foe.id)}>Bestiary</button>
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
            {/* Weapons down the right edge, as wide as the food column, so the
                face-off stays centred; shields under them while a hand is free. */}
            <div className="fight-food-side fight-gear-side">
                <div className={`fight-gear-col ${gear.shields.length ? 'with-shields' : ''}`}>
                    {gear.weapons.map(w => (
                        <Tile
                            key={w.item_id}
                            name={w.name}
                            quantity={w.quantity}
                            className={`fight-food-slot ${gear.swapping ? 'busy' : ''}`}
                            hover={hoverProps({ name: w.name }, 'Click to fight with this')}
                            onClick={() => gear.wear(w.item_id)}
                        />
                    ))}
                </div>
                {gear.shields.length > 0 && (
                    <div className="fight-shield-col" title="Shields">
                        {gear.shields.map(sh => (
                            <Tile
                                key={sh.item_id}
                                name={sh.name}
                                quantity={sh.quantity}
                                className={`fight-food-slot ${gear.swapping ? 'busy' : ''}`}
                                hover={hoverProps({ name: sh.name }, 'Click to take up this shield')}
                                onClick={() => gear.wear(sh.item_id)}
                            />
                        ))}
                    </div>
                )}
            </div>
            {tooltipEl}
        </div>
    )
}
