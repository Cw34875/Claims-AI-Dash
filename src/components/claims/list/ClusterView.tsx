import { useMemo } from 'react';
import type { EnrichedClaim, ClaimSessionState } from '../../../types';
import { buildClusters } from '../../../utils/clusters';
import { ClusterGroup } from './ClusterGroup';

interface Props {
  claims: EnrichedClaim[];
  sessionStates: Record<string, ClaimSessionState>;
  selectedClaimId: string | null;
  onSelect: (id: string) => void;
}

export function ClusterView({ claims, sessionStates, selectedClaimId, onSelect }: Props) {
  const clusters = useMemo(() => buildClusters(claims), [claims]);

  const unclustered = claims.filter((c) => !c.denialCode);

  if (clusters.length === 0 && unclustered.length === 0) {
    return <div className="p-8 text-center text-gray-500 text-sm">No claims match the current filters.</div>;
  }

  let rank = 1;

  return (
    <div className="overflow-auto h-full p-3">
      {clusters.map((cluster) => {
        const startRank = rank;
        rank += cluster.claims.length;
        return (
          <ClusterGroup
            key={cluster.key}
            cluster={cluster}
            sessionStates={sessionStates}
            selectedClaimId={selectedClaimId}
            onSelect={onSelect}
            startRank={startRank}
          />
        );
      })}
      {unclustered.length > 0 && (
        <div className="text-xs text-gray-500 mt-2 px-2">
          {unclustered.length} claim{unclustered.length !== 1 ? 's' : ''} without denial codes (pending)
        </div>
      )}
    </div>
  );
}
