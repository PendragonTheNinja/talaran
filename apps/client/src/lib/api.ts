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

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Request failed: ${res.status}`)
  }

  return res.json()
}