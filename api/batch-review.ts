import { generateObject, zodSchema } from 'ai';
import { z } from 'zod';
import { createAnthropic } from '@ai-sdk/anthropic';
import { allClaims, condenseClaim, claimReviewSchema, REVIEW_SYSTEM, type EnrichedClaim } from './_lib/shared.js';

export const config = { runtime: 'edge' };

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: 'https://api.anthropic.com/v1',
});

export default async function handler(req: Request): Promise<Response> {
  try {
    const { claimIds } = await req.json() as { claimIds: string[] };
    const ids = (Array.isArray(claimIds) ? claimIds : []).slice(0, 10);
    const requested = ids.map((id) => allClaims.find((c) => c.claimId === id)).filter(Boolean) as EnrichedClaim[];

    if (requested.length === 0) return json({ error: 'No valid claims' }, 400);

    console.log(`[batch-review] → ${requested.length} claims`);
    const { object } = await generateObject({
      model: anthropic('claude-sonnet-4-6'),
      schema: zodSchema(z.object({ reviews: z.array(claimReviewSchema) })),
      system: REVIEW_SYSTEM,
      prompt: `Review these ${requested.length} claims and return one entry per claim. Value fields must contain ONLY raw values, never explanatory text:\n${JSON.stringify(requested.map(condenseClaim), null, 2)}`,
    });

    console.log(`[batch-review] ✓ ${object.reviews.length} reviews`);
    return json({ reviews: object.reviews });
  } catch (err) {
    console.error('[batch-review] ✗', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
