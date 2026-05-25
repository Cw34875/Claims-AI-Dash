import { useCallback, useState } from 'react';
import type { EnrichedClaim, ClaimSessionState, AiProposal, FieldEdit } from '../../../types';
import { DetailHeader } from './DetailHeader';
import { ServiceLinesTable } from './ServiceLinesTable';
import { PayerDenialSection } from './PayerDenialSection';
import { PriorActionsSection } from './PriorActionsSection';
import { ActionFooter } from './ActionFooter';

interface Props {
  claim: EnrichedClaim;
  session: ClaimSessionState;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onAction: (action: ClaimSessionState['action']) => void;
  onDraftChange: (text: string) => void;
  onProposalUpdate: (proposal: AiProposal) => void;
  isAutoAnalyzing?: boolean;
}

const CONFIDENCE_BADGE: Record<string, string> = {
  high: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-red-100 text-red-700',
};

const STATUS_ROW: Record<string, string> = {
  pending: 'bg-amber-50 border-amber-200',
  accepted: 'bg-green-50 border-green-200',
  rejected: 'bg-gray-50 border-gray-200 opacity-60',
  edited: 'bg-blue-50 border-blue-200',
};

function SuggestionRow({
  edit,
  onEdit,
}: {
  edit: FieldEdit;
  onEdit: (status: FieldEdit['status'], val?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(edit.editedValue ?? edit.proposedValue);

  return (
    <div className={`border rounded-lg p-3 text-xs ${STATUS_ROW[edit.status]}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-semibold text-gray-700">{edit.label}</span>
        <div className="flex items-center gap-1 shrink-0">
          {edit.confidence && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${CONFIDENCE_BADGE[edit.confidence]}`}>
              {edit.confidence}
            </span>
          )}
          {edit.status === 'pending' || edit.status === 'edited' ? (
            <>
              <button
                onClick={() => { setEditing(false); onEdit('accepted'); }}
                className="w-6 h-6 rounded-full bg-green-100 hover:bg-green-200 text-green-700 font-bold flex items-center justify-center"
                title="Accept"
              >✓</button>
              <button
                onClick={() => setEditing((v) => !v)}
                className="w-6 h-6 rounded-full bg-yellow-100 hover:bg-yellow-200 text-yellow-700 flex items-center justify-center"
                title="Edit"
              >✎</button>
              <button
                onClick={() => { setEditing(false); onEdit('rejected'); }}
                className="w-6 h-6 rounded-full bg-red-100 hover:bg-red-200 text-red-700 font-bold flex items-center justify-center"
                title="Reject"
              >✗</button>
            </>
          ) : (
            <button
              onClick={() => onEdit('pending')}
              className="text-gray-400 hover:text-gray-600 underline text-[10px]"
            >undo</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] text-gray-400 mb-0.5">Current</div>
          <div className={`text-gray-700 ${edit.status === 'rejected' ? 'line-through' : ''}`}>
            {edit.currentValue || <span className="italic text-gray-400">—</span>}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-gray-400 mb-0.5">Suggested</div>
          {editing ? (
            <input
              autoFocus
              className="w-full border border-blue-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
              value={editVal}
              onChange={(e) => setEditVal(e.target.value)}
              onBlur={() => { onEdit('edited', editVal); setEditing(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { onEdit('edited', editVal); setEditing(false); } }}
            />
          ) : (
            <div className="font-medium text-indigo-700">
              {edit.status === 'edited' ? (edit.editedValue ?? edit.proposedValue) : edit.proposedValue}
            </div>
          )}
        </div>
      </div>

      {edit.rationale && (
        <div className="mt-2 text-gray-500 italic leading-relaxed">{edit.rationale}</div>
      )}
    </div>
  );
}

export function ClaimDetail({
  claim, session, hasPrev, hasNext, onPrev, onNext, onClose, onAction, onDraftChange, onProposalUpdate, isAutoAnalyzing,
}: Props) {
  const proposal = session.aiProposal;
  const draftText = session.draftText ?? proposal?.draftText ?? '';

  const canSubmit = !!(proposal && (
    proposal.fieldEdits.some((fe) => fe.status === 'accepted' || fe.status === 'edited') ||
    draftText.trim().length > 0
  ));

  const handleFieldEdit = useCallback((field: string, status: FieldEdit['status'], editedValue?: string) => {
    if (!proposal) return;
    onProposalUpdate({
      ...proposal,
      fieldEdits: proposal.fieldEdits.map((fe) =>
        fe.field === field ? { ...fe, status, editedValue: editedValue ?? fe.editedValue } : fe
      ),
    });
  }, [proposal, onProposalUpdate]);

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <DetailHeader
        claim={claim}
        hasPrev={hasPrev}
        hasNext={hasNext}
        onPrev={onPrev}
        onNext={onNext}
        onClose={onClose}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-5">
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Denial</h3>
            <PayerDenialSection
              denialCode={claim.denialCode}
              denialReason={claim.denialReason}
              payerNotes={claim.payerNotes}
            />
          </section>

          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Service Lines</h3>
            <ServiceLinesTable
              lineItems={claim.lineItems}
              totalBilled={claim.totalBilledAmount}
              totalAllowed={claim.totalAllowedAmount}
              totalPaid={claim.totalPaidAmount}
            />
          </section>

          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Prior Actions</h3>
            <PriorActionsSection priorActions={claim.priorActions} />
          </section>

          {/* AI Analysis — always rendered, shows spinner / summary / suggestions */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">AI Analysis</h3>

            {isAutoAnalyzing ? (
              <div className="flex items-center gap-2.5 px-3 py-3 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-500">
                <span className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="text-xs">Analyzing claim…</span>
              </div>
            ) : proposal ? (
              <div className="space-y-3">
                {/* Summary + action */}
                <div className="px-3 py-3 rounded-lg bg-indigo-50 border border-indigo-100 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-indigo-800">{proposal.recommendedAction}</span>
                    {proposal.confidence && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${CONFIDENCE_BADGE[proposal.confidence]}`}>
                        {proposal.confidence} confidence
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{proposal.reasoning}</p>
                </div>

                {/* Field-level suggestions */}
                {proposal.fieldEdits.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                      Suggested corrections — accept, edit, or reject each
                    </div>
                    {proposal.fieldEdits.map((fe) => (
                      <SuggestionRow
                        key={fe.field}
                        edit={fe}
                        onEdit={(status, val) => handleFieldEdit(fe.field, status, val)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="px-3 py-3 rounded-lg bg-gray-50 border border-gray-100 text-xs text-gray-400">
                No analysis available.
              </div>
            )}
          </section>
        </div>
      </div>

      <ActionFooter
        claimId={claim.claimId}
        payerName={claim.payer.name}
        aiProposal={proposal}
        currentAction={session.action}
        canSubmit={canSubmit}
        onAction={(action) => { if (action) onAction(action); }}
      />
    </div>
  );
}
