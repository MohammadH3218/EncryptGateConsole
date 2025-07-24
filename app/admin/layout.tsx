// app/admin/layout.tsx

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

export default async function AdminLayout({
  children,
}: {
  children: ReactNode
}) {
  // Await the cookie store and pull out our httpOnly id_token
  const cookieStore = await cookies()
  const idToken = cookieStore.get('id_token')?.value

  // If no session, send the user to Cognito Hosted UI
  if (!idToken) {
    redirect('/api/auth/login')
  }

  // Otherwise render whatever admin pages they requested
  return <>{children}</>
}