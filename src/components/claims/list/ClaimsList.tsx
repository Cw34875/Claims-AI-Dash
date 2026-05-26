import type { EnrichedClaim, ClaimSessionState, AiProposal, ViewMode } from '../../../types';
import { SweepView } from './SweepView';
import { ClusterView } from './ClusterView';

interface Props {
  claims: EnrichedClaim[];
  sessionStates: Record<string, ClaimSessionState>;
  selectedClaimId: string | null;
  onSelect: (id: string) => void;
  onProposalGenerated: (claimId: string, proposal: AiProposal) => void;
  onBatchApply: (updates: { claimId: string; proposal: AiProposal }[]) => void;
  viewMode: ViewMode;
}

export function ClaimsList({ claims, sessionStates, selectedClaimId, onSelect, onProposalGenerated, onBatchApply, viewMode }: Props) {
  if (viewMode === 'cluster') {
    return (
      <ClusterView
        claims={claims}
        sessionStates={sessionStates}
        selectedClaimId={selectedClaimId}
        onSelect={onSelect}
        onProposalGenerated={onProposalGenerated}
        onBatchApply={onBatchApply}
      />
    );
  }
  return <SweepView claims={claims} sessionStates={sessionStates} selectedClaimId={selectedClaimId} onSelect={onSelect} />;
}
