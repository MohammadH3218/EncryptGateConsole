"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export const useAuthSession = () => {
  const router = useRouter()

  useEffect(() => {
    const clientId = "u7p7ddajvruk8rccoajj8o5h0"
    const domain = "us-east-1kpxz426n8.auth.us-east-1.amazoncognito.com"
    const redirectUri = "https://console-encryptgate.net/admin/dashboard"

    const params = new URLSearchParams(window.location.search)
    const code = params.get("code")

    if (code) {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: redirectUri,
        code: code,
      })

      fetch(`https://${domain}/oauth2/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.id_token) {
            localStorage.setItem("idToken", data.id_token)
            localStorage.setItem("access_token", data.access_token)
            localStorage.setItem("refresh_token", data.refresh_token)
            window.history.replaceState({}, document.title, window.location.pathname)
          } else {
            redirectToLogin()
          }
        })
        .catch(() => redirectToLogin())
    } else {
      const idToken = localStorage.getItem("idToken")
      if (!idToken) {
        redirectToLogin()
      }
    }

    function redirectToLogin() {
      window.location.href = `https://${domain}/login?client_id=${clientId}&response_type=code&scope=email+openid+phone&redirect_uri=${redirectUri}`
    }
  }, [])
}
