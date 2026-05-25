import type { LineItem } from '../../../types';

interface Props {
  lineItems: LineItem[];
  totalBilled: number;
  totalAllowed: number | null;
  totalPaid: number;
}

function fmt$(n: number | null) {
  if (n === null) return '—';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

export function ServiceLinesTable({ lineItems, totalBilled, totalAllowed, totalPaid }: Props) {
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
            <tr key={i} className="hover:bg-gray-50">
              <td className="px-3 py-2 font-mono font-semibold text-gray-800">{li.cptCode}</td>
              <td className="px-3 py-2 font-mono text-gray-500">{li.modifier ?? '—'}</td>
              <td className="px-3 py-2 text-gray-700 max-w-[180px] truncate">{li.description}</td>
              <td className="px-3 py-2 text-center text-gray-600">{li.units}</td>
              <td className="px-3 py-2 text-right text-gray-800">{fmt$(li.billedAmount)}</td>
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
            <td className="px-3 py-2 text-right">{fmt$(totalBilled)}</td>
            <td className="px-3 py-2 text-right">{fmt$(totalAllowed)}</td>
            <td className={`px-3 py-2 text-right ${totalPaid === 0 ? 'text-red-600' : 'text-green-700'}`}>{fmt$(totalPaid)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
