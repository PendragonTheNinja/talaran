import { Rnd } from 'react-rnd'
import type { DockApi } from '../lib/useDockableWindow'
import './DockableWindow.css'

interface DockableWindowProps {
    dock: DockApi
    enabled: boolean
    onClose: () => void
    className?: string
    dragHandleClassName?: string
    children: React.ReactNode
}

export default function DockableWindow({ dock, enabled, onClose, className = '', dragHandleClassName, children }: DockableWindowProps) {
    // Docked (or mobile): normal fixed overlay, unchanged behavior
    if (!enabled || !dock.isPopped) {
        return <div className={className}>{children}</div>
    }

    // Popped: floating, draggable, resizable window bound to the game viewport
    return (
        <>
            {!dock.isPinned && <div className="dock-dismiss-layer" onMouseDown={onClose} />}
            <Rnd
                className="dockable-rnd"
                position={{ x: dock.x, y: dock.y }}
                size={{ width: dock.width, height: dock.height }}
                onDragStop={(_e, d) => dock.setPosition(d.x, d.y)}
                onResizeStop={(_e, _dir, ref, _delta, pos) => dock.setSize(ref.offsetWidth, ref.offsetHeight, pos.x, pos.y)}
                bounds="window"
                minWidth={340}
                minHeight={260}
                dragHandleClassName={dragHandleClassName}
                cancel=".btn, .modal-close-btn, .dock-btn, input, textarea, a"
                style={{ zIndex: dock.isPinned ? 1100 : 1000 }}
            >
                <div className={`${className} dockable-popped-inner`}>{children}</div>
            </Rnd>
        </>
    )
}