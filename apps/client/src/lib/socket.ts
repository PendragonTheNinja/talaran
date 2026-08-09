import { io, Socket } from 'socket.io-client'

const SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

let socket: Socket | null = null

export function connectSocket(playerId: number): Socket {
  if (socket) socket.disconnect()
  socket = io(SERVER_URL, {
    auth: { token: localStorage.getItem('talaran_token') }
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