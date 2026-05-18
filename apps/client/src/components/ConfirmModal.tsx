import './ConfirmModal.css'

interface ConfirmModalProps {
    message: string
    onConfirm: () => void
    onCancel: () => void
}

export default function ConfirmModal({ message, onConfirm, onCancel }: ConfirmModalProps) {
    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="confirm-modal" onClick={e => e.stopPropagation()}>
                <p className="confirm-message">{message}</p>
                <div className="confirm-actions">
                    <button className="btn btn-red" onClick={onConfirm}>Confirm</button>
                    <button className="btn" onClick={onCancel}>Cancel</button>
                </div>
            </div>
        </div>
    )
}