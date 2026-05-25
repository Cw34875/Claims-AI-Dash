import { useState } from 'react';
import type { Cluster, ClaimSessionState } from '../../../types';
import { ClaimRow } from './ClaimRow';

interface Props {
  cluster: Cluster;
  sessionStates: Record<string, ClaimSessionState>;
  selectedClaimId: string | null;
  onSelect: (id: string) => void;
  startRank: number;
}

function fmt$(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
}

export function ClusterGroup({ cluster, sessionStates, selectedClaimId, onSelect, startRank }: Props) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border border-gray-200 rounded-lg mb-3 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-3">
          <span className={`text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
          <span className="font-semibold text-sm text-gray-800">{cluster.payerFamily}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">
            {cluster.denialCode}
          </span>
          <span className="text-xs text-gray-500">{cluster.claims.length} claim{cluster.claims.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-gray-900">{fmt$(cluster.totalRecoverability)}</span>
          <button
            className="text-xs px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
            onClick={(e) => { e.stopPropagation(); alert('Batch analysis coming soon'); }}
          >
            BATCH
          </button>
        </div>
      </button>
      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wide bg-white border-b border-gray-100">
                <th className="px-3 py-1.5 text-center w-12">PRI</th>
                <th className="px-3 py-1.5 text-left">CLAIM</th>
                <th className="px-3 py-1.5 text-left">PAYER · CODE</th>
                <th className="px-3 py-1.5 text-right">$</th>
                <th className="px-3 py-1.5 text-left">CPT</th>
                <th className="px-3 py-1.5 text-left">AI SAYS</th>
                <th className="px-3 py-1.5 text-center">AGE</th>
                <th className="px-3 py-1.5 text-center">DL</th>
                <th className="px-3 py-1.5 text-center">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cluster.claims.map((claim, i) => (
                <ClaimRow
                  key={claim.claimId}
                  claim={claim}
                  session={sessionStates[claim.claimId] ?? { claimId: claim.claimId }}
                  isSelected={claim.claimId === selectedClaimId}
                  onSelect={onSelect}
                  rank={startRank + i}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
