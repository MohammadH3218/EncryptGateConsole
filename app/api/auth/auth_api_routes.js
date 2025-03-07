// app/api/auth/login/route.js
export async function POST(req) {
  try {
    // Parse request body
    const body = await req.json();
    const { username, password } = body;
    
    // Validate request data
    if (!username || !password) {
      return new Response(
        JSON.stringify({ error: "Username and password are required" }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get API URL from environment variable
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.console-encryptgate.net';
    const loginEndpoint = `${apiBaseUrl}/api/auth/login`;
    
    // Call the backend API
    const response = await fetch(loginEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Origin": req.headers.get('origin') || "https://console-encryptgate.net"
      },
      body: JSON.stringify({ username, password }),
      credentials: "include",
    });

    // Get response data
    const data = await response.json();
    
    // Return response with same status code
    return new Response(
      JSON.stringify(data),
      { 
        status: response.status, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    // Handle errors
    console.error("Authentication error:", error);
    return new Response(
      JSON.stringify({ 
        error: "Failed to authenticate. Please try again later.",
        details: error.message
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}