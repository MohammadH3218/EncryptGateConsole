// app/api/investigate/chat/route.ts
export const runtime = 'nodejs';
export const maxDuration = 120; // 120 seconds (2 minutes) to allow for complex queries

import { NextResponse } from 'next/server';
import { askInvestigationAssistant } from '@/lib/neo4j';
import { askInvestigationAssistantWithRAG, gatherEvidence, formatEvidenceContext } from '@/lib/rag-investigation-assistant';
import { agentLoop, getAgentSystemPrompt } from '@/lib/agent';
import { fetchEmailContext } from '@/lib/neo4j';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { question, messageId, useRAG = true, useAgent = true } = body; // Default: Hybrid (RAG + Agent)

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
    let trace: any[] = [];

    if (useRAG && !useAgent) {
      // Pure RAG approach: Pre-defined hard-coded queries gather all data, LLM only interprets
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
      // HYBRID APPROACH (DEFAULT): RAG pre-fetches context + Agent writes custom queries
      // Best of both worlds: efficiency (pre-fetched common data) + flexibility (agent queries specifics)
      
      // Step 1: Gather foundational evidence with RAG (fast, covers common queries)
      try {
        evidence = await gatherEvidence(messageId);
        console.log('✅ RAG evidence gathered:', {
          hasEmailDetails: !!evidence.emailDetails,
          senderHistoryCount: evidence.senderHistory?.length || 0,
          relatedEmailsCount: evidence.relatedEmails?.length || 0
        });
      } catch (evidenceError) {
        console.warn('⚠️ Could not gather RAG evidence (continuing with agent only):', evidenceError);
        evidence = null;
      }

      // Step 2: Use agent with RAG context + ability to write custom queries
      try {
        // Fetch basic email context
        const emailContext = await fetchEmailContext(messageId);
        
        // Build enhanced system prompt with RAG evidence
        let systemPrompt = getAgentSystemPrompt(messageId, emailContext);
        
        if (evidence) {
          // Format RAG evidence as context for the agent
          const ragContext = formatEvidenceContext(evidence);
          systemPrompt += `\n\n**Pre-Gathered Context (from RAG):**\n${ragContext}\n\n**Important Notes:**\n- You already have the above context pre-fetched, so you may not need to query for basic information.\n- Use run_cypher only if you need additional specific information NOT covered above.\n- For example, if you need sender details for similar emails, you can query for them, but basic email details are already provided.`;
        }
        
        // Build messages for agent
        const initialMessages: any[] = [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: question
          }
        ];

        // Run agent loop (LLM can use pre-gathered context OR write custom queries as needed)
        const agentResult = await agentLoop(initialMessages, 8);
        response = agentResult.answer;
        trace = agentResult.trace || [];
        
        console.log(`✅ Hybrid approach completed: RAG context + ${trace.length} agent tool calls`);
      } catch (agentError: any) {
        console.error('❌ Agent execution failed, falling back to RAG-only:', agentError);
        // Fallback to RAG-only if agent fails
        try {
          const ragResult = await askInvestigationAssistantWithRAG(question, messageId);
          response = ragResult.answer;
          citations = ragResult.citations;
        } catch (fallbackError: any) {
          response = `❌ Error: ${agentError.message}. Fallback also failed: ${fallbackError.message}`;
        }
      }
    }

    return NextResponse.json({
      success: true,
      response,
      messageId,
      citations,
      evidence,
      trace,
      usedRAG: useRAG && !useAgent,
      usedAgent: useAgent,
      usedHybrid: useRAG && useAgent
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
