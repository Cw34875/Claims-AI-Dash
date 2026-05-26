import type { EnrichedClaim } from '../../types';

export type PriorityFilterValue = 'all' | 'high' | 'medium' | 'low';

interface Props {
  allClaims: EnrichedClaim[];
  activePriority: PriorityFilterValue;
  onPriorityChange: (priority: PriorityFilterValue) => void;
}

function fmt$(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n.toFixed(0)}`;
}

const PRIORITY_CONFIG: {
  value: PriorityFilterValue;
  label: string;
  level: 1 | 2 | 3 | null;
  activeClass: string;
  dot: string;
}[] = [
  { value: 'high',   label: 'High',   level: 3, activeClass: 'border-red-500 text-red-700',    dot: 'bg-red-500' },
  { value: 'medium', label: 'Medium', level: 2, activeClass: 'border-amber-500 text-amber-700', dot: 'bg-amber-400' },
  { value: 'low',    label: 'Low',    level: 1, activeClass: 'border-gray-400 text-gray-600',   dot: 'bg-gray-400' },
  { value: 'all',    label: 'All',    level: null, activeClass: 'border-indigo-500 text-indigo-700', dot: 'bg-indigo-400' },
];

export function PriorityTabs({ allClaims, activePriority, onPriorityChange }: Props) {
  function getStats(level: 1 | 2 | 3 | null) {
    const items = level === null ? allClaims : allClaims.filter((c) => c.priorityLevel === level);
    return {
      count: items.length,
      total: items.reduce((s, c) => s + c.recoverability, 0),
    };
  }

  return (
    <div className="flex border-b border-gray-200 bg-white px-3 overflow-x-auto shrink-0">
      {PRIORITY_CONFIG.map(({ value, label, level, activeClass, dot }) => {
        const { count, total } = getStats(level);
        const isActive = activePriority === value;
        return (
          <button
            key={value}
            onClick={() => onPriorityChange(value)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs border-b-2 whitespace-nowrap transition-colors ${
              isActive
                ? `${activeClass} bg-gray-50`
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${dot} opacity-80`} />
            <span className="font-semibold">{label}</span>
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${isActive ? 'bg-gray-200' : 'bg-gray-100'}`}>
              {count}
            </span>
            {count > 0 && value !== 'all' && (
              <span className="text-gray-400">· {fmt$(total)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
