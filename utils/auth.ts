// utils/auth.ts

// Store the authentication token in localStorage
export function setAuthToken(token: string) {
    localStorage.setItem("token", token);
  }
  
  // Get the authentication token from localStorage
  export function getAuthToken() {
    return localStorage.getItem("token");
  }
  
  // Remove the authentication token (for logout)
  export function clearAuthToken() {
    localStorage.removeItem("token");
  }
  
  // Check if the user is authenticated (i.e., token exists)
  export function isAuthenticated() {
    return !!getAuthToken();
  }
  
  // Fetch the current user's profile based on the token
  export async function getUserProfile() {
    const token = getAuthToken();
    if (!token) return null;
  
    try {
      const response = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
  
      if (response.ok) {
        return await response.json();
      } else if (response.status === 401) {
        // If the token is invalid or expired, clear it and redirect to login
        clearAuthToken();
        window.location.href = "/login";
      }
  
      return null;
    } catch (error) {
      console.error("Error fetching user profile:", error);
      return null;
    }
  }
  