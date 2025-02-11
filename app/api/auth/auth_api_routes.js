// app/auth/auth_api_routes.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ detail: "Method Not Allowed" });
  }

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ detail: "Username and password are required" });
  }

  // Get API endpoint from environment variable
  const apiEndpoint = process.env.NEXT_PUBLIC_API_URL || "https://console-encryptgate.net/api/auth/authenticate";

  try {
    // Make the request to the Flask backend
    const response = await fetch(`${apiEndpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    // Handle non-OK responses from backend
    if (!response.ok) {
      const errorData = await response.json();
      console.error("Authentication API Error:", errorData);
      return res.status(response.status).json(errorData);
    }

    // Successfully authenticated
    const data = await response.json();
    res.status(200).json(data);

  } catch (error) {
    // Log the error and respond with a 500 status code
    console.error("Login API Error:", error);
    res.status(500).json({ detail: "Unexpected server error. Please try again later." });
  }
}
