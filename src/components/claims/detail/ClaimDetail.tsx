import { useCallback, useState, useRef, useEffect } from 'react';
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
  rejected: 'bg-gray-50 border-gray-100 opacity-60',
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
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-gray-700">{edit.label}</span>
          {edit.status === 'accepted' && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700">
              applied
            </span>
          )}
        </div>
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
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [lineItemEdits, setLineItemEdits] = useState<Record<number, Record<string, string>>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse "lineItems[N].fieldName" → { index, field } or null
  function parseLineItemField(field: string): { index: number; key: string } | null {
    const m = field.match(/^lineItems\[(\d+)\]\.(\w+)$/);
    return m ? { index: parseInt(m[1]), key: m[2] } : null;
  }

  function handleLineItemEdit(index: number, field: string, value: string) {
    setLineItemEdits((prev) => ({
      ...prev,
      [index]: { ...prev[index], [field]: value },
    }));
  }

  // Auto-apply accepted field edits into the table whenever a new proposal loads
  useEffect(() => {
    if (!proposal) return;
    const accepted = proposal.fieldEdits.filter((fe) => fe.status === 'accepted');
    if (accepted.length === 0) return;
    setLineItemEdits((prev) => {
      const next = { ...prev };
      for (const fe of accepted) {
        const parsed = parseLineItemField(fe.field);
        if (parsed) {
          const { index, key } = parsed;
          next[index] = { ...next[index], [key]: fe.proposedValue };
        }
      }
      return next;
    });
  }, [proposal?.claimId]); // re-run only when a new claim's proposal loads

  const canSubmit = !!(
    attachedFiles.length > 0 ||
    (proposal && (
      proposal.fieldEdits.some((fe) => fe.status === 'accepted' || fe.status === 'edited') ||
      draftText.trim().length > 0
    ))
  );

  const handleFieldEdit = useCallback((field: string, status: FieldEdit['status'], editedValue?: string) => {
    if (!proposal) return;
    const fe = proposal.fieldEdits.find((f) => f.field === field);
    onProposalUpdate({
      ...proposal,
      fieldEdits: proposal.fieldEdits.map((f) =>
        f.field === field ? { ...f, status, editedValue: editedValue ?? f.editedValue } : f
      ),
    });

    const parsed = parseLineItemField(field);
    if (parsed) {
      const { index, key } = parsed;
      if (status === 'accepted' || status === 'edited') {
        const value = editedValue ?? fe?.proposedValue ?? '';
        setLineItemEdits((prev) => ({
          ...prev,
          [index]: { ...prev[index], [key]: value },
        }));
      } else if (status === 'rejected' || status === 'pending') {
        setLineItemEdits((prev) => {
          const row = { ...prev[index] };
          delete row[key];
          return { ...prev, [index]: row };
        });
      }
    }
  }, [proposal, onProposalUpdate]);

  function addFiles(files: FileList | null) {
    if (!files) return;
    setAttachedFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name + f.size));
      const next = Array.from(files).filter((f) => !existing.has(f.name + f.size));
      return [...prev, ...next];
    });
  }

  function removeFile(index: number) {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  }

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
              lineItemEdits={lineItemEdits}
              onLineItemEdit={handleLineItemEdit}
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

                {/* Draft appeal letter */}
                <div>
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    Appeal Letter Draft
                  </div>
                  <textarea
                    className="w-full text-xs text-gray-700 border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 leading-relaxed resize-y"
                    rows={8}
                    placeholder="Edit the appeal letter here, or start typing your own…"
                    value={draftText}
                    onChange={(e) => onDraftChange(e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="px-3 py-3 rounded-lg bg-gray-50 border border-gray-100 text-xs text-gray-400">
                No analysis available.
              </div>
            )}
          </section>

          {/* Supporting Documents */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Supporting Documents</h3>
            <div
              className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
                dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
              <svg className="w-6 h-6 mx-auto mb-1.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <p className="text-xs text-gray-500">Drop files here or <span className="text-indigo-600 underline">browse</span></p>
              <p className="text-[10px] text-gray-400 mt-0.5">EOBs, medical records, authorization letters…</p>
            </div>

            {attachedFiles.length > 0 && (
              <ul className="mt-2 space-y-1">
                {attachedFiles.map((file, i) => (
                  <li key={i} className="flex items-center justify-between text-xs bg-gray-50 border border-gray-200 rounded px-2.5 py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      <span className="truncate text-gray-700">{file.name}</span>
                      <span className="text-gray-400 shrink-0">({(file.size / 1024).toFixed(0)} KB)</span>
                    </div>
                    <button
                      onClick={() => removeFile(i)}
                      className="ml-2 text-gray-400 hover:text-red-500 shrink-0"
                      title="Remove"
                    >✕</button>
                  </li>
                ))}
              </ul>
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
        attachedFiles={attachedFiles}
        onAction={(action) => { if (action) onAction(action); }}
      />
    </div>
  );
}
