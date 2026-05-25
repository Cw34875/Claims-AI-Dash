import { useState } from 'react';
import type { ClaimAction, AiProposal } from '../../../types';

interface Props {
  claimId: string;
  payerName: string;
  aiProposal?: AiProposal;
  currentAction?: ClaimAction;
  canSubmit: boolean;
  onAction: (action: ClaimAction) => void;
}

interface ConfirmModalProps {
  payerName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({ payerName, onConfirm, onCancel }: ConfirmModalProps) {
  const [checks, setChecks] = useState({ reviewed: false, verified: false, confirmed: false });
  const allChecked = checks.reviewed && checks.verified && checks.confirmed;

  function toggle(key: keyof typeof checks) {
    setChecks((c) => ({ ...c, [key]: !c[key] }));
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-gray-900 mb-1">Submit Appeal</h3>
        <p className="text-sm text-gray-600 mb-4">
          You are about to submit this appeal to <strong>{payerName}</strong>.
        </p>

        <div className="space-y-2 mb-4">
          {([
            ['reviewed', 'I have reviewed the AI proposal'],
            ['verified', 'I have verified the draft letter'],
            ['confirmed', 'I confirm the claim details are correct'],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-start gap-2 cursor-pointer text-sm text-gray-700">
              <input
                type="checkbox"
                checked={checks[key]}
                onChange={() => toggle(key)}
                className="mt-0.5 rounded"
              />
              {label}
            </label>
          ))}
        </div>

        <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded p-2 mb-4">
          You are submitting this appeal — not the AI. Final responsibility rests with you.
        </p>

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!allChecked}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Submit Appeal
          </button>
        </div>
      </div>
    </div>
  );
}

export function ActionFooter({ payerName, aiProposal, currentAction, canSubmit, onAction }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const isWriteOff = aiProposal?.isWriteOff;

  if (currentAction === 'submitted') {
    return (
      <div className="border-t border-gray-200 px-4 py-3 bg-green-50">
        <p className="text-sm text-green-700 font-semibold text-center">✓ Appeal submitted</p>
      </div>
    );
  }

  return (
    <>
      {showConfirm && (
        <ConfirmModal
          payerName={payerName}
          onConfirm={() => { setShowConfirm(false); onAction('submitted'); }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
      <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between bg-white gap-2">
        <div className="flex gap-2">
          <button
            onClick={() => onAction('skipped')}
            className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-600"
          >
            Skip
          </button>
          <button
            onClick={() => onAction('escalated')}
            className="px-3 py-1.5 text-xs border border-purple-300 rounded hover:bg-purple-50 text-purple-700"
          >
            Escalate
          </button>
          <button
            onClick={() => onAction('draft_saved')}
            className="px-3 py-1.5 text-xs border border-yellow-300 rounded hover:bg-yellow-50 text-yellow-700"
          >
            Save Draft
          </button>
        </div>

        {isWriteOff ? (
          <button
            onClick={() => onAction('escalated')}
            className="px-4 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"
          >
            Request Write-Off Approval
          </button>
        ) : (
          <button
            onClick={() => setShowConfirm(true)}
            disabled={!canSubmit}
            className="px-4 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
            title={!canSubmit ? 'Review AI proposal or add a draft first' : undefined}
          >
            Submit Appeal
          </button>
        )}
      </div>
    </>
  );
}
