// app/api/auth/auth_api_routes.js

export default async function handler(req, res) {
  // Allow only POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ detail: "Method Not Allowed" });
  }

  // Destructure the request body
  const { username, password, session, code, new_password, access_token } = req.body;

  // API endpoint fetched from environment variable 
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.console-encryptgate.net';
  
  // Determine which endpoint to call based on the request path
  const path = req.url.split('/').pop();
  let apiEndpoint;
  let requestBody = {};

  // Set the appropriate endpoint and request body
  if (path === 'login') {
    apiEndpoint = `${apiBaseUrl}/api/auth/authenticate`;
    requestBody = { username, password };
  } else if (path === 'change-password') {
    apiEndpoint = `${apiBaseUrl}/api/auth/respond-to-challenge`;
    requestBody = { 
      username, 
      session, 
      challengeName: "NEW_PASSWORD_REQUIRED",
      challengeResponses: {
        "NEW_PASSWORD": new_password
      }
    };
  } else if (path === 'verify-mfa') {
    apiEndpoint = `${apiBaseUrl}/api/auth/verify-mfa`;
    requestBody = { username, session, code };
  } else if (path === 'setup-mfa') {
    apiEndpoint = `${apiBaseUrl}/api/auth/setup-mfa`;
    requestBody = { access_token };
  } else if (path === 'verify-mfa-setup') {
    apiEndpoint = `${apiBaseUrl}/api/auth/verify-mfa-setup`;
    requestBody = { access_token, code };
  } else {
    return res.status(404).json({ detail: "Endpoint not found" });
  }
  
  console.log(`Attempting to connect to API at: ${apiEndpoint}`);

  try {
    // Make a POST request to the Flask backend with additional options
    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Origin": req.headers.origin || "https://console-encryptgate.net"
      },
      body: JSON.stringify(requestBody),
      credentials: "include",
      mode: "cors",
    });

    // Handle non-OK responses
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ 
        detail: `HTTP error! Status: ${response.status}`,
        status: response.status
      }));
      console.error("API Error:", errorData);
      return res.status(response.status).json(errorData);
    }

    // Forward successful response to the client
    const data = await response.json();
    res.status(200).json(data);

  } catch (error) {
    // Log and return a server error response with more detailed information
    console.error("API Error:", error.message || error);
    res.status(500).json({ 
      detail: "Failed to connect to authentication service. Please try again later.",
      error: error.message || "Unknown error",
      endpoint: apiEndpoint
    });
  }
}