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

  // API endpoint fetched from environment variable or fallback URL
  // Update to use the direct Elastic Beanstalk URL
  const apiEndpoint = process.env.NEXT_PUBLIC_API_URL || "https://encryptgateconsole-env.eba-r2es7hns.us-east-1.elasticbeanstalk.com";
  
  console.log(`Attempting to connect to API at: ${apiEndpoint}/api/auth/authenticate`);

  try {
    // Make a POST request to the Flask backend with additional options
    const response = await fetch(`${apiEndpoint}/api/auth/authenticate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Origin": "https://console-encryptgate.net"
      },
      body: JSON.stringify({ username, password }),
      credentials: "include",
      mode: "cors",
      timeout: 10000 // 10 second timeout
    });

    // Handle non-OK responses
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `HTTP error! Status: ${response.status}` }));
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
      apiEndpoint: apiEndpoint
    });
  }
}