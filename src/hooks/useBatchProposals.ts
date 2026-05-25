import { useEffect, useRef } from 'react';
import type { EnrichedClaim, AiProposal, ClaimSessionState, FieldEdit } from '../types';

interface ClaimReview {
  claimId: string;
  summary: string;
  recommendedAction: string;
  confidence: 'high' | 'medium' | 'low';
  suggestions: Array<{
    field: string;
    label: string;
    currentValue: string;
    suggestedValue: string;
    rationale: string;
    confidence: 'high' | 'medium' | 'low';
  }>;
}

function mapToProposal(review: ClaimReview): AiProposal {
  const fieldEdits: FieldEdit[] = review.suggestions.map((s) => ({
    field: s.field,
    label: s.label,
    currentValue: s.currentValue,
    proposedValue: s.suggestedValue,
    rationale: s.rationale,
    confidence: s.confidence,
    status: 'pending',
  }));
  return {
    claimId: review.claimId,
    recommendedAction: review.recommendedAction,
    confidence: review.confidence,
    reasoning: review.summary,
    fieldEdits,
    draftText: '',
  };
}

const BATCH_SIZE = 10;

export function useBatchProposals(
  claims: EnrichedClaim[],
  sessionStates: Record<string, ClaimSessionState>,
  onProposalGenerated: (claimId: string, proposal: AiProposal) => void,
) {
  // Use refs so the effect closure always reads the latest values without
  // those values becoming effect dependencies (which would cause re-fetching
  // every time a proposal arrives).
  const sessionStatesRef = useRef(sessionStates);
  sessionStatesRef.current = sessionStates;

  const onProposalRef = useRef(onProposalGenerated);
  onProposalRef.current = onProposalGenerated;

  // Key on the ordered claim ID list — changes when filter/status tab changes.
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
