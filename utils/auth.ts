export function setAuthToken(token: string) {
  localStorage.setItem("token", token)
}

export function getAuthToken() {
  return localStorage.getItem("token")
}

export function clearAuthToken() {
  localStorage.removeItem("token")
}

export function isAuthenticated() {
  return !!getAuthToken()
}

export async function getUserProfile() {
  const token = getAuthToken()
  if (!token) return null

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (response.ok) {
      return await response.json()
    } else if (response.status === 401) {
      clearAuthToken()
      window.location.href = "/login"
    }

    return null
  } catch (error) {
    console.error("Error fetching user profile:", error)
    return null
  }
}
