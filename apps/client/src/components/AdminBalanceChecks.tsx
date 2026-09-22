import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import './AdminBalanceChecks.css'

/**
 * The economy self-checks, on screen.
 *
 * All four functions behind this existed for weeks with no caller. That is how
 * Cooking shipped ~40 items to an inactive merchant and sold them at the
 * pawnbroker's rate for two weeks while the check that would have caught it sat
 * in the codebase, correct and unread.
 *
 * Clean is the expected result, so a clean card says what it proved rather than
 * going blank. A blank card is indistinguishable from a broken one.
 */

interface CheckResult {
    key: string
    label: string
    clean: string
    problems: string[]
    /** Deliberate exceptions: true, but not wrong. */
    notes?: string[]
    error?: string
}

interface BalanceReport {
    checks: CheckResult[]
    problemCount: number
    ranAt: string
    includedGold: boolean
}

export default function AdminBalanceChecks() {
    const [report, setReport] = useState<BalanceReport | null>(null)
    const [loading, setLoading] = useState(true)
    const [goldLoading, setGoldLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    /**
     * Collapsed by default.
     *
     * The cards grow with every problem found, and on a database with real
     * drift that is a long list — long enough to push the XP band calculator
     * off the bottom of the tab and squash what was left. The summary line is
     * what you need at a glance; the detail is one click away, and scrolls in
     * its own box rather than shoving the rest of the tab around.
     */
    const [expanded, setExpanded] = useState(false)

    const load = useCallback(async (includeGold: boolean) => {
        if (includeGold) setGoldLoading(true); else setLoading(true)
        setError(null)
        try {
            const data = await apiFetch<BalanceReport>(
                `/api/admin/balance/checks${includeGold ? '?gold=1' : ''}`)
            setReport(data)
        } catch {
            setError('Could not run the checks.')
        } finally {
            setLoading(false)
            setGoldLoading(false)
        }
    }, [])

    // The three cheap checks on open; the ledger walk waits to be asked for.
    useEffect(() => { load(false) }, [load])

    if (loading) return <p className="balance-checks-note">Running checks…</p>

    return (
        <div className="balance-checks">
            <div className="balance-checks-head">
                <span className={report?.problemCount ? 'balance-checks-bad' : 'balance-checks-good'}>
                    {report?.problemCount
                        ? `${report.problemCount} problem${report.problemCount === 1 ? '' : 's'}`
                        : 'All clear'}
                </span>
                <div className="balance-checks-actions">
                    <button className="btn" onClick={() => setExpanded(e => !e)}>
                        {expanded ? 'Hide detail' : 'Show detail'}
                    </button>
                    <button className="btn btn-gold" onClick={() => load(report?.includedGold ?? false)}>
                        Re-run
                    </button>
                    {!report?.includedGold && (
                        <button className="btn" onClick={() => load(true)} disabled={goldLoading}>
                            {goldLoading ? 'Walking the ledger…' : 'Include gold reconciliation'}
                        </button>
                    )}
                </div>
            </div>

            {error && <p className="guild-error">{error}</p>}

            {/* Collapsed: one line per check, no detail. Enough to see WHICH
                check is unhappy without surrendering the tab to it. */}
            {!expanded && report && (
                <div className="balance-checks-summary">
                    {report.checks.map(check => (
                        <span
                            key={check.key}
                            className={check.error
                                ? 'balance-chip errored'
                                : check.problems.length ? 'balance-chip bad' : 'balance-chip'}
                        >
                            {check.label}
                            <span className="tabular-num">
                                {check.error ? ' —' : check.problems.length ? ` ${check.problems.length}` : ' ✓'}
                            </span>
                        </span>
                    ))}
                </div>
            )}

            {expanded && <div className="balance-checks-body">

            {report?.checks.map(check => (
                <div
                    key={check.key}
                    className={`balance-check-card ${check.error
                        ? 'errored'
                        : check.problems.length ? 'has-problems' : 'clean'}`}
                >
                    <div className="balance-check-title">
                        <span>{check.label}</span>
                        <span className="balance-check-count tabular-num">
                            {check.error
                                ? 'could not run'
                                : check.problems.length === 0
                                    ? 'clean'
                                    : `${check.problems.length}`}
                        </span>
                    </div>

                    {check.error ? (
                        <p className="balance-check-error">{check.error}</p>
                    ) : (
                        <>
                            {check.problems.length === 0
                                ? <p className="balance-check-clean">{check.clean}</p>
                                : (
                                    <ul className="balance-check-list">
                                        {check.problems.map((problem, i) => (
                                            <li key={i}>{problem}</li>
                                        ))}
                                    </ul>
                                )}
                            {/* Deliberate exceptions, under the result rather than
                                in it: they are not problems and must not make the
                                count nonzero forever. */}
                            {check.notes?.map((note, i) => (
                                <p key={i} className="balance-check-note">{note}</p>
                            ))}
                        </>
                    )}
                </div>
            ))}

            </div>}

            {report && (
                <p className="balance-checks-note">
                    Ran {new Date(report.ranAt).toLocaleTimeString()}
                    {report.includedGold ? ', gold included' : ', gold not included'}.
                    These also run at server startup and log to pm2.
                </p>
            )}
        </div>
    )
}
