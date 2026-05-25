import type { EnrichedClaim, ClaimSessionState } from '../../../types';
import { PriorityIcon } from './PriorityIcon';
import { DeadlineBadge } from './DeadlineBadge';
import { AiHintCell } from './AiHintCell';

interface Props {
  claim: EnrichedClaim;
  session: ClaimSessionState;
  isSelected: boolean;
  onSelect: (id: string) => void;
  rank: number;
}

function fmt$(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
}

const STATUS_COLORS: Record<string, string> = {
  denied: 'bg-red-100 text-red-700',
  rejected: 'bg-orange-100 text-orange-700',
  underpaid: 'bg-yellow-100 text-yellow-700',
  pending: 'bg-blue-100 text-blue-700',
};

const ACTION_BADGE: Record<string, string> = {
  submitted: 'bg-green-100 text-green-700',
  skipped: 'bg-gray-100 text-gray-500',
  escalated: 'bg-purple-100 text-purple-700',
  draft_saved: 'bg-yellow-100 text-yellow-700',
};

export function ClaimRow({ claim, session, isSelected, onSelect, rank }: Props) {
  const cptCodes = claim.lineItems.map((li) => li.cptCode).join(', ');
  const ageDays = Math.floor((Date.now() - new Date(claim.dateSubmitted).getTime()) / 86400000);

  return (
    <tr
      className={`cursor-pointer text-sm hover:bg-blue-50 transition-colors ${isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : 'border-l-2 border-transparent'}`}
      onClick={() => onSelect(claim.claimId)}
    >
      <td className="px-3 py-2 text-center">
        <div className="flex items-center gap-1 justify-center">
          <PriorityIcon level={claim.priorityLevel} />
          <span className="text-xs text-gray-400">{rank}</span>
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="font-mono text-xs font-medium text-gray-900">{claim.claimId}</div>
        <div className="text-xs text-gray-500 truncate max-w-[120px]">{claim.patient.name}</div>
      </td>
      <td className="px-3 py-2">
        <div className="text-xs text-gray-700 truncate max-w-[100px]">{claim.payerFamily}</div>
      </td>
      <td className="px-3 py-2">
        {claim.denialCode && (
          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold font-mono ${STATUS_COLORS[claim.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {claim.denialCode}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        <span className="text-sm font-semibold text-gray-900">{fmt$(claim.recoverability)}</span>
      </td>
      <td className="px-3 py-2">
        <span className="text-xs text-gray-500 font-mono">{cptCodes.slice(0, 18)}{cptCodes.length > 18 ? '…' : ''}</span>
      </td>
      <td className="px-3 py-2">
        <AiHintCell hint={claim.aiHint} />
      </td>
      <td className="px-3 py-2 text-center text-xs text-gray-500">{ageDays}d</td>
      <td className="px-3 py-2 text-center">
        <DeadlineBadge deadlineDays={claim.deadlineDays} />
      </td>
      <td className="px-3 py-2 text-center">
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[claim.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {claim.status}
        </span>
        {session.action && (
          <div className="mt-0.5">
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ACTION_BADGE[session.action] ?? ''}`}>
              {session.action.replace('_', ' ')}
            </span>
          </div>
        )}
      </td>
    </tr>
  );
}
