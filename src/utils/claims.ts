import { enrichClaim } from './priority';
import type { EnrichedClaim } from '../types';

let _cached: EnrichedClaim[] | null = null;
let _promise: Promise<EnrichedClaim[]> | null = null;

export function preloadClaims(): Promise<EnrichedClaim[]> {
  if (_cached) return Promise.resolve(_cached);
  if (_promise) return _promise;
  _promise = fetch('/claims.json')
    .then((r) => r.json())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .then((raw: any[]) => {
      _cached = raw.map(enrichClaim);
      return _cached;
    });
  return _promise;
}

export function getAllClaims(): EnrichedClaim[] {
  if (!_cached) throw new Error('Claims not loaded — call preloadClaims() first');
  return _cached;
}

export function getClaimById(claimId: string): EnrichedClaim | undefined {
  return getAllClaims().find((c) => c.claimId === claimId);
}

export function getSortedClaims(): EnrichedClaim[] {
  return [...getAllClaims()].sort((a, b) => b.priorityScore - a.priorityScore);
}
