import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

export function connectSocket(playerId: number): Socket {
  if (socket) socket.disconnect()

  socket = io('http://localhost:3000', {
    auth: { token: localStorage.getItem('talaran_token') }
  })

  socket.on('connect', () => {
    console.log('Socket connected')
    socket!.emit('join', playerId)
  })

  socket.on('disconnect', () => {
    console.log('Socket disconnected')
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