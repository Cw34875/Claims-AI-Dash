import type { AiProposal, FieldEdit } from '../../../types';

interface Props {
  proposal: AiProposal;
  draftText: string;
  onDraftChange: (text: string) => void;
  onFieldEdit: (field: string, status: FieldEdit['status'], editedValue?: string) => void;
}

const CONFIDENCE_COLORS = {
  high: 'text-green-700 bg-green-100',
  medium: 'text-yellow-700 bg-yellow-100',
  low: 'text-red-700 bg-red-100',
};

function FieldRow({ fe, onEdit }: { fe: FieldEdit; onEdit: (status: FieldEdit['status'], val?: string) => void }) {
  return (
    <div className={`p-2 rounded border ${fe.status === 'accepted' ? 'border-green-300 bg-green-50' : fe.status === 'rejected' ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-gray-600 mb-1">{fe.label}</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-400">Current: </span>
              <span className="text-gray-700">{fe.currentValue || '—'}</span>
            </div>
            <div>
              <span className="text-gray-400">Proposed: </span>
              <span className="font-medium text-indigo-700">{fe.proposedValue}</span>
            </div>
          </div>
          {fe.status === 'edited' && (
            <input
              className="mt-1 w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              value={fe.editedValue ?? fe.proposedValue}
              onChange={(e) => onEdit('edited', e.target.value)}
            />
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {fe.status === 'pending' || fe.status === 'edited' ? (
            <>
              <button
                onClick={() => onEdit('accepted')}
                className="w-7 h-7 rounded-full bg-green-100 hover:bg-green-200 text-green-700 text-sm font-bold flex items-center justify-center"
                title="Accept"
              >
                ✓
              </button>
              <button
                onClick={() => onEdit('edited')}
                className="w-7 h-7 rounded-full bg-yellow-100 hover:bg-yellow-200 text-yellow-700 text-xs flex items-center justify-center"
                title="Edit"
              >
                ✎
              </button>
              <button
                onClick={() => onEdit('rejected')}
                className="w-7 h-7 rounded-full bg-red-100 hover:bg-red-200 text-red-700 text-sm font-bold flex items-center justify-center"
                title="Reject"
              >
                ✗
              </button>
            </>
          ) : (
            <button
              onClick={() => onEdit('pending')}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              undo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function AiProposalCard({ proposal, draftText, onDraftChange, onFieldEdit }: Props) {
  return (
    <div className="border border-indigo-200 rounded-lg overflow-hidden">
      <div className="bg-indigo-600 px-4 py-2.5 flex items-center justify-between">
        <span className="text-white font-semibold text-sm">AI Recommendation</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${CONFIDENCE_COLORS[proposal.confidence]}`}>
          {proposal.confidence} confidence
        </span>
      </div>

      {proposal.isWriteOff && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-700 font-medium">
          ⚠ This recommendation involves a write-off. Requires management approval before proceeding.
        </div>
      )}

      <div className="p-4 space-y-4">
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Recommended Action</div>
          <p className="text-sm font-medium text-gray-800">{proposal.recommendedAction}</p>
        </div>

        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Reasoning</div>
          <p className="text-xs text-gray-600 leading-relaxed">{proposal.reasoning}</p>
        </div>

        {proposal.fieldEdits.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Suggested Field Edits</div>
            <div className="space-y-2">
              {proposal.fieldEdits.map((fe) => (
                <FieldRow
                  key={fe.field}
                  fe={fe}
                  onEdit={(status, val) => onFieldEdit(fe.field, status, val)}
                />
              ))}
            </div>
          </div>
        )}

        {draftText && (
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Draft Letter</div>
            <textarea
              className="w-full text-xs text-gray-700 border border-gray-300 rounded p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 leading-relaxed"
              rows={10}
              value={draftText}
              onChange={(e) => onDraftChange(e.target.value)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
