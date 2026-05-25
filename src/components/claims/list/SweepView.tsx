import type { EnrichedClaim, ClaimSessionState } from '../../../types';
import { ClaimRow } from './ClaimRow';

interface Props {
  claims: EnrichedClaim[];
  sessionStates: Record<string, ClaimSessionState>;
  selectedClaimId: string | null;
  onSelect: (id: string) => void;
}

export function SweepView({ claims, sessionStates, selectedClaimId, onSelect }: Props) {
  if (claims.length === 0) {
    return <div className="p-8 text-center text-gray-500 text-sm">No claims match the current filters.</div>;
  }

  return (
    <div className="overflow-auto h-full">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
          <tr className="text-xs text-gray-500 uppercase tracking-wide">
            <th className="px-3 py-2 text-center w-12">PRI</th>
            <th className="px-3 py-2 text-left">CLAIM</th>
            <th className="px-3 py-2 text-left">PAYER</th>
            <th className="px-3 py-2 text-left">CODE</th>
            <th className="px-3 py-2 text-right">$</th>
            <th className="px-3 py-2 text-left">CPT</th>
            <th className="px-3 py-2 text-center">PRIORITY</th>
            <th className="px-3 py-2 text-center">AGE</th>
            <th className="px-3 py-2 text-center">DL</th>
            <th className="px-3 py-2 text-center">STATUS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {claims.map((claim, i) => (
            <ClaimRow
              key={claim.claimId}
              claim={claim}
              session={sessionStates[claim.claimId] ?? { claimId: claim.claimId }}
              isSelected={claim.claimId === selectedClaimId}
              onSelect={onSelect}
              rank={i + 1}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
