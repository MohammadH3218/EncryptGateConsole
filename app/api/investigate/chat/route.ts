// app/api/investigate/chat/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { askCopilot } from '@/lib/neo4j';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { question, messageId } = body;

    if (!question || !messageId) {
      return NextResponse.json(
        { error: 'question and messageId are required' },
        { status: 400 }
      );
    }

    console.log('🤖 Investigation chat request:', { question, messageId });

    // Use the Neo4j copilot function
    const response = await askCopilot(question, messageId);

    return NextResponse.json({
      success: true,
      response,
      messageId,
    });

  } catch (err: any) {
    console.error('❌ [POST /api/investigate/chat] error:', err);
    return NextResponse.json(
      {
        error: 'Failed to process investigation question',
        details: err.message,
        success: false,
      },
      { status: 500 }
    );
  }
}
