// app/api/investigation-history/[emailId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSessionsByEmail, getSession } from '@/lib/investigation-history'

export const dynamic = 'force-dynamic'

/**
 * GET /api/investigation-history/[emailId]
 *
 * Get all investigation sessions for an email
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { emailId: string } }
) {
  try {
    const emailId = decodeURIComponent(params.emailId)

    const sessions = await getSessionsByEmail(emailId)

    return NextResponse.json({
      success: true,
      emailId,
      sessions,
      count: sessions.length
    })
  } catch (error: any) {
    console.error('Failed to get investigation history:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve investigation history', details: error.message },
      { status: 500 }
    )
  }
}
