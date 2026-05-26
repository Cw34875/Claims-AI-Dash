import { useMemo, useState } from 'react';
import { getSortedClaims } from '../utils/claims';
import type { ClaimSessionState } from '../types';

export function useClaimsState() {
  // Sorted once on mount — stable for the session (claims are pre-loaded in main.tsx)
  const sortedClaims = useMemo(() => getSortedClaims(), []);

  const [sessionStates, setSessionStates] = useState<Record<string, ClaimSessionState>>({});

  function updateSessionState(claimId: string, update: Partial<ClaimSessionState>) {
    setSessionStates((prev) => ({
      ...prev,
      [claimId]: { ...prev[claimId], claimId, ...update },
    }));
  }

  function getSessionState(claimId: string): ClaimSessionState {
    return sessionStates[claimId] ?? { claimId };
  }

  return { sortedClaims, sessionStates, updateSessionState, getSessionState };
}
