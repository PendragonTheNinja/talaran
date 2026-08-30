const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function getToken(): string | null {
  return localStorage.getItem('talaran_token')
}

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('talaran_token')

  const res = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })

  if (res.status === 401) {
    localStorage.removeItem('talaran_token')
    localStorage.removeItem('talaran_player')
    window.location.href = '/'
    throw new Error('Session expired. Please log in again.')
  }

  if (res.status === 423) {
    const data = await res.json().catch(() => ({}))
    // Locked pending a bot check. The question comes back with the refusal, so
    // this works even when the socket is down, which is the case that left a
    // player unable to do anything at all.
    if (data.botCheck && typeof data.a === 'number' && typeof data.b === 'number') {
      window.dispatchEvent(new CustomEvent('talaran:bot-check', {
        detail: { a: data.a as number, b: data.b as number },
      }))
    }
    const error: any = new Error(data.error || 'Bot check required.')
    error.status = 423
    error.body = data
    throw error
  }

  if (res.status === 403) {
    const data = await res.json().catch(() => ({}))
    // A lapsed guest still holds a valid token, so the 401 path above would be
    // wrong: clearing it and redirecting drops them at a login form they never
    // filled in, along with the progress they might have claimed. Announce it
    // instead and let App show the claim panel over the game.
    if (data.reason === 'guest_expired') {
      window.dispatchEvent(new CustomEvent('talaran:guest-expired'))
    } else if (data.reason === 'guest' || data.reason === 'unverified') {
      // Surfaced centrally rather than at each call site. Dozens of endpoints
      // are gated and most of their catch blocks only log, so a guest hitting
      // one would see nothing happen at all. Announcing here covers every
      // gated route at once, including any added later.
      window.dispatchEvent(new CustomEvent('talaran:blocked', {
        detail: { message: data.error as string },
      }))
    }
    const error: any = new Error(data.error || 'Forbidden')
    error.status = 403
    error.body = data
    throw error
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const error: any = new Error(data.error || `Request failed: ${res.status}`)
    error.status = res.status
    error.body = data
    throw error
  }

  return res.json()
}