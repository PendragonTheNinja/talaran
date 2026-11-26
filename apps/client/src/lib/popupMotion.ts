/**
 * Every pop-up opens and closes with the loot log's motion (Nathan,
 * 2026-11-26): a quick scale and fade in, a quicker one out. popupMotion.css
 * draws the opening for every overlay named here. The closing needs this
 * file, because React removes a closed pop-up at once and leaves nothing to
 * animate: a watcher on the page sees an overlay go, puts a lifeless copy of it
 * back for the length of the exit, plays the exit on that, and removes it.
 * The copy takes no clicks and is hidden from screen readers, so a pop-up is
 * gone the moment it is closed in every way but the look.
 *
 * Panels that already slide in and out by themselves (Messages, Guild,
 * Settings, the log panel) are not overlays here and keep their own motion.
 */

export const POPUP_OVERLAYS = [
    'farm-overlay', 'modal-overlay', 'profile-overlay', 'map-overlay', 'npc-overlay',
    'trade-overlay', 'tavern-overlay', 'tally-overlay', 'workstation-overlay',
    'foraging-overlay', 'fishing-overlay', 'mkt-overlay', 'shp-overlay', 'msh-overlay',
    'chat-history-overlay', 'skills-modal-overlay', 'botcheck-overlay', 'levelup-popup',
]
// The bell's pop-over opens with the same motion (popupMotion.css) but closes
// plainly: it sits inside the scene, not on the window, so a copy put on the
// page would close in the wrong place.

/** Must match popup-out in popupMotion.css. */
const EXIT_MS = 130

const SELECTOR = POPUP_OVERLAYS.map(c => `.${c}`).join(',')

function reducedMotion(): boolean {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** Start watching for closed pop-ups. Called once, from main.tsx. */
export function watchPopupExits(): void {
    if (typeof MutationObserver === 'undefined') return
    const observer = new MutationObserver(records => {
        if (reducedMotion()) return
        for (const record of records) {
            for (const node of record.removedNodes) {
                if (!(node instanceof HTMLElement)) continue
                if (node.classList.contains('popup-leaving') || !node.matches(SELECTOR)) continue
                // A pop-up inside a whole screen being torn down (a layout
                // switch, logging out) goes with it, unanimated.
                if (!record.target.isConnected) continue
                const ghost = node.cloneNode(true) as HTMLElement
                ghost.classList.add('popup-leaving')
                ghost.setAttribute('aria-hidden', 'true')
                ghost.setAttribute('inert', '')
                // On the page itself, not back in React's tree: every overlay
                // here is fixed to the window, so it looks the same there.
                document.body.appendChild(ghost)
                window.setTimeout(() => ghost.remove(), EXIT_MS + 20)
            }
        }
    })
    observer.observe(document.body, { childList: true, subtree: true })
}
