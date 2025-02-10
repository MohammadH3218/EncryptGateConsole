// pages/api/auth/login.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ detail: "Method Not Allowed" });
  }

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ detail: "Username and password are required" });
  }

  try {
    const response = await fetch("https://<your-cognito-api-endpoint>/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json(errorData);
    }

    const data = await response.json();
    res.status(200).json(data);

  } catch (error) {
    console.error("Login API Error:", error);
    res.status(500).json({ detail: "Unexpected server error. Please try again later." });
  }
}
