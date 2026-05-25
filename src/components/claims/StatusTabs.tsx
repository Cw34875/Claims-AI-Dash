import type { EnrichedClaim, ClaimSessionState } from '../../types';

type Status = 'denied' | 'rejected' | 'underpaid' | 'pending';
export type StatusFilterValue = Status | 'all' | 'skipped';

interface Props {
  allClaims: EnrichedClaim[];
  sessionStates: Record<string, ClaimSessionState>;
  activeStatus: StatusFilterValue;
  onStatusChange: (status: StatusFilterValue) => void;
}

function fmt$(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n.toFixed(0)}`;
}

const STATUS_CONFIG: { status: StatusFilterValue; label: string; activeClass: string }[] = [
  { status: 'all', label: 'All', activeClass: 'border-gray-600 text-gray-900' },
  { status: 'denied', label: 'Denied', activeClass: 'border-red-500 text-red-700' },
  { status: 'rejected', label: 'Rejected', activeClass: 'border-orange-500 text-orange-700' },
  { status: 'underpaid', label: 'Underpaid', activeClass: 'border-yellow-500 text-yellow-700' },
  { status: 'pending', label: 'Pending', activeClass: 'border-blue-500 text-blue-700' },
  { status: 'skipped', label: 'Skipped', activeClass: 'border-gray-400 text-gray-600' },
];

export function StatusTabs({ allClaims, sessionStates, activeStatus, onStatusChange }: Props) {
  function getStats(status: StatusFilterValue) {
    const filtered = status === 'all'
      ? allClaims
      : status === 'skipped'
        ? allClaims.filter((c) => sessionStates[c.claimId]?.action === 'skipped')
        : allClaims.filter((c) => c.status === status);
    const total = filtered.reduce((s, c) => s + c.recoverability, 0);
    return { count: filtered.length, total };
  }

  return (
    <div className="flex border-b border-gray-200 bg-white px-3 overflow-x-auto shrink-0">
      {STATUS_CONFIG.map(({ status, label, activeClass }) => {
        const { count, total } = getStats(status);
        const isActive = activeStatus === status;
        return (
          <button
            key={status}
            onClick={() => onStatusChange(status)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs border-b-2 whitespace-nowrap transition-colors ${
              isActive ? `${activeClass} bg-gray-50` : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="font-semibold">{label}</span>
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${isActive ? 'bg-gray-200' : 'bg-gray-100'}`}>
              {count}
            </span>
            {count > 0 && status !== 'all' && (
              <span className="text-gray-400">· {fmt$(total)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
