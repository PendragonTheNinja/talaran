import { io, Socket } from 'socket.io-client'

const SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

let socket: Socket | null = null

/**
 * Fired on the window when the socket comes back after being lost, so a view
 * that only hears live events (chat) can reload what it missed meanwhile.
 */
export const SOCKET_RESYNC_EVENT = 'talaran:socket-resync'

export function connectSocket(playerId: number): Socket {
  if (socket) socket.disconnect()
  socket = io(SERVER_URL, {
    // A callback, not an object: socket.io calls it on every (re)connection,
    // so a reconnect presents the token the player holds NOW. Read once, the
    // socket kept presenting the token it started with, and after a password
    // change issued a fresh one it could never reconnect.
    auth: (cb) => cb({ token: localStorage.getItem('talaran_token') }),
  })
  let connectedBefore = false
  socket.on('connect', () => {
    socket!.emit('join', playerId)
    reportVisibility()
    // A reconnect: everything said while it was down was never heard.
    if (connectedBefore) window.dispatchEvent(new Event(SOCKET_RESYNC_EVENT))
    connectedBefore = true
  })
  return socket
}

/** How long a page must have been away before its socket is checked on return. */
const AWAY_CHECK_MS = 10_000
/** How long the server has to answer before the socket counts as dead. */
const ALIVE_TIMEOUT_MS = 4_000
let hiddenAt: number | null = null

/**
 * Back on screen after a while away (a phone that switched apps): make sure
 * the socket still works. A phone often hands back a socket that looks open
 * but is dead, and socket.io can take most of a minute to notice, so chat sat
 * frozen until a refresh (Nathan, 2026-11-07). Ask the server; no answer in
 * a few seconds, reconnect. A dropped socket is reconnected straight away.
 * Never a disconnect for its own sake: a live socket is left alone, because
 * losing it can end a fight.
 */
function checkOnReturn() {
  if (document.visibilityState !== 'visible') {
    hiddenAt = Date.now()
    return
  }
  const away = hiddenAt === null ? 0 : Date.now() - hiddenAt
  hiddenAt = null
  const s = socket
  if (!s || away < AWAY_CHECK_MS) return
  if (!s.connected) {
    s.connect()
    return
  }
  s.timeout(ALIVE_TIMEOUT_MS).emit('alive', (err: Error | null) => {
    if (err && socket === s) {
      s.disconnect()
      s.connect()
    } else if (!err) {
      // Still alive, but messages may have come and gone while the page
      // slept: let the views catch up.
      window.dispatchEvent(new Event(SOCKET_RESYNC_EVENT))
    }
  })
}


/**
 * Tell the server whether this tab is on screen, so push notifications go only
 * to a player who is not looking (server lib/pageVisibility.ts). Sent on every
 * connect and every change; a tab behind another one, or a phone with its
 * screen off, is not on screen.
 */
function reportVisibility() {
  socket?.emit('page_visibility', document.visibilityState === 'visible')
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', reportVisibility)
  document.addEventListener('visibilitychange', checkOnReturn)
}

export function getSocket(): Socket | null {
  return socket
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
/**
 * Listen for `event` once the socket exists, and return the cleanup.
 *
 * The game draws before the socket connects (App.tsx connects after the first
 * loads), so a component that mounts with the page and calls getSocket() in an
 * effect finds nothing, returns, and never listens: a portal cast here did not
 * appear until a refresh (2026-11-03). This waits for the socket, as GameView
 * and ChatPanel do by hand.
 */
export function onSocket(event: string, handler: (...args: never[]) => void): () => void {
  let bound: Socket | null = null
  const attach = () => {
    if (!socket) return false
    bound = socket
    bound.on(event, handler as (...args: unknown[]) => void)
    return true
  }
  let timer: ReturnType<typeof setInterval> | null = null
  if (!attach()) {
    timer = setInterval(() => { if (attach() && timer) { clearInterval(timer); timer = null } }, 100)
  }
  return () => {
    if (timer) clearInterval(timer)
    bound?.off(event, handler as (...args: unknown[]) => void)
  }
}
