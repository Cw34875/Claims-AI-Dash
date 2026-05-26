import { useState, useCallback } from 'react';
import type { Cluster, ClaimSessionState, AiProposal } from '../types';
import { mapToProposal, type ClaimReview } from '../utils/proposals';

const CHUNK_SIZE = 10;

interface Progress {
  done: number;
  total: number;
}

/**
 * Fetches AI proposals for every claim in a cluster, in chunks of 10.
 * Results are written back to the central session state via onProposalGenerated
 * so they're available for individual claim review too (and hit the server cache).
 *
 * Call `fetchAll()` when the user opens the batch review panel.
 */
export function useBatchCluster(
  cluster: Cluster,
  sessionStates: Record<string, ClaimSessionState>,
  onProposalGenerated: (claimId: string, proposal: AiProposal) => void,
) {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<Progress>({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  // Merge proposals already in session state with any just-fetched ones.
  // This is a derived value — no extra state needed.
  function getProposals(): Record<string, AiProposal> {
    const result: Record<string, AiProposal> = {};
    for (const claim of cluster.claims) {
      const p = sessionStates[claim.claimId]?.aiProposal;
      if (p) result[claim.claimId] = p;
    }
    return result;
  }

  const fetchAll = useCallback(async () => {
    const alreadyHave = new Set(
      cluster.claims
        .filter((c) => sessionStates[c.claimId]?.aiProposal)
        .map((c) => c.claimId),
    );
    const toFetch = cluster.claims.filter((c) => !alreadyHave.has(c.claimId));

    if (toFetch.length === 0) return; // everything already cached in session

    setIsLoading(true);
    setError(null);
    setProgress({ done: 0, total: toFetch.length });

    try {
      for (let i = 0; i < toFetch.length; i += CHUNK_SIZE) {
        const chunk = toFetch.slice(i, i + CHUNK_SIZE);
        const res = await fetch('/api/batch-review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ claimIds: chunk.map((c) => c.claimId) }),
        });

        if (!res.ok) throw new Error(`Server error ${res.status}`);

        const data: { reviews: ClaimReview[] } = await res.json();
        for (const review of data.reviews) {
          const proposal = mapToProposal(review);
          onProposalGenerated(proposal.claimId, proposal);
        }

        setProgress((prev) => ({
          done: Math.min(prev.done + chunk.length, toFetch.length),
          total: toFetch.length,
        }));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cluster.key, cluster.claims.length]);

  return { getProposals, isLoading, progress, error, fetchAll };
}
