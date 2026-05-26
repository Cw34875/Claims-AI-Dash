import { useEffect, useRef } from 'react';
import type { EnrichedClaim, AiProposal, ClaimSessionState } from '../types';
import { mapToProposal, type ClaimReview } from '../utils/proposals';

const BATCH_SIZE = 10;

export function useBatchProposals(
  claims: EnrichedClaim[],
  sessionStates: Record<string, ClaimSessionState>,
  onProposalGenerated: (claimId: string, proposal: AiProposal) => void,
) {
  const sessionStatesRef = useRef(sessionStates);
  sessionStatesRef.current = sessionStates;

  const onProposalRef = useRef(onProposalGenerated);
  onProposalRef.current = onProposalGenerated;

  const claimIdsKey = claims.map((c) => c.claimId).join(',');

  useEffect(() => {
    const toFetch = claims
      .filter((c) => !sessionStatesRef.current[c.claimId]?.aiProposal)
      .slice(0, BATCH_SIZE)
      .map((c) => c.claimId);

    if (toFetch.length === 0) return;

    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch('/api/batch-review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ claimIds: toFetch }),
        });

        if (!res.ok) throw new Error(`Batch review failed: ${res.status}`);

        const data: { reviews: ClaimReview[] } = await res.json();

        for (const review of data.reviews) {
          onProposalRef.current(review.claimId, mapToProposal(review));
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Batch review error:', err);
        }
      }
    })();

    return () => controller.abort();
  }, [claimIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
