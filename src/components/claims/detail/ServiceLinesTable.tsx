import { useState, useEffect, useRef } from 'react';
import type { LineItem } from '../../../types';

interface Props {
  lineItems: LineItem[];
  lineItemEdits: Record<number, Record<string, string>>;
  onLineItemEdit: (index: number, field: string, value: string) => void;
  totalAllowed: number | null;
  totalPaid: number;
}

function fmt$(n: number | null) {
  if (n === null) return '—';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

function EditableCell({
  value,
  original,
  onSave,
  mono = false,
  align = 'left',
}: {
  value: string;
  original: string;
  onSave: (v: string) => void;
  mono?: boolean;
  align?: 'left' | 'right' | 'center';
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const isModified = value !== original;

  // Sync external value changes (e.g. AI accept) into draft when not actively editing
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const alignClass = align === 'right' ? 'text-right justify-end' : align === 'center' ? 'text-center justify-center' : 'text-left justify-start';

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        className={`w-full border border-indigo-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white ${mono ? 'font-mono' : ''} ${alignClass.split(' ')[0]}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { onSave(draft); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { onSave(draft); setEditing(false); }
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      title="Click to edit"
      className={`group flex items-center gap-1 min-h-[1.25rem] px-1 py-0.5 rounded cursor-text transition-colors ${alignClass} ${
        isModified
          ? 'bg-amber-50 ring-1 ring-amber-200'
          : 'hover:bg-gray-100'
      }`}
    >
      <span className={`${mono ? 'font-mono' : ''} ${isModified ? 'text-amber-800 font-semibold' : 'text-gray-700'}`}>
        {value || <span className="italic text-gray-300">—</span>}
      </span>
      {!isModified && (
        <svg className="w-2.5 h-2.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2.414a2 2 0 01.586-1.414z" />
        </svg>
      )}
    </div>
  );
}

export function ServiceLinesTable({ lineItems, lineItemEdits, onLineItemEdit, totalAllowed, totalPaid }: Props) {
  function eff(index: number, field: string, original: string): string {
    return lineItemEdits[index]?.[field] ?? original;
  }

  const effectiveTotalBilled = lineItems.reduce((sum, li, i) => {
    const v = lineItemEdits[i]?.billedAmount ?? String(li.billedAmount);
    return sum + (parseFloat(v) || 0);
  }, 0);

  const hasAnyEdits = lineItems.some((_, i) =>
    Object.keys(lineItemEdits[i] ?? {}).length > 0
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-50 text-gray-500 uppercase tracking-wide border-b border-gray-200">
            <th className="px-3 py-2 text-left">CPT</th>
            <th className="px-3 py-2 text-left">MOD</th>
            <th className="px-3 py-2 text-left">Description</th>
            <th className="px-3 py-2 text-center">Units</th>
            <th className="px-3 py-2 text-right">Billed</th>
            <th className="px-3 py-2 text-right">Allowed</th>
            <th className="px-3 py-2 text-right">Paid</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {lineItems.map((li, i) => (
            <tr key={i} className="hover:bg-gray-50/50">
              <td className="px-2 py-1.5">
                <EditableCell
                  value={eff(i, 'cptCode', li.cptCode)}
                  original={li.cptCode}
                  onSave={(v) => onLineItemEdit(i, 'cptCode', v)}
                  mono
                />
              </td>
              <td className="px-2 py-1.5">
                <EditableCell
                  value={eff(i, 'modifier', li.modifier ?? '')}
                  original={li.modifier ?? ''}
                  onSave={(v) => onLineItemEdit(i, 'modifier', v)}
                  mono
                />
              </td>
              <td className="px-2 py-1.5 text-gray-600 max-w-[180px] truncate">{li.description}</td>
              <td className="px-2 py-1.5">
                <EditableCell
                  value={eff(i, 'units', String(li.units))}
                  original={String(li.units)}
                  onSave={(v) => onLineItemEdit(i, 'units', v)}
                  align="center"
                />
              </td>
              <td className="px-2 py-1.5">
                <EditableCell
                  value={eff(i, 'billedAmount', li.billedAmount.toFixed(2))}
                  original={li.billedAmount.toFixed(2)}
                  onSave={(v) => onLineItemEdit(i, 'billedAmount', v)}
                  align="right"
                />
              </td>
              <td className="px-3 py-2 text-right text-gray-600">{fmt$(li.allowedAmount)}</td>
              <td className={`px-3 py-2 text-right font-semibold ${li.paidAmount === 0 ? 'text-red-600' : 'text-green-700'}`}>
                {fmt$(li.paidAmount)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-gray-300 bg-gray-50">
          <tr className="font-semibold text-gray-700">
            <td colSpan={4} className="px-3 py-2 text-right uppercase text-xs tracking-wide">Total</td>
            <td className={`px-3 py-2 text-right ${hasAnyEdits ? 'text-amber-800' : ''}`}>{fmt$(effectiveTotalBilled)}</td>
            <td className="px-3 py-2 text-right">{fmt$(totalAllowed)}</td>
            <td className={`px-3 py-2 text-right ${totalPaid === 0 ? 'text-red-600' : 'text-green-700'}`}>{fmt$(totalPaid)}</td>
          </tr>
        </tfoot>
      </table>
      {hasAnyEdits && (
        <p className="text-[10px] text-amber-600 mt-1.5 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block shrink-0" />
          Highlighted cells have been modified from original claim values
        </p>
      )}
    </div>
  );
}
