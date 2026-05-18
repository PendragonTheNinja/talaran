const BASE_URL = 'http://localhost:3000'

function getToken(): string | null {
  return localStorage.getItem('talaran_token')
}

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('talaran_token')

  const res = await fetch(`http://localhost:3000${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })

  if (res.status === 401) {
    // Token expired or invalid — clear storage and reload to login
    localStorage.removeItem('talaran_token')
    localStorage.removeItem('talaran_player')
    window.location.href = '/'
    throw new Error('Session expired. Please log in again.')
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Request failed: ${res.status}`)
  }

  return res.json()
}