import { generateObject, zodSchema } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { allClaims, condenseClaim, claimReviewSchema, REVIEW_SYSTEM } from './_lib/shared.js';

export const config = { runtime: 'edge' };

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: 'https://api.anthropic.com/v1',
});

export default async function handler(req: Request): Promise<Response> {
  try {
    const { claimId } = await req.json() as { claimId: string };
    const claim = allClaims.find((c) => c.claimId === claimId);
    if (!claim) {
      return json({ error: `Claim ${claimId} not found` }, 404);
    }

    console.log(`[review] → ${claimId}`);
    const { object } = await generateObject({
      model: anthropic('claude-sonnet-4-6'),
      schema: zodSchema(claimReviewSchema),
      system: REVIEW_SYSTEM,
      prompt: `Review this claim and output strictly typed corrections. Value fields must contain ONLY raw values, never explanatory text.\n\n${JSON.stringify(condenseClaim(claim), null, 2)}`,
    });

    console.log(`[review] ✓ ${claimId}`);
    return json(object);
  } catch (err) {
    console.error('[review] ✗', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
