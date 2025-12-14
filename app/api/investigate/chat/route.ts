// app/api/investigate/chat/route.ts
export const runtime = 'nodejs';
export const maxDuration = 120; // 120 seconds (2 minutes) to allow for complex queries

import { NextResponse } from 'next/server';
import { askInvestigationAssistant } from '@/lib/neo4j';
import { askInvestigationAssistantWithRAG, gatherEvidence } from '@/lib/rag-investigation-assistant';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { question, messageId, useRAG = true } = body;

    if (!question || !messageId) {
      return NextResponse.json(
        { error: 'question and messageId are required' },
        { status: 400 }
      );
    }

    console.log('🤖 Investigation chat request:', { question, messageId, useRAG });

    let response: string;
    let citations: any[] = [];
    let evidence: any = null;

    if (useRAG) {
      // Use RAG-enhanced assistant with evidence citations
      const ragResult = await askInvestigationAssistantWithRAG(question, messageId);
      response = ragResult.answer;
      citations = ragResult.citations;

      // Also gather evidence for UI display (optional)
      try {
        evidence = await gatherEvidence(messageId);
      } catch (evidenceError) {
        console.warn('⚠️ Could not gather evidence for UI:', evidenceError);
      }
    } else {
      // Fallback to original Cypher-based assistant
      response = await askInvestigationAssistant(question, messageId);
    }

    return NextResponse.json({
      success: true,
      response,
      messageId,
      citations,
      evidence,
      usedRAG: useRAG
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
