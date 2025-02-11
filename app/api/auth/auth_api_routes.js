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
  const apiEndpoint = process.env.NEXT_PUBLIC_API_URL || "https://backend.console-encryptgate.net";

  try {
    // Make a POST request to the Flask backend
    const response = await fetch(`${apiEndpoint}/api/auth/authenticate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    // Handle non-OK responses
    if (!response.ok) {
      const errorData = await response.json();
      console.error("Authentication API Error:", errorData);
      return res.status(response.status).json(errorData);
    }

    // Forward successful response to the client
    const data = await response.json();
    res.status(200).json(data);

  } catch (error) {
    // Log and return a server error response
    console.error("Login API Error:", error);
    res.status(500).json({ detail: "Unexpected server error. Please try again later." });
  }
}
