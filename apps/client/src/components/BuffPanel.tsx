import { useEffect, useState, useCallback, useRef } from 'react'
import { apiFetch } from '../lib/api'
import { getSocket } from '../lib/socket'
import { getItemIcon } from '../lib/items'
import ConfirmModal from './ConfirmModal'
import './BuffPanel.css'

interface ActiveBuff {
    sourceItem: string
    effectType: string
    skill: string | null
    magnitude: number
    secondsLeft: number
}

interface Provision {
    itemName: string
    quantity: number
    effect: string
    skill: string | null
    magnitude: number
    seconds: number
}

/**
 * Turn a buff into the sentence a player actually wants.
 *
 * The stored magnitude means something different per effect: seconds for a
 * timer, a percent increase for a rare roll, a percent chance for a double, a
 * percent cut for travel. Showing a bare number would be meaningless.
 */
function describe(effect: string, skill: string | null, magnitude: number): string {
    const where = skill ? skill : 'every skill'
    switch (effect) {
        case 'timer': return `${magnitude}% faster at ${where}`
        case 'rare': return `${magnitude}% better rare finds at ${where}`
        case 'double': return `${magnitude}% chance of double yield at ${where}`
        case 'travel': return `${magnitude}% faster travel`
        default: return where
    }
}

function fmtLeft(seconds: number): string {
    if (seconds <= 0) return 'gone'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h > 0) return `${h}h ${m}m left`
    if (m > 0) return `${m}m left`
    return `${seconds}s left`
}

interface BuffPanelProps {
    onInventoryUpdate: () => void
}

