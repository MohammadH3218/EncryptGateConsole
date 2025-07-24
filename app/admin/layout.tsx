// app/admin/layout.tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { AppSidebar } from '@/components/sidebar/app-sidebar' 

export default async function AdminLayout({
  children,
}: {
  children: ReactNode
}) {
  // Await the cookie store and pull out our httpOnly id_token
  const cookieStore = await cookies()
  const idToken = cookieStore.get('id_token')?.value
  const accessToken = cookieStore.get('access_token')?.value

  // If no session, send the user to Cognito Hosted UI
  if (!idToken || !accessToken) {
    redirect('/api/auth/login')
  }

  // Otherwise render the admin layout with navigation sidebar
  return (
    <div className="admin-layout">
      <AppSidebar
        isCollapsed={false}
        onToggle={() => {}}
        username="Admin"
        onSignOut={() => {}}
      />
      <main className="admin-content">
        {children}
      </main>
    </div>
  )
}