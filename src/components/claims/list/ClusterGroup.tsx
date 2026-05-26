import { useState } from 'react';
import type { Cluster, ClaimSessionState, AiProposal } from '../../../types';
import { ClaimRow } from './ClaimRow';
import { useClusterAnalysis } from '../../../hooks/useClusterAnalysis';
import { BatchReviewPanel } from './BatchReviewPanel';

interface Props {
  cluster: Cluster;
  sessionStates: Record<string, ClaimSessionState>;
  selectedClaimId: string | null;
  onSelect: (id: string) => void;
  onProposalGenerated: (claimId: string, proposal: AiProposal) => void;
  onBatchApply: (updates: { claimId: string; proposal: AiProposal }[]) => void;
}

function fmt$(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
}

const CONFIDENCE_STYLE = {
  high:   'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low:    'bg-gray-100 text-gray-500',
};

export function ClusterGroup({ cluster, sessionStates, selectedClaimId, onSelect, onProposalGenerated, onBatchApply }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [batchOpen, setBatchOpen] = useState(false);
  const { analysis, isLoading } = useClusterAnalysis(cluster);

  const showAnalysis = cluster.claims.length >= 2;

  return (
    <>
      <div className="border border-gray-200 rounded-lg mb-3 overflow-hidden">
        {/* ── Cluster header ── */}
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
            <span className="text-xs text-gray-500">
              {cluster.claims.length} claim{cluster.claims.length !== 1 ? 's' : ''}
            </span>
            {cluster.claimsOverdue > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
                {cluster.claimsOverdue} overdue
              </span>
            )}
            {cluster.claimsUrgent > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 font-medium">
                {cluster.claimsUrgent} urgent
              </span>
            )}
          </div>
          <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <span className="text-sm font-bold text-gray-900">{fmt$(cluster.totalRecoverability)}</span>
            {cluster.topCptCodes.length > 0 && (
              <span className="text-xs text-gray-400 font-mono hidden sm:block">
                {cluster.topCptCodes.slice(0, 2).join(' · ')}
              </span>
            )}
            {/* Batch Apply button — enabled once analysis is loaded */}
            <button
              onClick={() => setBatchOpen(true)}
              disabled={cluster.claims.length < 2}
              className="text-xs px-2.5 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium"
              title={cluster.claims.length < 2 ? 'Need at least 2 claims' : 'Review and batch-apply AI edits'}
            >
              Batch Apply
            </button>
          </div>
        </button>

        {/* ── AI insight card ── */}
        {showAnalysis && (
          <div className="border-t border-gray-100 bg-indigo-50/40 px-4 py-2.5">
            {isLoading && !analysis && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <svg className="w-3 h-3 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Analyzing pattern…
              </div>
            )}

            {analysis && (
              <div className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide mt-0.5 ${CONFIDENCE_STYLE[analysis.confidence]}`}>
                    {analysis.confidence}
                  </span>
                  <p className="text-xs text-gray-700 leading-snug">
                    <span className="font-semibold text-gray-900">Root cause: </span>
                    {analysis.rootCause}
                  </p>
                </div>
                <div className="flex items-start gap-2 pl-[3.25rem]">
                  <span className="text-xs text-indigo-500">→</span>
                  <p className="text-xs text-indigo-800 leading-snug">
                    <span className="font-semibold">Batch action: </span>
                    {analysis.batchAction}
                  </p>
                </div>
                <div className="flex items-center gap-3 pl-[3.25rem] pt-0.5">
                  {analysis.affectsAllClaims ? (
                    <span className="text-xs text-green-600 font-medium">✓ Applies to all {cluster.claims.length} claims</span>
                  ) : (
                    <span className="text-xs text-amber-600 font-medium">⚠ Individual review still needed</span>
                  )}
                  {analysis.fromCache && (
                    <span className="text-xs text-gray-400" title={`Cached at ${new Date(analysis.cachedAt).toLocaleTimeString()}`}>
                      · cached
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Claims table ── */}
        {expanded && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wide bg-white border-b border-gray-100">
                  <th className="px-3 py-1.5 text-left">CLAIM</th>
                  <th className="px-3 py-1.5 text-left">PAYER</th>
                  <th className="px-3 py-1.5 text-left">CODE</th>
                  <th className="px-3 py-1.5 text-right">BILLED</th>
                  <th className="px-3 py-1.5 text-right">ALLOWED</th>
                  <th className="px-3 py-1.5 text-right">PAID</th>
                  <th className="px-3 py-1.5 text-center">PRIORITY</th>
                  <th className="px-3 py-1.5 text-center">AGE</th>
                  <th className="px-3 py-1.5 text-center">DL</th>
                  <th className="px-3 py-1.5 text-center">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {cluster.claims.map((claim) => (
                  <ClaimRow
                    key={claim.claimId}
                    claim={claim}
                    session={sessionStates[claim.claimId] ?? { claimId: claim.claimId }}
                    isSelected={claim.claimId === selectedClaimId}
                    onSelect={onSelect}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Batch review modal ── */}
      {batchOpen && (
        <BatchReviewPanel
          cluster={cluster}
          analysis={analysis}
          sessionStates={sessionStates}
          onProposalGenerated={onProposalGenerated}
          onApply={onBatchApply}
          onClose={() => setBatchOpen(false)}
        />
      )}
    </>
  );
}
