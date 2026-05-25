interface Props {
  toolName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any;
}

function fmt$(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
}

function AnalyzeClaimResult({ result }: { result: { claim?: { claimId: string; status: string; denialCode: string; recoverability: number; deadlineDays: number | null }; error?: string } }) {
  if (result.error) return <p className="text-red-600 text-xs">{result.error}</p>;
  if (!result.claim) return null;
  const { claim } = result;
  return (
    <div className="text-xs space-y-1">
      <div className="font-semibold text-gray-700">{claim.claimId} — {claim.status.toUpperCase()}</div>
      <div>Denial: <span className="font-mono">{claim.denialCode ?? 'N/A'}</span></div>
      <div>At risk: <span className="font-semibold">{fmt$(claim.recoverability)}</span></div>
      {claim.deadlineDays !== null && (
        <div>Deadline: <span className={claim.deadlineDays <= 7 ? 'text-red-600 font-semibold' : 'text-gray-600'}>{claim.deadlineDays}d</span></div>
      )}
    </div>
  );
}

function SearchSimilarResult({ result }: { result: { count: number; totalRecoverability: number; claims?: { claimId: string; patient: string; denialCode: string; recoverability: number }[] } }) {
  return (
    <div className="text-xs space-y-2">
      <div className="font-semibold text-gray-700">{result.count} similar claim{result.count !== 1 ? 's' : ''} — {fmt$(result.totalRecoverability)} total</div>
      {result.claims?.slice(0, 5).map((c) => (
        <div key={c.claimId} className="flex items-center justify-between text-gray-600 bg-white rounded px-2 py-1 border border-gray-200">
          <span className="font-mono">{c.claimId}</span>
          <span>{c.patient}</span>
          <span className="font-semibold">{fmt$(c.recoverability)}</span>
        </div>
      ))}
      {(result.count ?? 0) > 5 && <div className="text-gray-400">+{result.count - 5} more</div>}
    </div>
  );
}

function DraftCorrespondenceResult({ result }: { result: { claimId: string; correspondenceType: string } }) {
  const typeLabel: Record<string, string> = {
    appeal_letter: 'Appeal Letter',
    peer_to_peer_request: 'Peer-to-Peer Request',
    reconsideration_letter: 'Reconsideration Letter',
    cob_update: 'COB Update',
  };
  return (
    <div className="text-xs text-gray-600">
      Drafting <span className="font-semibold">{typeLabel[result.correspondenceType] ?? result.correspondenceType}</span> for {result.claimId}…
    </div>
  );
}

export function ToolResultDisplay({ toolName, result }: Props) {
  const labels: Record<string, string> = {
    analyzeClaim: '🔍 Claim Analysis',
    searchSimilarClaims: '🔎 Similar Claims',
    draftCorrespondence: '✍️ Drafting',
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 my-1">
      <div className="text-xs font-semibold text-indigo-700 mb-2">{labels[toolName] ?? toolName}</div>
      {toolName === 'analyzeClaim' && <AnalyzeClaimResult result={result} />}
      {toolName === 'searchSimilarClaims' && <SearchSimilarResult result={result} />}
      {toolName === 'draftCorrespondence' && <DraftCorrespondenceResult result={result} />}
    </div>
  );
}
