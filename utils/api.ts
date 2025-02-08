// Base API URL - in production this would come from environment variables
export const API_URL = "https://api.example.com"

// API endpoints
export const ENDPOINTS = {
  employees: "/employees",
  detections: "/detections",
  emails: "/emails",
  assignments: "/assignments",
}

// API error handling
export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
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

// Generic fetch wrapper with error handling
export async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    })
    return handleResponse(response)
  } catch (error) {
    if (error instanceof APIError) {
      throw error
    }
    throw new APIError(500, "Network error")
  }
}

