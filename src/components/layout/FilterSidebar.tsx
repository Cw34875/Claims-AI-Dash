import { useState } from 'react';
import type { EnrichedClaim, Filters, ClaimSessionState } from '../../types';

interface Props {
  allClaims: EnrichedClaim[];
  sessionStates: Record<string, ClaimSessionState>;
  filters: Filters;
  onPayerFamiliesChange: (families: string[]) => void;
  onDenialCodesChange: (codes: string[]) => void;
  onStatusesChange: (statuses: string[]) => void;
  onDeadlineWithinChange: (days: number | null) => void;
  onOverdueOnlyChange: (value: boolean) => void;
  onReset: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

function toggle<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
}

const STATUS_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'denied',    label: 'Denied',    color: 'text-red-600' },
  { value: 'rejected',  label: 'Rejected',  color: 'text-orange-600' },
  { value: 'underpaid', label: 'Underpaid', color: 'text-yellow-600' },
  { value: 'pending',   label: 'Pending',   color: 'text-blue-600' },
  { value: 'skipped',   label: 'Skipped',   color: 'text-gray-500' },
];

export function FilterSidebar({
  allClaims, sessionStates, filters, onPayerFamiliesChange, onDenialCodesChange, onStatusesChange,
  onDeadlineWithinChange, onOverdueOnlyChange, onReset, collapsed, onToggleCollapse,
}: Props) {
  const [payerSearch, setPayerSearch] = useState('');
  const [denialSearch, setDenialSearch] = useState('');

  const payerFamilies = [...new Set(allClaims.map((c) => c.payerFamily))].sort();
  const denialCodes = [...new Set(allClaims.map((c) => c.denialCode).filter(Boolean) as string[])].sort();

  const filteredPayers = payerSearch
    ? payerFamilies.filter((p) => p.toLowerCase().includes(payerSearch.toLowerCase()))
    : payerFamilies;

  const filteredDenialCodes = denialSearch
    ? denialCodes.filter((c) => c.toLowerCase().includes(denialSearch.toLowerCase()))
    : denialCodes;

  function statusCount(value: string) {
    if (value === 'skipped') {
      return allClaims.filter((c) => sessionStates[c.claimId]?.action === 'skipped').length;
    }
    return allClaims.filter((c) => c.status === value).length;
  }

  if (collapsed) {
    return (
      <div className="w-10 border-r border-gray-200 bg-gray-50 flex flex-col items-center pt-3 shrink-0">
        <button onClick={onToggleCollapse} className="p-1.5 hover:bg-gray-200 rounded" title="Expand filters">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M7 8h10M10 12h4" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 border-r border-gray-200 bg-gray-50 flex flex-col shrink-0 overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200">
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Filters</span>
        <div className="flex items-center gap-2">
          <button onClick={onReset} className="text-xs text-indigo-600 hover:underline">Reset</button>
          <button onClick={onToggleCollapse} className="p-1 hover:bg-gray-200 rounded text-gray-400">✕</button>
        </div>
      </div>

      <div className="p-3 space-y-4">
        {/* Status */}
        <div>
          <div className="text-xs font-semibold text-gray-600 mb-2">Status</div>
          <div className="space-y-1">
            {STATUS_OPTIONS.map(({ value, label, color }) => {
              const count = statusCount(value);
              return (
                <label key={value} className={`flex items-center justify-between gap-2 cursor-pointer text-xs hover:text-gray-900 ${color}`}>
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={filters.statuses.includes(value)}
                      onChange={() => onStatusesChange(toggle(filters.statuses, value))}
                      className="rounded text-indigo-600"
                    />
                    {label}
                  </span>
                  <span className="text-gray-400 font-normal">{count}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Payer */}
        <div>
          <div className="text-xs font-semibold text-gray-600 mb-2">Payer</div>
          <input
            type="text"
            value={payerSearch}
            onChange={(e) => setPayerSearch(e.target.value)}
            placeholder="Search payers…"
            className="w-full text-xs border border-gray-300 rounded px-2 py-1 mb-2 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
          />
          <div className="space-y-1">
            {filteredPayers.map((pf) => (
              <label key={pf} className="flex items-center gap-2 cursor-pointer text-xs text-gray-700 hover:text-gray-900">
                <input
                  type="checkbox"
                  checked={filters.payerFamilies.includes(pf)}
                  onChange={() => onPayerFamiliesChange(toggle(filters.payerFamilies, pf))}
                  className="rounded text-indigo-600"
                />
                {pf}
              </label>
            ))}
            {filteredPayers.length === 0 && (
              <div className="text-xs text-gray-400 italic">No matches</div>
            )}
          </div>
        </div>

        {/* Denial Code */}
        <div>
          <div className="text-xs font-semibold text-gray-600 mb-2">Denial Code</div>
          <input
            type="text"
            value={denialSearch}
            onChange={(e) => setDenialSearch(e.target.value)}
            placeholder="Search codes…"
            className="w-full text-xs border border-gray-300 rounded px-2 py-1 mb-2 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
          />
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {filteredDenialCodes.map((code) => (
              <label key={code} className="flex items-center gap-2 cursor-pointer text-xs text-gray-700 hover:text-gray-900">
                <input
                  type="checkbox"
                  checked={filters.denialCodes.includes(code)}
                  onChange={() => onDenialCodesChange(toggle(filters.denialCodes, code))}
                  className="rounded text-indigo-600"
                />
                <span className="font-mono">{code}</span>
              </label>
            ))}
            {filteredDenialCodes.length === 0 && (
              <div className="text-xs text-gray-400 italic">No matches</div>
            )}
          </div>
        </div>

        {/* Deadline */}
        <div>
          <div className="text-xs font-semibold text-gray-600 mb-2">Deadline Within</div>
          <div className="space-y-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-red-600 hover:text-red-700">
              <input
                type="radio"
                name="deadline"
                checked={filters.overdueOnly}
                onChange={() => { onOverdueOnlyChange(true); onDeadlineWithinChange(null); }}
                className="text-red-500"
              />
              Overdue
            </label>
            {[7, 14, 30].map((days) => (
              <label key={days} className="flex items-center gap-2 cursor-pointer text-xs text-gray-700">
                <input
                  type="radio"
                  name="deadline"
                  checked={!filters.overdueOnly && filters.deadlineWithin === days}
                  onChange={() => { onOverdueOnlyChange(false); onDeadlineWithinChange(days); }}
                  className="text-indigo-600"
                />
                {days} days
              </label>
            ))}
            <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700">
              <input
                type="radio"
                name="deadline"
                checked={!filters.overdueOnly && filters.deadlineWithin === null}
                onChange={() => { onOverdueOnlyChange(false); onDeadlineWithinChange(null); }}
                className="text-indigo-600"
              />
              Any
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
