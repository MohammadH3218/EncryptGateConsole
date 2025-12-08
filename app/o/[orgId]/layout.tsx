import { SessionProvider } from "@/providers/SessionProvider"
import { cookies } from "next/headers"

interface OrgLayoutProps {
  children: React.ReactNode
  params: Promise<{ orgId: string }>
}

export default async function OrgLayout({ children, params }: OrgLayoutProps) {
  const { orgId } = await params

  // Get auth tokens from cookies (server-side)
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('access_token')?.value || ""
  
  console.log(`🏢 OrgLayout: Loading for orgId=${orgId}, accessToken=${accessToken ? 'present' : 'missing'}`)
  
  // Don't redirect here - let middleware handle auth checks
  // This layout just provides the SessionProvider context

  return (
    <SessionProvider token={accessToken || undefined} orgId={orgId}>
      {children}
    </SessionProvider>
  )
}