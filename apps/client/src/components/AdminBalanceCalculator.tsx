import { useState } from 'react'

// Constants from docs/xp-rebalance.md — the single source of truth for these
// numbers. If the doc's knobs change (§9), change them here too.
const R1 = 2000                               // level-1 optimal earn rate (xp/hr)
const RATE_GROWTH = Math.pow(1.33, 1 / 12)    // ladder growth per level
const UNLOCK_DIP = 1.10                       // new content lands ~10% hot

const POLICIES: { key: string; label: string; mult: number; note?: string }[] = [
    { key: 'gathering', label: 'Gathering (default)', mult: 1.0 },
    { key: 'rocks', label: 'Mining — rocks', mult: 0.5, note: 'Deliberately slow filler; always available.' },
    { key: 'ores', label: 'Mining — ores', mult: 1.3, note: 'Not 100% uptime; blended mining ≈ band.' },
    { key: 'crafting', label: 'Crafting — finished goods', mult: 1.8 },
    { key: 'intermediate', label: 'Crafting — intermediates (saw, smelt, tan)', mult: 1.08, note: '0.6 × the crafting band. Bulk steps shouldn\'t out-earn finished goods.' },
    { key: 'hunting', label: 'Hunting (nominal)', mult: 1.0, note: 'Effective rate = xp_success × catch% + xp_fail × miss%, arrows priced in. Tune to band at unlock.' },
    { key: 'passive', label: 'Passive (trapping)', mult: 0.30, note: 'A fully tended line earns ~30% of the active band. Side income, not the main road.' },
    { key: 'kiln', label: 'Kiln-tier passive (tanning vats)', mult: 0.02, note: 'Set-and-forget batches. XP is a token, not a ladder rung.' },
]

// R̂(u): the smooth reference earn-rate curve
function refRate(level: number): number {
    return R1 * Math.pow(RATE_GROWTH, level - 1)
}

const TIER_GRID = [1, 13, 25, 37, 50, 62, 75, 87, 100]

export default function AdminBalanceCalculator() {
    const [level, setLevel] = useState('1')
    const [policyKey, setPolicyKey] = useState('gathering')
    const [timer, setTimer] = useState('30')

    const policy = POLICIES.find(p => p.key === policyKey)!
    const lvl = Math.min(100, Math.max(1, parseInt(level) || 1))
    const timerS = Math.max(1, parseInt(timer) || 1)

    const target = policy.mult * UNLOCK_DIP * refRate(lvl)
    const xp = Math.round(target * timerS / 3600)
    const effectiveRate = xp * 3600 / timerS
    const minTimerLow = Math.round(timerS * 0.53)
    const minTimerHigh = Math.round(timerS * 0.56)

    return (
        <div className="admin-main" style={{ maxWidth: '860px' }}>
            <p className="admin-section-title">Place Content — the 4-step recipe (xp-rebalance §8)</p>
            <p className="muted-text" style={{ fontSize: '14px', marginBottom: '14px' }}>
                Pick the unlock level and policy, choose a timer that feels right, and this hands you the XP value.
                Sim-validate anything novel before it ships.
            </p>

            <div className="admin-balance-form">
                <label className="admin-balance-field">
                    <span>Unlock level</span>
                    <input
                        className="chat-input"
                        type="number"
                        min={1}
                        max={100}
                        value={level}
                        onChange={e => setLevel(e.target.value)}
                    />
                </label>
                <label className="admin-balance-field">
                    <span>Content class (policy)</span>
                    <select className="chat-input" value={policyKey} onChange={e => setPolicyKey(e.target.value)}>
                        {POLICIES.map(p => (
                            <option key={p.key} value={p.key}>{p.label} — ×{p.mult}</option>
                        ))}
                    </select>
                </label>
                <label className="admin-balance-field">
                    <span>Base timer (seconds)</span>
                    <input
                        className="chat-input"
                        type="number"
                        min={1}
                        value={timer}
                        onChange={e => setTimer(e.target.value)}
                    />
                </label>
            </div>

            {policy.note && (
                <p className="muted-text" style={{ fontSize: '13px', fontStyle: 'italic', marginTop: '6px' }}>{policy.note}</p>
            )}

            <div className="admin-info-grid" style={{ marginTop: '16px' }}>
                <div className="admin-info-item">
                    <span className="muted-text">Target rate at L{lvl}</span>
                    <span style={{ fontSize: '16px' }}>{Math.round(target).toLocaleString()} xp/hr</span>
                </div>
                <div className="admin-info-item" style={{ borderColor: 'var(--color-border-gold)' }}>
                    <span className="muted-text">XP per action</span>
                    <span className="gold-text" style={{ fontSize: '20px' }}>{xp.toLocaleString()}</span>
                </div>
                <div className="admin-info-item">
                    <span className="muted-text">Effective rate (rounded XP)</span>
                    <span style={{ fontSize: '16px' }}>{Math.round(effectiveRate).toLocaleString()} xp/hr</span>
                </div>
                <div className="admin-info-item">
                    <span className="muted-text">Suggested min_timer</span>
                    <span style={{ fontSize: '16px' }}>{minTimerLow}–{minTimerHigh}s</span>
                </div>
                <div className="admin-info-item">
                    <span className="muted-text">Reference R̂({lvl})</span>
                    <span style={{ fontSize: '16px' }}>{Math.round(refRate(lvl)).toLocaleString()} xp/hr</span>
                </div>
                <div className="admin-info-item">
                    <span className="muted-text">Formula</span>
                    <span style={{ fontSize: '13px' }}>×{policy.mult} policy · ×{UNLOCK_DIP} dip</span>
                </div>
            </div>

            <p className="admin-section-title" style={{ marginTop: '20px' }}>Tier grid — targets for this policy</p>
            <div className="admin-content-scroll" style={{ flex: 'none' }}>
                <table className="admin-content-table" style={{ width: '100%' }}>
                    <thead>
                        <tr>
                            <th>Unlock</th>
                            {TIER_GRID.map(u => <th key={u}>{u}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="muted-text">xp/hr</td>
                            {TIER_GRID.map(u => (
                                <td key={u} className={u === lvl ? 'gold-text' : undefined}>
                                    {Math.round(policy.mult * UNLOCK_DIP * refRate(u)).toLocaleString()}
                                </td>
                            ))}
                        </tr>
                    </tbody>
                </table>
            </div>

            <p className="muted-text" style={{ fontSize: '13px', marginTop: '14px' }}>
                xp = round(target × timer / 3600) · R̂(u) = {R1.toLocaleString()} × (1.33^(1/12))^(u−1) · min_timer ≈ 0.53–0.56 × base.
                Docs are law: if a knob in xp-rebalance §9 changes, update the constants at the top of this file.
            </p>
        </div>
    )
}
