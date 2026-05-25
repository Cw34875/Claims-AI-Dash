import type { EnrichedClaim } from '../../types';

interface Props {
  claims: EnrichedClaim[];
}

export function UrgentBanner({ claims }: Props) {
  const urgent = claims.filter((c) => c.deadlineDays !== null && c.deadlineDays >= 0 && c.deadlineDays <= 7);
  const overdue = claims.filter((c) => c.deadlineDays !== null && c.deadlineDays < 0);

  if (urgent.length === 0 && overdue.length === 0) return null;

  return (
    <div className="bg-red-50 border-b border-red-200 px-3 py-2 flex items-center gap-2 text-xs text-red-700 shrink-0">
      <span className="text-red-500 text-base">⚡</span>
      {overdue.length > 0 && (
        <span className="font-semibold">{overdue.length} OVERDUE</span>
      )}
      {urgent.length > 0 && (
        <span><strong>{urgent.length}</strong> claim{urgent.length !== 1 ? 's' : ''} with deadline within 7 days</span>
      )}
    </div>
  );
}
