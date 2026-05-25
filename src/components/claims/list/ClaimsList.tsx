import type { EnrichedClaim, ClaimSessionState, ViewMode } from '../../../types';
import { SweepView } from './SweepView';
import { ClusterView } from './ClusterView';

interface Props {
  claims: EnrichedClaim[];
  sessionStates: Record<string, ClaimSessionState>;
  selectedClaimId: string | null;
  onSelect: (id: string) => void;
  viewMode: ViewMode;
}

export function ClaimsList({ claims, sessionStates, selectedClaimId, onSelect, viewMode }: Props) {
  if (viewMode === 'cluster') {
    return <ClusterView claims={claims} sessionStates={sessionStates} selectedClaimId={selectedClaimId} onSelect={onSelect} />;
  }
  return <SweepView claims={claims} sessionStates={sessionStates} selectedClaimId={selectedClaimId} onSelect={onSelect} />;
}
