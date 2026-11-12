import type { MouseEvent, PointerEvent } from 'react'

/**
 * Props for a pop-up's backdrop: it closes the pop-up only when a press both
 * starts and ends on the backdrop itself.
 *
 * Backdrops closed on `onClick`, and a click fires on the element both ends of
 * the press share. Selecting text inside a pop-up and letting go just past its
 * edge was a click on the backdrop, so the pop-up closed under the player
 * (Nathan, 2026-11-12). Where the press began is kept on the element, not in a
 * closure, so a re-render between press and release (any ticking timer) does
 * not lose it. DockableWindow's dismiss layer already closes on press-down.
 *
 *     <div className="modal-overlay" {...backdropClose(onClose)}>
 */
export function backdropClose(close: () => void) {
    return {
        onPointerDown: (e: PointerEvent<HTMLElement>) => {
            e.currentTarget.dataset.pressedHere = e.target === e.currentTarget ? '1' : ''
        },
        onClick: (e: MouseEvent<HTMLElement>) => {
            const pressedHere = e.currentTarget.dataset.pressedHere === '1'
            e.currentTarget.dataset.pressedHere = ''
            if (pressedHere && e.target === e.currentTarget) close()
        },
    }
}
