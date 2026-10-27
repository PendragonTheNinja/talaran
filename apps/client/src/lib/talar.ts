/**
 * Talar, as the client sees it (server: services/talar.ts). The reservoir's
 * numbers come from the server and are only drawn here.
 */

export interface Talar {
    current: number
    max: number
}

/** The grades a charged gem comes in; one of these in the pack can be absorbed. */
export const CHARGED_QUALITIES = ['lit', 'bright', 'radiant']

/** Tell the bar the reservoir changed, without refetching the whole player. */
export function announceTalar(talar: Talar) {
    window.dispatchEvent(new CustomEvent<Talar>('talaran:talar', { detail: talar }))
}
