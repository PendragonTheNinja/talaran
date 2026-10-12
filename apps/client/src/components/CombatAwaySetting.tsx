import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import ConfirmModal from './ConfirmModal'
// The toggle row is Settings' own; the fight menu can open before Settings ever has.
import './SettingsPanel.css'
import './CombatAwaySetting.css'

/**
 * "Keep fighting while away" (player_settings.combat_continue_offline,
 * docs/combat-spec.md §9). Shown in the fight menu and in Settings > Combat.
 *
 * Off by default, and off is safe: leaving the game ends a fight at once.
 * On, a fight carries on after the player leaves, with nobody to eat, until
 * the absence rule ends it, so it can end in a death and a pile of gear on the
 * ground. Turning it on therefore goes through a warning that states every
 * consequence and a box the player must tick. Turning it off needs nothing.
 *
 * The minutes come from the server (combatAwayRules on /api/settings) so the
 * warning always states the rules the server actually runs.
 */

interface AwayRules {
    offlineGraceMinutes: number
    deathPilePrivateMinutes: number
}

const CHANGED = 'talaran:combat-away-changed'

export default function CombatAwaySetting() {
    const [on, setOn] = useState<boolean | null>(null)
    const [rules, setRules] = useState<AwayRules | null>(null)
    const [asking, setAsking] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        apiFetch<{ combatContinueOffline?: boolean; combatAwayRules?: AwayRules }>('/api/settings')
            .then(d => {
                setOn(!!d.combatContinueOffline)
                setRules(d.combatAwayRules ?? null)
            })
            .catch(() => setOn(false))
        // The menu and Settings can both be open; keep them agreeing.
        const onChanged = (e: Event) => setOn((e as CustomEvent<boolean>).detail)
        window.addEventListener(CHANGED, onChanged)
        return () => window.removeEventListener(CHANGED, onChanged)
    }, [])

    const save = async (value: boolean) => {
        setBusy(true)
        setError('')
        try {
            await apiFetch('/api/settings/combat-offline', {
                method: 'POST',
                body: JSON.stringify({ combatContinueOffline: value }),
            })
            setOn(value)
            window.dispatchEvent(new CustomEvent<boolean>(CHANGED, { detail: value }))
        } catch {
            setError('That did not save. Try again.')
        } finally {
            setBusy(false)
        }
    }

    const minutes = rules?.offlineGraceMinutes
    const pileMinutes = rules?.deathPilePrivateMinutes

    return (
        <>
            <div className="settings-toggle-row combat-away">
                <div className="settings-toggle-info">
                    <span className="settings-toggle-label">Keep Fighting While Away</span>
                    <span className="muted-text" style={{ fontSize: '13px' }}>
                        {on
                            ? `ON: if you close the game or lose your connection, your fight keeps going${minutes ? ` for up to ${minutes} minutes` : ''}, and you can die while you are gone.`
                            : 'OFF: if you close the game or lose your connection, your fight ends straight away and you lose nothing.'}
                    </span>
                    {error && <span className="combat-away-error">{error}</span>}
                </div>
                <button
                    className={`settings-toggle-btn ${on ? 'active' : 'muted'}`}
                    disabled={on === null || busy}
                    onClick={() => (on ? save(false) : setAsking(true))}
                >
                    {on ? 'On' : 'Off'}
                </button>
            </div>

            {asking && (
                <ConfirmModal
                    title="Keep fighting while you are away?"
                    message="With this on, closing the game or losing your connection will NOT stop your fight."
                    acknowledge="I understand that I can die while I am away, and that everything I carry and wear will be left on the ground where anyone can take it."
                    confirmLabel="Turn it on"
                    cancelLabel="Keep it off"
                    onConfirm={() => { setAsking(false); save(true) }}
                    onCancel={() => setAsking(false)}
                >
                    <ul>
                        <li>
                            Your fight keeps going after you leave
                            {minutes ? <>, for up to <strong>{minutes} minutes</strong></> : ''}. Creatures keep coming, one after another.
                        </li>
                        <li><strong>Nobody eats for you.</strong> Your health only goes down while you are gone.</li>
                        <li>
                            <strong>If your health runs out, you die.</strong> Everything you carry and everything you wear
                            is dropped where you fell. You keep only your gold and your trophy.
                        </li>
                        <li>
                            Only you can see that pile for {pileMinutes ? <strong>{pileMinutes} minutes</strong> : 'a short while'}.
                            After that, <strong>anyone can pick it up</strong>.
                        </li>
                        <li>If a weapon or piece of armour breaks, the fight stops there.</li>
                        <li>With this off, leaving ends your fight at once and you lose nothing. You can turn it off again at any time.</li>
                    </ul>
                </ConfirmModal>
            )}
        </>
    )
}
