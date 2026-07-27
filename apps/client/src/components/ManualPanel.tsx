import { useIsMobile } from '../lib/useIsMobile'
import { useDockableWindow } from '../lib/useDockableWindow'
import DockableWindow from './DockableWindow'
import ManualBrowser from './ManualBrowser'
import './Manual.css'

interface ManualPanelProps {
    onClose: () => void
    closing?: boolean
    /** Deep link target, for contextual "?" affordances on other panels. */
    initialSection?: string
    initialSlug?: string
}

export default function ManualPanel({
    onClose,
    closing,
    initialSection,
    initialSlug,
}: ManualPanelProps) {
    const isMobile = useIsMobile()
    const dock = useDockableWindow('manual')

    return (
        <DockableWindow
            dock={dock}
            enabled={!isMobile}
            onClose={onClose}
            className={`manual-panel ${closing ? 'closing' : ''}`}
            dragHandleClassName="manual-panel-header"
        >
            <div className="manual-panel-header">
                <h3 className="gold-text">Manual</h3>
                <div className="manual-panel-header-actions">
                    {!isMobile && (
                        <>
                            <button
                                className="dock-btn"
                                onClick={dock.togglePop}
                                title={dock.isPopped ? 'Dock panel' : 'Pop out'}
                            >
                                {dock.isPopped ? '⤡' : '⤢'}
                            </button>
                            {dock.isPopped && (
                                <button
                                    className={`dock-btn ${dock.isPinned ? 'active' : ''}`}
                                    onClick={dock.togglePin}
                                    title={dock.isPinned ? 'Unpin (click-away closes)' : 'Pin on top'}
                                >
                                    📌
                                </button>
                            )}
                        </>
                    )}
                    <button className="modal-close-btn" onClick={onClose}>✕</button>
                </div>
            </div>

            <ManualBrowser
                variant="panel"
                initialSection={initialSection}
                initialSlug={initialSlug}
            />
        </DockableWindow>
    )
}
