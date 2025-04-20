// utils/auth.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.console-encryptgate.net"

export function setAuthToken(token: string) {
  localStorage.setItem("token", token)
}

export function getAuthToken(): string | null {
  return localStorage.getItem("token")
}

export function clearAuthToken() {
  localStorage.removeItem("token")
}

export function isAuthenticated(): boolean {
  return Boolean(getAuthToken())
}

export async function getUserProfile(): Promise<any | null> {
  const token = getAuthToken()
  if (!token) return null

  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
    })
    if (res.ok) return res.json()
    if (res.status === 401) {
      clearAuthToken()
      window.location.href = "/login"
    }
    return null
  } catch (e) {
    console.error("Error fetching user profile:", e)
    return null
  }
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 2
): Promise<Response> {
  try {
    return await fetch(url, options)
  } catch (err: any) {
    if (retries > 0) return fetchWithRetry(url, options, retries - 1)
    throw err
  }
}

// Helper for your MFA time sync
export function getAdjustedTime(): Date | null {
  const off = localStorage.getItem("server_time_offset")
  return off ? new Date(Date.now() + parseInt(off, 10)) : null
}
