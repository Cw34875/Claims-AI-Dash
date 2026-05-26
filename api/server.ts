import express from 'express';
import cors from 'cors';
import { streamText, convertToModelMessages, stepCountIs, generateObject, zodSchema } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import 'dotenv/config';
import serverless from 'serverless-http';
import {
  allClaims,
  buildSystemPrompt,
  listClaimsTool,
  analyzeClaimTool,
  searchSimilarClaimsTool,
  draftCorrespondenceTool,
  editClaimTool,
  condenseClaim,
  claimReviewSchema,
  lineItemCorrectionSchema,
  REVIEW_SYSTEM,
  clusterAnalysisSchema,
  CLUSTER_SYSTEM,
  type EnrichedClaim,
} from './_lib/shared.js';

const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = createAnthropic({ apiKey, baseURL: 'https://api.anthropic.com/v1' });

// ── 24-hour in-memory cache ────────────────────────────────────────────────
// Key format: `<prefix>::<id>::<YYYY-MM-DD>` — date component means entries
// go stale at midnight without any cleanup needed.
const aiCache = new Map<string, unknown>();

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function cacheKey(prefix: string, id: string): string {
  return `${prefix}::${id}::${todayStr()}`;
}

function cacheGet<T>(key: string): T | null {
  return (aiCache.get(key) as T | undefined) ?? null;
}

function cacheSet(key: string, value: unknown): void {
  aiCache.set(key, value);
}

// ── Express app ────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// Local dev only — on Vercel, /api/chat is served by api/chat.ts (Edge).
app.post('/api/chat', async (req, res) => {
  const start = Date.now();
  try {
    const { messages, claimContext } = req.body as { messages: unknown[]; claimContext?: string };
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

    result.pipeUIMessageStreamToResponse(res);
  } catch (err) {
    console.error(`[chat] ✗ error after ${Date.now() - start}ms`, err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.post('/api/review', async (req, res) => {
  try {
    const { claimId } = req.body as { claimId: string };
    const claim = allClaims.find((c) => c.claimId === claimId);
    if (!claim) return res.status(404).json({ error: `Claim ${claimId} not found` });

    const key = cacheKey('review', claimId);
    const cached = cacheGet<unknown>(key);
    if (cached) {
      console.log(`[cache hit] review ${claimId}`);
      return res.json(cached);
    }

    const { object } = await generateObject({
      model: anthropic('claude-sonnet-4-6'),
      schema: zodSchema(claimReviewSchema),
      system: REVIEW_SYSTEM,
      prompt: `Review this claim and output strictly typed corrections. Remember: value fields must contain ONLY raw values, never explanatory text.\n\n${JSON.stringify(condenseClaim(claim), null, 2)}`,
    });

    cacheSet(key, object);
    res.json(object);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/batch-review', async (req, res) => {
  try {
    const { claimIds } = req.body as { claimIds: string[] };
    const ids = (Array.isArray(claimIds) ? claimIds : []).slice(0, 10);
    const allRequested = ids.map((id) => allClaims.find((c) => c.claimId === id)).filter(Boolean) as EnrichedClaim[];
    if (allRequested.length === 0) return res.status(400).json({ error: 'No valid claims' });

    const cachedReviews: unknown[] = [];
    const uncachedClaims: EnrichedClaim[] = [];

    for (const claim of allRequested) {
      const key = cacheKey('review', claim.claimId);
      const hit = cacheGet<unknown>(key);
      if (hit) {
        console.log(`[cache hit] batch-review ${claim.claimId}`);
        cachedReviews.push(hit);
      } else {
        uncachedClaims.push(claim);
      }
    }

    let freshReviews: unknown[] = [];
    if (uncachedClaims.length > 0) {
      const { object } = await generateObject({
        model: anthropic('claude-sonnet-4-6'),
        schema: zodSchema(z.object({ reviews: z.array(claimReviewSchema) })),
        system: REVIEW_SYSTEM,
        prompt: `Review these ${uncachedClaims.length} claims and return one entry per claim. Value fields must contain ONLY raw values, never explanatory text:\n${JSON.stringify(uncachedClaims.map(condenseClaim), null, 2)}`,
      });

      for (const review of object.reviews) {
        const key = cacheKey('review', (review as { claimId: string }).claimId);
        cacheSet(key, review);
      }
      freshReviews = object.reviews;
    }

    res.json({ reviews: [...cachedReviews, ...freshReviews] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

interface ClusterSummary {
  clusterKey: string;
  payerFamily: string;
  denialCode: string;
  claimCount: number;
  totalRecoverability: number;
  avgRecoverability: number;
  avgDeadlineDays: number | null;
  claimsOverdue: number;
  claimsUrgent: number;
  topCptCodes: string[];
  submissionDateRange: { earliest: string; latest: string } | null;
  sampleDenialReasons: string[];
}

app.post('/api/analyze-cluster', async (req, res) => {
  try {
    const { cluster } = req.body as { cluster: ClusterSummary };
    if (!cluster?.clusterKey) return res.status(400).json({ error: 'Missing cluster summary' });
    if (cluster.claimCount < 2) return res.status(400).json({ error: 'Cluster too small to analyze' });

    const key = cacheKey('cluster', cluster.clusterKey);
    const cached = cacheGet<object>(key);
    if (cached) {
      console.log(`[cache hit] cluster ${cluster.clusterKey}`);
      return res.json({ ...cached, fromCache: true });
    }

    const { object } = await generateObject({
      model: anthropic('claude-sonnet-4-6'),
      schema: zodSchema(clusterAnalysisSchema),
      system: CLUSTER_SYSTEM,
      prompt: `Analyze this claim cluster and identify the root cause and batch action:\n\n${JSON.stringify(cluster, null, 2)}`,
    });

    const result = {
      ...object,
      clusterKey: cluster.clusterKey,
      cachedAt: new Date().toISOString(),
    };
    cacheSet(key, result);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3001;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`Dev server running on :${PORT}`));
}

export default serverless(app);
