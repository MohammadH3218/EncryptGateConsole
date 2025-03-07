// app/api/auth/auth_api_routes.js

export default async function handler(req, res) {
  // Allow only POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ detail: "Method Not Allowed" });
  }

  try {
    // Get API URL from environment variable
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.console-encryptgate.net';
    
    // Get the specific API endpoint from the URL path
    const pathParts = req.url.split('/');
    const endpoint = pathParts[pathParts.length - 1];
    
    // Map the endpoint to the correct backend URL
    let backendUrl;
    if (endpoint === 'login') {
      backendUrl = `${apiBaseUrl}/api/auth/authenticate`;
    } else if (endpoint === 'change-password') {
      backendUrl = `${apiBaseUrl}/api/auth/respond-to-challenge`;
    } else if (endpoint === 'verify-mfa') {
      backendUrl = `${apiBaseUrl}/api/auth/verify-mfa`;
    } else if (endpoint === 'setup-mfa') {
      backendUrl = `${apiBaseUrl}/api/auth/setup-mfa`;
    } else if (endpoint === 'verify-mfa-setup') {
      backendUrl = `${apiBaseUrl}/api/auth/verify-mfa-setup`;
    } else {
      return res.status(404).json({ detail: "Endpoint not found" });
    }
    
    console.log(`Proxying request to: ${backendUrl}`);
    
    // Forward the request to the backend
    const response = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Origin": req.headers.origin || "https://console-encryptgate.net"
      },
      body: JSON.stringify(req.body),
    });
    
    // Get the response data
    let responseData;
    try {
      responseData = await response.json();
    } catch (e) {
      responseData = { detail: "Could not parse response from server" };
    }
    
    // Return the response to the client
    return res.status(response.status).json(responseData);
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ 
      detail: "Failed to connect to authentication service",
      error: error.message
    });
  }
}