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
}

export default function ConfirmModal({
    message, onConfirm, onCancel, confirmLabel, cancelLabel, secondaryLabel, onSecondary,
}: ConfirmModalProps) {
    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="confirm-modal" onClick={e => e.stopPropagation()}>
                <p className="confirm-message">{message}</p>
                <div className="confirm-actions">
                    <button className="btn btn-red" onClick={onConfirm}>{confirmLabel ?? 'Confirm'}</button>
                    {secondaryLabel && onSecondary && (
                        <button className="btn btn-red" onClick={onSecondary}>{secondaryLabel}</button>
                    )}
                    <button className="btn" onClick={onCancel}>{cancelLabel ?? 'Cancel'}</button>
                </div>
            </div>
        </div>
    )
}