import type { EnrichedClaim } from '../../../types';
import { DeadlineBadge } from '../list/DeadlineBadge';

interface Props {
  claim: EnrichedClaim;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

function fmt$(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_COLORS: Record<string, string> = {
  denied: 'bg-red-100 text-red-700',
  rejected: 'bg-orange-100 text-orange-700',
  underpaid: 'bg-yellow-100 text-yellow-700',
  pending: 'bg-blue-100 text-blue-700',
};

export function DetailHeader({ claim, hasPrev, hasNext, onPrev, onNext, onClose }: Props) {
  return (
    <div className="border-b border-gray-200 px-4 py-3 bg-white">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded" title="Close">
            ✕
          </button>
          <span className="font-mono font-bold text-gray-900">{claim.claimId}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[claim.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {claim.status.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onPrev}
            disabled={!hasPrev}
            className="px-2 py-1 text-xs border rounded hover:bg-gray-50 disabled:opacity-30"
          >
            ← Prev
          </button>
          <button
            onClick={onNext}
            disabled={!hasNext}
            className="px-2 py-1 text-xs border rounded hover:bg-gray-50 disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
        <div><span className="text-gray-400">Patient:</span> {claim.patient.name}</div>
        <div><span className="text-gray-400">Payer:</span> {claim.payer.name}</div>
        <div><span className="text-gray-400">Provider:</span> {claim.provider.name}</div>
        <div><span className="text-gray-400">DOS:</span> {claim.dateOfService}</div>
        <div><span className="text-gray-400">Billed:</span> <span className="font-semibold text-gray-800">{fmt$(claim.totalBilledAmount)}</span></div>
        <div className="flex items-center gap-1.5">
          <span className="text-gray-400">Deadline:</span>
          <DeadlineBadge deadlineDays={claim.deadlineDays} />
          {claim.filingDeadline && <span className="text-gray-400">({claim.filingDeadline})</span>}
        </div>
      </div>
    </div>
  );
}
