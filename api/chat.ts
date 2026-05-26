import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import {
  buildSystemPrompt,
  listClaimsTool,
  analyzeClaimTool,
  searchSimilarClaimsTool,
  draftCorrespondenceTool,
  editClaimTool,
} from './_lib/shared.js';

export const config = { runtime: 'edge' };

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: 'https://api.anthropic.com/v1',
});

export default async function handler(req: Request): Promise<Response> {
  const start = Date.now();
  try {
    const { messages, claimContext } = await req.json() as { messages: unknown[]; claimContext?: string };
    const msgCount = Array.isArray(messages) ? messages.length : 0;
    console.log(`[chat] → request received | messages=${msgCount} claimContext=${claimContext ?? 'none'}`);

    type RawMsg = { role?: string; content?: string; parts?: unknown[] };
    const safeMessages = (Array.isArray(messages) ? messages : []).map((m) => {
      const msg = m as RawMsg;
      if (!Array.isArray(msg.parts)) {
        return { ...msg, parts: msg.content ? [{ type: 'text', text: msg.content }] : [] };
      }
      return msg;
    });

    const modelMessages = await convertToModelMessages(safeMessages as Parameters<typeof convertToModelMessages>[0]);
    console.log(`[chat] → calling Anthropic | model=claude-sonnet-4-6 steps≤10`);

    const result = streamText({
      model: anthropic('claude-sonnet-4-6'),
      system: buildSystemPrompt(claimContext),
      messages: modelMessages,
      tools: {
        listClaims: listClaimsTool,
        analyzeClaim: analyzeClaimTool,
        searchSimilarClaims: searchSimilarClaimsTool,
        draftCorrespondence: draftCorrespondenceTool,
        editClaim: editClaimTool,
      },
      stopWhen: stepCountIs(10),
      onChunk: ({ chunk }) => {
        if (chunk.type === 'tool-call') {
          console.log(`[chat]   tool_call: ${chunk.toolName}`);
        }
      },
      onFinish: ({ usage, steps }) => {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`[chat] ✓ done | steps=${steps.length} tokens_in=${usage.promptTokens} tokens_out=${usage.completionTokens} elapsed=${elapsed}s`);
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    console.error(`[chat] ✗ error after ${Date.now() - start}ms`, err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
