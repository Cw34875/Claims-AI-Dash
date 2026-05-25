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
      });
    }
    const cluster = map.get(key)!;
    cluster.claims.push(claim);
    cluster.totalRecoverability += claim.recoverability;
  }

  for (const cluster of map.values()) {
    cluster.claims.sort((a, b) => b.recoverability - a.recoverability);
  }

  return [...map.values()].sort((a, b) => b.totalRecoverability - a.totalRecoverability);
}
