import { io, Socket } from 'socket.io-client'

const SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

let socket: Socket | null = null

export function connectSocket(playerId: number): Socket {
  if (socket) socket.disconnect()
  socket = io(SERVER_URL, {
    // A callback, not an object: socket.io calls it on every (re)connection,
    // so a reconnect presents the token the player holds NOW. Read once, the
    // socket kept presenting the token it started with, and after a password
    // change issued a fresh one it could never reconnect.
    auth: (cb) => cb({ token: localStorage.getItem('talaran_token') }),
  })
  socket.on('connect', () => {
    socket!.emit('join', playerId)
    reportVisibility()
  })
  return socket
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
