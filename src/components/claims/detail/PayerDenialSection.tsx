interface Props {
  denialCode: string | null;
  denialReason: string | null;
  payerNotes: string | null;
}

export function PayerDenialSection({ denialCode, denialReason, payerNotes }: Props) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {denialCode ? (
          <span className="inline-block px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-700 border border-red-200">
            {denialCode}
          </span>
        ) : (
          <span className="text-xs text-gray-400">No denial code</span>
        )}
        {denialReason && <span className="text-sm text-gray-700">{denialReason}</span>}
      </div>
      {payerNotes && (
        <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-gray-700 leading-relaxed">
          <div className="font-semibold text-amber-800 mb-1">Payer Notes</div>
          {payerNotes}
        </div>
      )}
    </div>
  );
}
