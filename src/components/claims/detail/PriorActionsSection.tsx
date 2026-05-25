import type { PriorAction } from '../../../types';

interface Props {
  priorActions: PriorAction[];
}

const OUTCOME_COLORS: Record<string, string> = {
  denied: 'bg-red-100 text-red-700',
  approved: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
};

export function PriorActionsSection({ priorActions }: Props) {
  if (priorActions.length === 0) {
    return <p className="text-xs text-gray-400 italic">No prior actions recorded.</p>;
  }

  return (
    <div className="space-y-2">
      {priorActions.map((action, i) => (
        <div key={i} className="border border-gray-200 rounded p-3 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-gray-500">{action.date}</span>
            <div className="flex items-center gap-2">
              <span className="text-gray-600 capitalize">{action.type.replace(/_/g, ' ')}</span>
              <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${OUTCOME_COLORS[action.outcome] ?? 'bg-gray-100 text-gray-600'}`}>
                {action.outcome}
              </span>
            </div>
          </div>
          <p className="text-gray-700 leading-relaxed">{action.description}</p>
        </div>
      ))}
    </div>
  );
}
