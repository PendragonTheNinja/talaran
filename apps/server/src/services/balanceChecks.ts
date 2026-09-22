import { logger } from '../lib/logger';
import { unmappedItems, validateShelves, validateWalls } from './marketplace';
import { reconcileGold } from './gold';

/**
 * Every economy self-check, in one place, for anything that wants to run them.
 *
 * Four checks existed and NOTHING CALLED THEM. CLAUDE.md said they were wired
 * to the admin Balance tab; they were not, and a check nobody runs is not a
 * check. It cost two weeks of Cooking's ~40 food items selling at the
 * pawnbroker's 35% instead of the provisioner's 45%, which unmappedItems()
 * would have reported on day one.
 *
 * Two callers now: the Balance tab, and startup. Composed here rather than in
 * the route so both run exactly the same thing.
 */

export interface CheckResult {
    key: string
    /** Shown as the card's heading. */
    label: string
    /** What a clean result means, so an empty card is not ambiguous. */
    clean: string
    problems: string[]
    /**
     * True but not wrong: deliberate exceptions, shown under a clean card.
     *
     * Trophies and curios are permanently pawnbroker-only by design. Counting
     * them as problems would mean the badge never reads zero, and a number
     * that is always there is one nobody reads.
     */
    notes?: string[]
    /** Set when the check itself failed, as distinct from finding problems. */
    error?: string
}

export interface BalanceReport {
    checks: CheckResult[]
    /** Total problems across every check that ran. Drives the tab badge. */
    problemCount: number
    ranAt: string
    /** True when the ledger walk was included. */
    includedGold: boolean
}

/**
 * Runs a check without letting a thrown error take the others down with it: a
 * page showing three real answers and one honest failure beats a 500.
 */
async function run(
    key: string,
    label: string,
    clean: string,
    fn: () => Promise<{ problems: string[]; notes?: string[] } | string[]>,
): Promise<CheckResult> {
    try {
        const out = await fn();
        return Array.isArray(out)
            ? { key, label, clean, problems: out }
            : { key, label, clean, problems: out.problems, notes: out.notes };
    } catch (err) {
        logger.error(`[balance] ${key} failed: ${err}`);
        return { key, label, clean, problems: [], error: String(err) };
    }
}

/**
 * `includeGold` is off by default because reconcileGold() walks the whole
 * ledger, and the other three are cheap enough to run on a tab opening.
 */
export async function runBalanceChecks(includeGold = false): Promise<BalanceReport> {
    const checks: CheckResult[] = [];

    checks.push(await run(
        'unmapped',
        'Unmapped items',
        'Every priced item has an active themed merchant.',
        async () => {
            const rows = await unmappedItems();
            const describe = (r: typeof rows[number]) => {
                const what = `${r.name} (${r.type}${r.subtype ? `/${r.subtype}` : ''})`;
                return r.reason === 'merchant inactive'
                    ? `${what} is claimed by ${r.domain}, who is INACTIVE, so it falls to the pawnbroker's rate.`
                    : `${what} has no themed merchant; it sells to the pawnbroker only.`;
            };
            const intended = rows.filter(r => r.intentional);
            return {
                problems: rows.filter(r => !r.intentional).map(describe),
                notes: intended.length
                    ? [`${intended.length} item(s) are pawnbroker-only by design: `
                       + intended.slice(0, 8).map(r => r.name).join(', ')
                       + (intended.length > 8 ? `, and ${intended.length - 8} more.` : '.')]
                    : undefined,
            };
        },
    ));

    checks.push(await run(
        'shelves',
        'Merchant shelves',
        'Every merchant buys back everything it sells.',
        validateShelves,
    ));

    checks.push(await run(
        'walls',
        'Price walls',
        'No item can be bought and sold back at a profit.',
        validateWalls,
    ));

    if (includeGold) {
        checks.push(await run(
            'gold',
            'Gold reconciliation',
            'Every ledger delta sums to the balance it belongs to.',
            async () => {
                // Drift rows only; reconcileGold filters the reconciled ones out.
                const drift = await reconcileGold();
                return drift.map(d =>
                    `${d.username} (#${d.playerId}) holds ${d.balance.toLocaleString()}g `
                    + `but the ledger sums to ${d.ledgerSum.toLocaleString()}g `
                    + `(${d.drift > 0 ? '+' : ''}${d.drift.toLocaleString()}g out).`);
            },
        ));
    }

    return {
        checks,
        problemCount: checks.reduce((n, c) => n + c.problems.length, 0),
        ranAt: new Date().toISOString(),
        includedGold: includeGold,
    };
}

/**
 * Run at boot and say so in the log.
 *
 * The tab is only as good as somebody remembering to open it. This way a
 * deploy that leaves items unmapped or a shelf mis-stocked says so in the pm2
 * log without anyone opening a browser. Never throws: a failed self-check must
 * not stop the game from starting.
 */
export async function logBalanceChecksAtStartup(): Promise<void> {
    try {
        const report = await runBalanceChecks(false);
        if (report.problemCount === 0) {
            logger.info('[balance] startup checks clean');
            return;
        }
        logger.warn(`[balance] startup checks found ${report.problemCount} problem(s)`);
        for (const check of report.checks) {
            for (const problem of check.problems) {
                logger.warn(`[balance] ${check.label}: ${problem}`);
            }
        }
    } catch (err) {
        logger.error(`[balance] startup checks could not run: ${err}`);
    }
}
