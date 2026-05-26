import { useState } from 'react';
import type { ClaimAction } from '../../../types';

interface Props {
  payerName: string;
  currentAction?: ClaimAction;
  canSubmit: boolean;
  attachedFiles?: File[];
  onAction: (action: ClaimAction) => void;
}

interface ConfirmModalProps {
  payerName: string;
  attachedFiles: File[];
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({ payerName, attachedFiles, onConfirm, onCancel }: ConfirmModalProps) {
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

        {attachedFiles.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Attached files ({attachedFiles.length})
            </div>
            <ul className="space-y-1 max-h-28 overflow-y-auto">
              {attachedFiles.map((f, i) => (
                <li key={i} className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                  <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  <span className="truncate">{f.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

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

export function ActionFooter({ payerName, currentAction, canSubmit, attachedFiles = [], onAction }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);

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
          attachedFiles={attachedFiles}
          onConfirm={() => { setShowConfirm(false); onAction('submitted'); }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
      <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between bg-white gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAction('skipped')}
            className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-600"
          >
            Skip
          </button>
          <button
            onClick={() => onAction('draft_saved')}
            className="px-3 py-1.5 text-xs border border-yellow-300 rounded hover:bg-yellow-50 text-yellow-700"
          >
            Save Draft
          </button>
          {attachedFiles.length > 0 && (
            <span className="text-xs text-gray-400">
              {attachedFiles.length} file{attachedFiles.length > 1 ? 's' : ''} attached
            </span>
          )}
        </div>

        <button
          onClick={() => setShowConfirm(true)}
          disabled={!canSubmit}
          className="px-4 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
          title={!canSubmit ? 'Accept a suggestion, edit the draft, or attach a file first' : undefined}
        >
          Submit Appeal
        </button>
      </div>
    </>
  );
}
