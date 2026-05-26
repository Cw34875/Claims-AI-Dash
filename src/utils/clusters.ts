import type { EnrichedClaim, Cluster } from '../types';

export function buildClusters(claims: EnrichedClaim[]): Cluster[] {
  const map = new Map<string, Cluster>();

  for (const claim of claims) {
    if (!claim.denialCode) continue;
    const key = `${claim.payerFamily} | ${claim.denialCode}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        payerFamily: claim.payerFamily,
        denialCode: claim.denialCode,
        claims: [],
        totalRecoverability: 0,
        avgRecoverability: 0,
        avgDeadlineDays: null,
        claimsOverdue: 0,
        claimsUrgent: 0,
        topCptCodes: [],
        submissionDateRange: null,
        sampleDenialReasons: [],
      });
    }
    const cluster = map.get(key)!;
    cluster.claims.push(claim);
    cluster.totalRecoverability += claim.recoverability;
  }

  for (const cluster of map.values()) {
    cluster.claims.sort((a, b) => b.recoverability - a.recoverability);

    const n = cluster.claims.length;
    cluster.avgRecoverability = cluster.totalRecoverability / n;

    // Deadline stats
    const deadlines = cluster.claims
      .map((c) => c.deadlineDays)
      .filter((d): d is number => d !== null);
    cluster.avgDeadlineDays =
      deadlines.length > 0
        ? Math.round(deadlines.reduce((s, d) => s + d, 0) / deadlines.length)
        : null;
    cluster.claimsOverdue = cluster.claims.filter(
      (c) => c.deadlineDays !== null && c.deadlineDays < 0
    ).length;
    cluster.claimsUrgent = cluster.claims.filter(
      (c) => c.deadlineDays !== null && c.deadlineDays >= 0 && c.deadlineDays <= 7
    ).length;

    // Top CPT codes by frequency
    const cptCount = new Map<string, number>();
    for (const claim of cluster.claims) {
      for (const li of claim.lineItems) {
        cptCount.set(li.cptCode, (cptCount.get(li.cptCode) ?? 0) + 1);
      }
    }
    cluster.topCptCodes = [...cptCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([code]) => code);

    // Submission date range
    const dates = cluster.claims
      .map((c) => c.dateSubmitted)
      .filter(Boolean)
      .sort();
    cluster.submissionDateRange =
      dates.length > 0
        ? { earliest: dates[0], latest: dates[dates.length - 1] }
        : null;

    // Sample denial reasons (unique, up to 5)
    cluster.sampleDenialReasons = [
      ...new Set(
        cluster.claims.map((c) => c.denialReason).filter((r): r is string => Boolean(r))
      ),
    ].slice(0, 5);
  }

  return [...map.values()].sort((a, b) => b.totalRecoverability - a.totalRecoverability);
}
