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
  })
  return socket
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