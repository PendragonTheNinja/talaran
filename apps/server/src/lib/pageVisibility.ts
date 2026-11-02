/**
 * Whether a player has the game on screen right now, per open tab.
 *
 * Each socket reports its page's visibility (the browser's visibilitychange:
 * 'page_visibility' from the client, sent on connect and on every change).
 * Push notifications are only for when nobody is looking (Nathan, 2026-11-02:
 * a game tab hidden behind another one on a PC counts as not looking), so a
 * notification is skipped when ANY of the player's tabs is visible.
 *
 * Held in process memory, like the rest of presence (the server is one
 * fork-mode process). A socket that has not reported yet counts as visible:
 * a page that just loaded is almost always in front of someone, and erring
 * that way costs a missed notification rather than a pointless one.
 */

const visibleBySocket = new Map<string, { playerId: number; visible: boolean }>();

export function setPageVisibility(socketId: string, playerId: number, visible: boolean): void {
    visibleBySocket.set(socketId, { playerId, visible });
}

export function forgetSocket(socketId: string): void {
    visibleBySocket.delete(socketId);
}

/** True when any of this player's connected tabs is showing the game. */
export function gameOnScreen(playerId: number): boolean {
    for (const v of visibleBySocket.values()) {
        if (v.playerId === playerId && v.visible) return true;
    }
    return false;
}
