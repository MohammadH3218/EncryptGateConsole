import { SessionProvider } from "@/providers/SessionProvider"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import OrgContextSync from "@/components/OrgContextSync"

interface OrgLayoutProps {
  children: React.ReactNode
  params: { orgId: string }
}

export default function OrgLayout({ children, params }: OrgLayoutProps) {
  const { orgId } = params

  // Get auth tokens from cookies (server-side)
  const cookieStore = cookies()
  const accessToken = cookieStore.get('access_token')?.value || ""
  
  // If no token, redirect to login
  if (!accessToken) {
    redirect('/login')
  }

  return (
    <SessionProvider token={accessToken} orgId={orgId}>
      <OrgContextSync orgId={orgId} />
      {children}
    </SessionProvider>
  )
}