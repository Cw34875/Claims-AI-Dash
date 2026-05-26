import { useState, useEffect, useMemo } from 'react';
import type { Cluster, ClusterAnalysis, AiProposal, ClaimSessionState } from '../../../types';
import { useBatchCluster } from '../../../hooks/useBatchCluster';

interface Props {
  cluster: Cluster;
  analysis: ClusterAnalysis | null;
  sessionStates: Record<string, ClaimSessionState>;
  onProposalGenerated: (claimId: string, proposal: AiProposal) => void;
  onApply: (updates: { claimId: string; proposal: AiProposal }[]) => void;
  onClose: () => void;
}

const CONFIDENCE_BADGE: Record<string, string> = {
  high:   'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low:    'bg-gray-100 text-gray-600',
};

function fmt$(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
}

export function BatchReviewPanel({ cluster, analysis, sessionStates, onProposalGenerated, onApply, onClose }: Props) {
  const { getProposals, isLoading, progress, error, fetchAll } = useBatchCluster(
    cluster, sessionStates, onProposalGenerated,
  );

  // Kick off proposal loading when panel opens
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const proposals = getProposals();

  // Default-select all claims that have proposals loaded
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Auto-select newly loaded proposals
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of Object.keys(proposals)) next.add(id);
      return next;
    });
  }, [Object.keys(proposals).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const readyIds = Object.keys(proposals);
  const allSelected = readyIds.length > 0 && readyIds.every((id) => selected.has(id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(readyIds));
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Detect whether selected claims share the same recommended action
  const actionGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const [id, p] of Object.entries(proposals)) {
      const action = p.recommendedAction;
      if (!groups.has(action)) groups.set(action, []);
      groups.get(action)!.push(id);
    }
    return groups;
  }, [proposals]);

  const dominantAction = [...actionGroups.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const allSameAction = actionGroups.size === 1;

  function handleApply() {
    const updates = [...selected]
      .filter((id) => proposals[id])
      .map((id) => ({
        claimId: id,
        proposal: {
          ...proposals[id],
          // Accept all edits on batch apply
          fieldEdits: proposals[id].fieldEdits.map((e) => ({ ...e, status: 'accepted' as const })),
        },
      }));
    onApply(updates);
    onClose();
  }

  const selectedCount = [...selected].filter((id) => proposals[id]).length;
  const totalRecovery = [...selected]
    .filter((id) => proposals[id])
    .reduce((s, id) => {
      const claim = cluster.claims.find((c) => c.claimId === id);
      return s + (claim?.recoverability ?? 0);
    }, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-[780px] max-w-[95vw] max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900">Batch Apply</span>
            <span className="text-gray-400">—</span>
            <span className="font-semibold text-gray-700">{cluster.payerFamily}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">
              {cluster.denialCode}
            </span>
            <span className="text-xs text-gray-500">{cluster.claims.length} claims</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        {/* AI insight */}
        {analysis && (
          <div className="px-5 py-3 bg-indigo-50/60 border-b border-indigo-100 space-y-1">
            <p className="text-xs text-gray-700">
              <span className="font-semibold text-gray-900">Root cause: </span>
              {analysis.rootCause}
            </p>
            <p className="text-xs text-indigo-800">
              <span className="text-indigo-400 mr-1">→</span>
              <span className="font-semibold">Batch action: </span>
              {analysis.batchAction}
            </p>
          </div>
        )}

        {/* Action grouping callout */}
        {readyIds.length > 1 && (
          <div className={`px-5 py-2 text-xs border-b ${allSameAction ? 'bg-green-50 text-green-700 border-green-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
            {allSameAction ? (
              <>✓ All {readyIds.length} loaded claims share the same recommended action: <strong>{dominantAction?.[0]}</strong></>
            ) : (
              <>⚠ Claims have {actionGroups.size} different recommended actions — review individually before applying</>
            )}
          </div>
        )}

        {/* Progress bar (while loading) */}
        {isLoading && (
          <div className="px-5 py-2 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Loading proposals…</span>
              <span>{progress.done} / {progress.total}</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : '0%' }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="px-5 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100">
            Error loading proposals: {error}
          </div>
        )}

        {/* Select-all row */}
        <div className="px-5 py-2 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-700">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              disabled={readyIds.length === 0}
              className="rounded text-indigo-600"
            />
            Select all ready ({readyIds.length} of {cluster.claims.length})
          </label>
        </div>

        {/* Claims table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
              <tr className="text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2 w-8" />
                <th className="px-3 py-2 text-left">Claim</th>
                <th className="px-3 py-2 text-left">Patient</th>
                <th className="px-3 py-2 text-left">Recommended Action</th>
                <th className="px-3 py-2 text-center">Edits</th>
                <th className="px-3 py-2 text-center">Conf.</th>
                <th className="px-3 py-2 text-right">At Stake</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cluster.claims.map((claim) => {
                const proposal = proposals[claim.claimId];
                const isReady = !!proposal;
                const isChecked = selected.has(claim.claimId);

                return (
                  <tr
                    key={claim.claimId}
                    className={`text-sm transition-colors ${isChecked && isReady ? 'bg-indigo-50/40' : 'bg-white'} ${isReady ? 'hover:bg-gray-50' : ''}`}
                  >
                    <td className="px-4 py-2.5 text-center">
                      {isReady ? (
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggle(claim.claimId)}
                          className="rounded text-indigo-600"
                        />
                      ) : (
                        <svg className="w-3.5 h-3.5 mx-auto animate-spin text-gray-300" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{claim.claimId}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-700">{claim.patient.name}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-800">
                      {isReady ? (
                        proposal.recommendedAction
                      ) : (
                        <span className="text-gray-300 italic">Loading…</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {isReady ? (
                        <span className="text-xs font-medium text-gray-600">{proposal.fieldEdits.length}</span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {isReady ? (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${CONFIDENCE_BADGE[proposal.confidence]}`}>
                          {proposal.confidence}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-medium text-gray-700">
                      {fmt$(claim.recoverability)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-200 bg-gray-50">
          <div className="text-xs text-gray-500">
            {selectedCount > 0
              ? <><span className="font-semibold text-gray-800">{selectedCount}</span> claim{selectedCount !== 1 ? 's' : ''} selected · <span className="font-semibold text-gray-800">{fmt$(totalRecovery)}</span> at stake</>
              : 'No claims selected'
            }
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={selectedCount === 0}
              className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Apply {selectedCount > 0 ? selectedCount : ''} Selected →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
