/** Ask the game to open Wenna's book on a day (GameLayout.tsx listens). */
export function openChronicle(dayKey: string) {
    window.dispatchEvent(new CustomEvent('talaran:open-chronicle', { detail: { dayKey } }))
}
