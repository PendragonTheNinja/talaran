import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import { onSocket } from '../lib/socket'
import ErrorLine from './ErrorLine'
import ConfirmModal from './ConfirmModal'
import SharedLedger, { type LedgerLine } from './SharedLedger'

interface ShareState {
    ownHere: { propertyId: number; partner: string | null; ledger: LedgerLine[] } | null
}

/**
 * Sharing this homestead's store with one other player (forum "Sharing
 * Houses"; server services/propertyPartners.ts). The owner names them here,
 * standing at the homestead, and may take the name off again. The partner gets
 * the store and nothing else: fields, pens, and building stay the owner's.
 */
export default function ShareHomestead() {
    const [state, setState] = useState<ShareState | null>(null)
    const [name, setName] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [confirmEnd, setConfirmEnd] = useState(false)

    const load = useCallback(() => {
        apiFetch<ShareState>('/api/property/share').then(setState).catch(() => { })
    }, [])
    useEffect(() => { load() }, [load])
    useEffect(() => onSocket('property_storage_changed', () => { load() }), [load])
    useEffect(() => onSocket('property_shared', () => { load() }), [load])

    const act = async (path: string, body: unknown) => {
        setBusy(true); setError('')
        try {
            await apiFetch(`/api/property/share/${path}`, { method: 'POST', body: JSON.stringify(body) })
            setName('')
            load()
        } catch (e) {
            setError((e as { message?: string }).message || 'That did not work.')
        } finally {
            setBusy(false)
        }
    }

    const own = state?.ownHere
    if (!own) return null

    return (
        <div className="farm-build share-homestead">
            <p className="farm-build-grants">Sharing the store</p>
            {own.partner ? (
                <>
                    <p className="farm-note">
                        <span className="gold-text">{own.partner}</span> holds a key to this store, and may put in and take
                        out whenever they stand here. Your fields, pens, and building stay yours alone.
                    </p>
                    <button className="farm-btn" disabled={busy} onClick={() => setConfirmEnd(true)}>
                        Take {own.partner}&apos;s key back
                    </button>
                    <SharedLedger lines={own.ledger} />
                </>
            ) : (
                <>
                    <p className="farm-note">
                        Give one other player a key to this store, for trading goods with a partner in a trade beside
                        yours. They can put in and take out whenever they stand here, and nothing else. Either of you can end it at any time.
                    </p>
                    <div className="share-name-row">
                        <input
                            className="chat-input share-name-input"
                            placeholder="Their name"
                            value={name}
                            maxLength={32}
                            onChange={e => setName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && name.trim() && !busy) act('name', { name }) }}
                        />
                        <button className="farm-btn primary" disabled={busy || !name.trim()} onClick={() => act('name', { name })}>
                            Give a Key
                        </button>
                    </div>
                </>
            )}
            <ErrorLine message={error} className="store-error" />
            {confirmEnd && own.partner && (
                <ConfirmModal
                    message={`Take ${own.partner}'s key back? They will no longer be able to use this store. Everything in it stays where it is.`}
                    confirmLabel="Take It Back"
                    onConfirm={() => { setConfirmEnd(false); act('end', { propertyId: own.propertyId }) }}
                    onCancel={() => setConfirmEnd(false)}
                />
            )}
        </div>
    )
}
