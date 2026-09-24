/**
 * Run something once the work that caused it has COMMITTED.
 *
 * `x` is whatever executor the caller wrote with. Given the plain connection,
 * the write is already durable, so `fn` runs now. Given a transaction, `fn`
 * waits on the transaction's completion promise, which resolves on commit and
 * rejects on rollback, so side effects of a rolled-back action never happen.
 *
 * For anything that must not run inside a transaction: socket pushes (a
 * rollback would un-happen what was announced), and bookkeeping written through
 * the global connection (which would borrow a second pool connection while the
 * caller holds the first). Audit N-1 is the case that made this necessary.
 *
 * Errors from `fn` are logged, never thrown: by the time it runs, the caller has
 * already returned.
 */
import { logger } from './logger';

export function afterCommit(x: unknown, fn: () => unknown): void {
    const run = () => {
        try {
            const out = fn();
            if (out && typeof (out as Promise<unknown>).catch === 'function') {
                (out as Promise<unknown>).catch((err) => logger.warn(`afterCommit task failed: ${err}`));
            }
        } catch (err) {
            logger.warn(`afterCommit task failed: ${err}`);
        }
    };

    const trx = x as { isTransaction?: boolean; executionPromise?: Promise<unknown> } | null;
    if (trx?.isTransaction && trx.executionPromise) {
        trx.executionPromise
            .then(run)
            .catch(() => { /* rolled back: nothing happened, so nothing to do */ });
        return;
    }
    run();
}
