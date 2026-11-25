import { useState } from 'react'
import { apiFetch } from '../lib/api'
import { backdropClose } from '../lib/backdrop'
import PropertyStorage from './PropertyStorage'
import ConfirmModal from './ConfirmModal'
import ErrorLine from './ErrorLine'
import './FarmPanel.css'

/**
 * The store of a homestead whose owner gave this player a key
 * (services/propertyPartners.ts). Opened from the place's actions, beside
 * the player's own homestead.
 */
export default function SharedStoragePanel({ propertyId, owner, onClose, onEnded }: {
    propertyId: number
    owner: string
    onClose: () => void
    /** The key was given back: the place's buttons need to know. */
    onEnded?: () => void
}) {
    const [amount, setAmount] = useState(1)
    const [confirm, setConfirm] = useState(false)
    const [error, setError] = useState('')

    const giveBack = async () => {
        setError('')
        try {
            await apiFetch('/api/property/share/end', { method: 'POST', body: JSON.stringify({ propertyId }) })
            onEnded?.()
            onClose()
        } catch (e) {
            setError((e as { message?: string }).message || 'That did not work.')
        }
    }

    return (
        <div className="farm-overlay" {...backdropClose(onClose)}>
            <div className="farm-modal" onClick={e => e.stopPropagation()}>
                <div className="farm-header">
                    <h2>{owner}&apos;s Store</h2>
                    <button className="farm-close" onClick={onClose} aria-label="Close">✕</button>
                </div>
                <p className="farm-note">
                    {owner} has given you a key to this store. What you put in, they can take out, and what they put in, you can.
                </p>
                <PropertyStorage
                    sharedPropertyId={propertyId}
                    storeMode={false}
                    onToggleStoreMode={() => { }}
                    storeAmount={amount}
                    onStoreAmountChange={setAmount}
                />
                <ErrorLine message={error} className="store-error" />
                <div className="share-giveback">
                    <button className="farm-btn" onClick={() => setConfirm(true)}>Give the Key Back</button>
                </div>
                {confirm && (
                    <ConfirmModal
                        message={`Give ${owner} their key back? You will no longer be able to use this store. Everything in it stays where it is.`}
                        confirmLabel="Give It Back"
                        onConfirm={() => { setConfirm(false); giveBack() }}
                        onCancel={() => setConfirm(false)}
                    />
                )}
            </div>
        </div>
    )
}
