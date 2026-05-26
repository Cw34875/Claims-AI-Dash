import { useEffect, useRef, useState } from 'react';
import type { AiProposal } from '../types';
import { mapToProposal, type ClaimReview } from '../utils/proposals';

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

        const data: ClaimReview = await res.json();

        if (activeClaimId.current !== claimId) return;

        onProposalGenerated(claimId, mapToProposal(data));
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
