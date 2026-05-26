import { useState, useEffect } from 'react';
import type { Cluster, ClusterAnalysis } from '../types';

/**
 * Auto-fetches a cluster-level AI analysis when mounted.
 * The server caches results for the calendar day, so repeat calls are free.
 * Skips clusters with fewer than 2 claims — not enough signal.
 */
export function useClusterAnalysis(cluster: Cluster) {
  const [analysis, setAnalysis] = useState<ClusterAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cluster.claims.length < 2) return;

    setIsLoading(true);
    setError(null);

    const controller = new AbortController();

    // Send only the compact summary — not the full claim objects.
    // ~400 tokens vs ~40k tokens for the full cluster.
    const summary = {
      clusterKey: cluster.key,
      payerFamily: cluster.payerFamily,
      denialCode: cluster.denialCode,
      claimCount: cluster.claims.length,
      totalRecoverability: cluster.totalRecoverability,
      avgRecoverability: Math.round(cluster.avgRecoverability),
      avgDeadlineDays: cluster.avgDeadlineDays,
      claimsOverdue: cluster.claimsOverdue,
      claimsUrgent: cluster.claimsUrgent,
      topCptCodes: cluster.topCptCodes,
      submissionDateRange: cluster.submissionDateRange,
      sampleDenialReasons: cluster.sampleDenialReasons,
    };

    fetch('/api/analyze-cluster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ cluster: summary }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        return res.json() as Promise<ClusterAnalysis>;
      })
      .then((data) => {
        setAnalysis(data);
        setIsLoading(false);
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          setError(err.message);
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [cluster.key]); // re-run only if the cluster identity changes

  return { analysis, isLoading, error };
}
