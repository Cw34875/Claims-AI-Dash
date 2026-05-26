import { generateObject, zodSchema } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { clusterAnalysisSchema, CLUSTER_SYSTEM } from './_lib/shared.js';

export const config = { runtime: 'edge' };

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: 'https://api.anthropic.com/v1',
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

export default async function handler(req: Request): Promise<Response> {
  try {
    const { cluster } = await req.json() as { cluster: ClusterSummary };
    if (!cluster?.clusterKey) return json({ error: 'Missing cluster summary' }, 400);
    if (cluster.claimCount < 2) return json({ error: 'Cluster too small to analyze' }, 400);

    console.log(`[analyze-cluster] → ${cluster.clusterKey}`);
    const { object } = await generateObject({
      model: anthropic('claude-sonnet-4-6'),
      schema: zodSchema(clusterAnalysisSchema),
      system: CLUSTER_SYSTEM,
      prompt: `Analyze this claim cluster and identify the root cause and batch action:\n\n${JSON.stringify(cluster, null, 2)}`,
    });

    const result = { ...object, clusterKey: cluster.clusterKey };
    console.log(`[analyze-cluster] ✓ ${cluster.clusterKey}`);
    return json(result);
  } catch (err) {
    console.error('[analyze-cluster] ✗', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
