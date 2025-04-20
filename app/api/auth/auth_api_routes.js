// app/auth/auth_api_routes.js

export default async function handler(req, res) {
  // Allow only POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ detail: "Method Not Allowed" });
  }

  // Destructure the request body
  const { username, password } = req.body;

  // Validate request data
  if (!username || !password) {
    return res.status(400).json({ detail: "Username and password are required" });
  }

  // API endpoint fetched from environment variable 
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;
  
  // Use the correct endpoint path based on backend route configuration
  // Changed from /api/auth/authenticate to /api/user/login to match the backend routes
  const loginEndpoint = `${apiBaseUrl}/api/user/login`;
  
  console.log(`Attempting to connect to API at: ${loginEndpoint}`);

  try {
    // Make a POST request to the Flask backend with additional options
    const response = await fetch(loginEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Origin": req.headers.origin || "https://console-encryptgate.net"
      },
      body: JSON.stringify({ username, password }),
      credentials: "include",
      mode: "cors",
      timeout: 10000 // 10 second timeout
    });

    // Handle non-OK responses
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ 
        detail: `HTTP error! Status: ${response.status}`,
        status: response.status
      }));
      console.error("Authentication API Error:", errorData);
      return res.status(response.status).json(errorData);
    }

    // Forward successful response to the client
    const data = await response.json();
    res.status(200).json(data);

  } catch (error) {
    // Log and return a server error response with more detailed information
    console.error("Login API Error:", error.message || error);
    res.status(500).json({ 
      detail: "Failed to connect to authentication service. Please try again later.",
      error: error.message || "Unknown error",
      endpoint: loginEndpoint
    });
  }
}