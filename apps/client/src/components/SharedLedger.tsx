import './GuildHallTab.css'
import { formatGameDateTime } from '../lib/time'

export interface LedgerLine { player: string; item: string; delta: number; at: string }

/**
 * What went into and out of a shared homestead store, and who moved it
 * (services/propertyPartners.ts), newest first. Both keyholders see the same.
 */
export default function SharedLedger({ lines }: { lines: LedgerLine[] }) {
    return (
        <div className="share-ledger">
            <p className="store-section">Who moved what</p>
            {lines.length === 0 ? (
                <p className="store-empty">Nothing has gone in or out since it was shared.</p>
            ) : (
                <div className="hall-ledger">
                    {lines.map((l, i) => (
                        <div key={i} className="hall-ledger-row">
                            <span className="muted-text">{formatGameDateTime(new Date(l.at))}</span>
                            <span>{l.player}</span>
                            <span className={l.delta > 0 ? 'hall-in' : 'hall-out'}>
                                {l.delta > 0 ? 'put in' : 'took'} {Math.abs(l.delta).toLocaleString()} {l.item}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
