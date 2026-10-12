import { useState, type ReactNode } from 'react'
import './ConfirmModal.css'

interface ConfirmModalProps {
    message: string
    onConfirm: () => void
    onCancel: () => void
    confirmLabel?: string
    cancelLabel?: string
    /**
     * A third, distinct choice.
     *
     * Added for pulling down an apiary, where the question is not yes or no but
     * "take the bees or let them go". Folding the second outcome onto onCancel
     * would mean a stray click on the overlay destroyed a colony, so backing out
     * has to stay the safe path.
     */
    secondaryLabel?: string
    onSecondary?: () => void
    /** A heading above the message, for a choice that needs one. */
    title?: string
    /** Detail under the message, laid out by the caller (a list of what will happen). */
    children?: ReactNode
    /**
     * A box the player must tick before Confirm will work, for a choice that
     * can cost them something real. Added for fighting on while away, which can
     * end in a death with nobody there to see it.
     */
    acknowledge?: string
}

export default function ConfirmModal({
    message, onConfirm, onCancel, confirmLabel, cancelLabel, secondaryLabel, onSecondary, title, children, acknowledge,
}: ConfirmModalProps) {
    const [understood, setUnderstood] = useState(false)
    const blocked = !!acknowledge && !understood
    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className={`confirm-modal ${children ? 'confirm-modal-detailed' : ''}`} onClick={e => e.stopPropagation()}>
                {title && <h3 className="gold-text confirm-title">{title}</h3>}
                <p className="confirm-message">{message}</p>
                {children && <div className="confirm-detail">{children}</div>}
                {acknowledge && (
                    <label className="confirm-acknowledge">
                        <input type="checkbox" checked={understood} onChange={e => setUnderstood(e.target.checked)} />
                        <span>{acknowledge}</span>
                    </label>
                )}
                <div className="confirm-actions">
                    <button className="btn btn-red" disabled={blocked} onClick={onConfirm}>{confirmLabel ?? 'Confirm'}</button>
                    {secondaryLabel && onSecondary && (
                        <button className="btn btn-red" onClick={onSecondary}>{secondaryLabel}</button>
                    )}
                    <button className="btn" onClick={onCancel}>{cancelLabel ?? 'Cancel'}</button>
                </div>
            </div>
        </div>
    )
}