export default function BuffPanel({ onInventoryUpdate }: BuffPanelProps) {
    const [buff, setBuff] = useState<ActiveBuff | null>(null)
    const [provisions, setProvisions] = useState<Provision[]>([])
    const [open, setOpen] = useState(false)
    const [busy, setBusy] = useState(false)
    // Warn before replacing, including when it is the same dish: a second one
    // restarts the clock rather than extending it.
    const [confirmEat, setConfirmEat] = useState<string | null>(null)

    const load = useCallback(async () => {
        try {
            const [b, p] = await Promise.all([
                apiFetch<{ buff: ActiveBuff | null }>('/api/buffs'),
                apiFetch<{ provisions: Provision[] }>('/api/buffs/provisions'),
            ])
            setBuff(b.buff)
            setProvisions(p.provisions)
        } catch {
            // A missing buff is a normal state, so a failure here is not worth
            // shouting about. The strip simply shows nothing.
        }
    }, [])

    useEffect(() => { load() }, [load])

    // Cooking a provision changes what is in the pack, and this panel lists it.
    // Without this the new dish would not appear until something else remounted
    // the panel, which in practice meant a page refresh.
    useEffect(() => {
        const socket = getSocket()
        if (!socket) return
        socket.on('inventory_changed', load)
        return () => { socket.off('inventory_changed', load) }
    }, [load])

    /**
     * Count down against a DEADLINE, not by subtracting a second per tick.
     *
     * Subtracting assumed the interval fires once a second, and a background
     * tab does not: browsers throttle a hidden tab's timers to roughly once a
     * minute. Fifteen minutes away meant about fifteen decrements instead of
     * nine hundred, so a 29m buff still read 29m on return and a buff that had
     * long since expired sat there until a refresh emptied the slot.
     *
     * The deadline is fixed when the server's number arrives, and every tick
     * just reads the clock, so a throttled tab catches up in one frame.
     */
    const expiresAtRef = useRef<number | null>(null)
    useEffect(() => {
        expiresAtRef.current = buff ? Date.now() + buff.secondsLeft * 1000 : null
        // Keyed on the source item, so re-reading the same buff does not
        // restart the clock and eating a new dish does.
    }, [buff?.sourceItem])

    useEffect(() => {
        if (!buff) return
        const t = setInterval(() => {
            const deadline = expiresAtRef.current
            if (!deadline) return
            const left = Math.ceil((deadline - Date.now()) / 1000)
            setBuff(b => (b && left > 0 ? { ...b, secondsLeft: left } : null))
        }, 1000)
        return () => clearInterval(t)
    }, [buff?.sourceItem])

    /**
     * Re-read on return to the tab.
     *
     * The deadline maths above keeps the number honest, but the server is the
     * authority on whether the buff still exists at all, and the provision
     * list may have changed while the tab was hidden. GameView resyncs its
     * action timer the same way.
     */
    useEffect(() => {
        const onVisible = () => { if (document.visibilityState === 'visible') load() }
        document.addEventListener('visibilitychange', onVisible)
        return () => document.removeEventListener('visibilitychange', onVisible)
    }, [load])

    const askEat = (itemName: string) => {
        if (buff) { setConfirmEat(itemName); return }
        eat(itemName)
    }

    const eat = async (itemName: string) => {
        if (busy) return
        setBusy(true)
        try {
            const res = await apiFetch<{ message: string; buff: ActiveBuff | null }>('/api/buffs/eat', {
                method: 'POST',
                body: JSON.stringify({ itemName }),
            })
            setBuff(res.buff)
            setOpen(false)
            window.dispatchEvent(new CustomEvent('talaran:notice', { detail: { message: res.message } }))
            await onInventoryUpdate()
            await load()
        } catch (err: any) {
            window.dispatchEvent(new CustomEvent('talaran:notice', {
                detail: { message: err.message || 'You cannot eat that.', type: 'error' },
            }))
        } finally {
            setBusy(false)
        }
    }

    // Nothing running and nothing to eat: stay out of the way entirely.
    if (!buff && provisions.length === 0) return null

    return (
        <div className="buff-panel panel-inset">
            {confirmEat && buff && (
                <ConfirmModal
                    message={confirmEat === buff.sourceItem
                        ? `You already have a ${buff.sourceItem.toLowerCase()} working. Eating another restarts it rather than adding to the time. Go ahead?`
                        : `You already have a ${buff.sourceItem.toLowerCase()} working. Eating a ${confirmEat.toLowerCase()} will replace it, and the old one is lost. Go ahead?`}
                    confirmLabel="Eat It"
                    onConfirm={() => { const it = confirmEat; setConfirmEat(null); eat(it) }}
                    onCancel={() => setConfirmEat(null)}
                />
            )}
            <div className="panel-title">Provisions</div>

            {buff ? (
                <button className="buff-active" onClick={() => setOpen(o => !o)} title="Change provision">
                    <img src={getItemIcon(buff.sourceItem)} alt=""
                        onError={e => { e.currentTarget.style.display = 'none' }} />
                    <span className="buff-lines">
                        <span className="buff-name">{buff.sourceItem}</span>
                        <span className="buff-effect">{describe(buff.effectType, buff.skill, buff.magnitude)}</span>
                        <span className="buff-left">{fmtLeft(buff.secondsLeft)}</span>
                    </span>
                </button>
            ) : (
                <button className="buff-empty" onClick={() => setOpen(o => !o)}>
                    Nothing in hand
                </button>
            )}

            {open && (
                <div className="buff-picker">
                    {provisions.length === 0 ? (
                        <p className="buff-none">Nothing to eat. Cook something at a hearth.</p>
                    ) : (
                        provisions.map(p => (
                            <button key={p.itemName} className="buff-pick"
                                disabled={busy}
                                onClick={() => askEat(p.itemName)}
                                title={describe(p.effect, p.skill, p.magnitude)}>
                                <img src={getItemIcon(p.itemName)} alt=""
                                    onError={e => { e.currentTarget.style.display = 'none' }} />
                                <span className="buff-pick-lines">
                                    <span className="buff-name">{p.itemName} {p.quantity > 1 && `x${p.quantity}`}</span>
                                    <span className="buff-effect">{describe(p.effect, p.skill, p.magnitude)}</span>
                                </span>
                            </button>
                        ))
                    )}
                    {buff && (
                        <p className="buff-none">
                            Eating another replaces what you have. Only one keeps.
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}
