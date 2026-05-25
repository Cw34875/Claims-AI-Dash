import { useState } from 'react';
import type { EnrichedClaim } from '../types';

export function useClaimDetail(visibleClaims: EnrichedClaim[]) {
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);

  const selectedClaim = selectedClaimId ? visibleClaims.find((c) => c.claimId === selectedClaimId) ?? null : null;
  const selectedIndex = selectedClaim ? visibleClaims.indexOf(selectedClaim) : -1;

  const prevClaim = selectedIndex > 0 ? visibleClaims[selectedIndex - 1] : null;
  const nextClaim = selectedIndex >= 0 && selectedIndex < visibleClaims.length - 1 ? visibleClaims[selectedIndex + 1] : null;

  function selectClaim(claimId: string | null) {
    setSelectedClaimId(claimId);
  }

  function goToPrev() {
    if (prevClaim) setSelectedClaimId(prevClaim.claimId);
  }

  function goToNext() {
    if (nextClaim) setSelectedClaimId(nextClaim.claimId);
  }

  return { selectedClaimId, selectedClaim, prevClaim, nextClaim, selectClaim, goToPrev, goToNext };
}
