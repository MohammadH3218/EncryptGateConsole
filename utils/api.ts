// Base API URL - fetched from environment variable for production
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.example.com"

// API endpoints
export const ENDPOINTS = {
  employees: "/employees",
  detections: "/detections",
  emails: "/emails",
  assignments: "/assignments",
}

// API error handling
export class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = "APIError"
  }
}

// Helper function to handle API responses
export async function handleResponse(response: Response) {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new APIError(response.status, error.message || "An error occurred")
  }
  return response.json()
}

// Function to get the stored token
export function getAuthToken() {
  return localStorage.getItem("token")
}

// Generic fetch wrapper with token and error handling
export async function fetchAPI(
  endpoint: string,
  options: RequestInit = {},
  queryParams: Record<string, string | number> = {}
) {
  try {
    // Build URL with query parameters
    const queryString = new URLSearchParams(queryParams as any).toString()
    const url = `${API_URL}${endpoint}${queryString ? `?${queryString}` : ""}`

    // Include the authentication token
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
  } catch (error) {
    if (error instanceof APIError) {
      console.error("API Error:", error.status, error.message)
      throw error
    }
    throw new APIError(500, "Network error")
  }
}

// Function to login and store token
export async function login(email: string, password: string): Promise<void> {
  try {
    const response = await fetchAPI(ENDPOINTS.employees, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    })

    // Store the JWT token on successful login
    localStorage.setItem("token", response.token)
  } catch (error) {
    console.error("Login error:", error)
    throw error
  }
}

// Function to logout and clear token
export function logout() {
  localStorage.removeItem("token")
}
