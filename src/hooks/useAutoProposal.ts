import { useEffect, useRef, useState } from 'react';
import type { AiProposal, FieldEdit } from '../types';

interface ReviewResponse {
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

export function useAutoProposal(
  claimId: string | null,
  existingProposal: AiProposal | undefined,
  onProposalGenerated: (claimId: string, proposal: AiProposal) => void,
) {
  const [isLoading, setIsLoading] = useState(false);
  const activeClaimId = useRef<string | null>(null);

  useEffect(() => {
    if (!claimId || existingProposal) {
      setIsLoading(false);
      return;
    }

    activeClaimId.current = claimId;
    setIsLoading(true);

    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch('/api/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ claimId }),
        });

        if (!res.ok) throw new Error(`Review failed: ${res.status}`);

        const data: ReviewResponse = await res.json();

        if (activeClaimId.current !== claimId) return;

        const fieldEdits: FieldEdit[] = data.suggestions.map((s) => ({
          field: s.field,
          label: s.label,
          currentValue: s.currentValue,
          proposedValue: s.suggestedValue,
          rationale: s.rationale,
          confidence: s.confidence,
          status: 'pending',
        }));

        onProposalGenerated(claimId, {
          claimId,
          recommendedAction: data.recommendedAction,
          confidence: data.confidence,
          reasoning: data.summary,
          fieldEdits,
          draftText: '',
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') console.error('Auto-proposal error:', err);
      } finally {
        if (activeClaimId.current === claimId) setIsLoading(false);
      }
    })();

    return () => { controller.abort(); };
  }, [claimId, !!existingProposal]); // eslint-disable-line react-hooks/exhaustive-deps

  return { isLoading };
}
