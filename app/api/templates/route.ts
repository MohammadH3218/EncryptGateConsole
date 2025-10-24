// app/api/templates/route.ts
import { NextRequest, NextResponse } from 'next/server'
import {
  getPublicTemplates,
  getUserTemplates,
  getOrgTemplates,
  createTemplate,
  getBuiltInTemplates,
  searchTemplates
} from '@/lib/investigation-templates'

export const dynamic = 'force-dynamic'

/**
 * GET /api/templates
 *
 * Get investigation templates
 * Query params:
 * - type: 'public' | 'user' | 'org' | 'builtin'
 * - userId: for type=user
 * - orgId: for type=org
 * - search: search query
 * - category: filter by category
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'builtin'
    const userId = searchParams.get('userId')
    const orgId = searchParams.get('orgId')
    const search = searchParams.get('search')
    const category = searchParams.get('category')

    let templates: any[] = []

    if (search) {
      templates = await searchTemplates(search, category || undefined)
    } else {
      switch (type) {
        case 'builtin':
          templates = getBuiltInTemplates()
          break
        case 'public':
          templates = await getPublicTemplates()
          break
        case 'user':
          if (!userId) {
            return NextResponse.json({ error: 'userId required for type=user' }, { status: 400 })
          }
          templates = await getUserTemplates(userId)
          break
        case 'org':
          if (!orgId) {
            return NextResponse.json({ error: 'orgId required for type=org' }, { status: 400 })
          }
          templates = await getOrgTemplates(orgId)
          break
        default:
          templates = getBuiltInTemplates()
      }
    }

    return NextResponse.json({
      success: true,
      templates,
      count: templates.length
    })
  } catch (error: any) {
    console.error('Failed to get templates:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve templates', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/templates
 *
 * Create a new template
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      name,
      description,
      prompt,
      createdBy,
      isPublic,
      orgId,
      tags,
      expectedSteps,
      category
    } = body

    if (!name || !description || !prompt || !createdBy) {
      return NextResponse.json(
        { error: 'name, description, prompt, and createdBy are required' },
        { status: 400 }
      )
    }

    const template = await createTemplate(
      name,
      description,
      prompt,
      createdBy,
      {
        isPublic,
        orgId,
        tags,
        expectedSteps,
        category
      }
    )

    return NextResponse.json({
      success: true,
      template
    })
  } catch (error: any) {
    console.error('Failed to create template:', error)
    return NextResponse.json(
      { error: 'Failed to create template', details: error.message },
      { status: 500 }
    )
  }
}
