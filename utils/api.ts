export const API_URL = process.env.NEXT_PUBLIC_API_URL

export const ENDPOINTS = {
  login: "/api/auth/login",
  verifyMFA: "/api/auth/verify-mfa",
}

export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = "APIError"
  }
}

export async function handleResponse(response: Response) {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new APIError(response.status, error.message || "An error occurred")
  }
  return response.json()
}

export function getAuthToken() {
  return localStorage.getItem("token")
}

export async function fetchAPI(
  endpoint: string,
  options: RequestInit = {},
  queryParams: Record<string, string | number> = {},
) {
  const queryString = new URLSearchParams(queryParams as any).toString()
  const url = `${API_URL}${endpoint}${queryString ? `?${queryString}` : ""}`

  const token = getAuthToken()
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
      ...options.headers,
    },
  })

  return handleResponse(response)
}

export async function login(email: string, password: string): Promise<void> {
  const response = await fetchAPI(ENDPOINTS.login, {
    method: "POST",
    body: JSON.stringify({ username: email, password }),
  })

  localStorage.setItem("token", response.token)
}

export function logout() {
  localStorage.removeItem("token")
}
