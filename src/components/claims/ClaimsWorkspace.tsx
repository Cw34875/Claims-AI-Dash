import { useState, useMemo, useCallback } from 'react';
import { useClaimsState } from '../../hooks/useClaimsState';
import { useFilters } from '../../hooks/useFilters';
import { useClaimDetail } from '../../hooks/useClaimDetail';
import { useChatContext } from '../../hooks/useChatContext';
import { useAutoProposal } from '../../hooks/useAutoProposal';
import { useBatchProposals } from '../../hooks/useBatchProposals';
import { FilterSidebar } from '../layout/FilterSidebar';
import { ChatPanel } from '../layout/ChatPanel';
import { StatusTabs } from './StatusTabs';
import type { StatusFilterValue } from './StatusTabs';
import { UrgentBanner } from './UrgentBanner';
import { ViewToggle } from './ViewToggle';
import { ClaimsList } from './list/ClaimsList';
import { ClaimDetail } from './detail/ClaimDetail';
import type { ViewMode, AiProposal, ClaimSessionState } from '../../types';

type StatusFilter = StatusFilterValue;

export function ClaimsWorkspace() {
  const { sortedClaims, sessionStates, updateSessionState, getSessionState } = useClaimsState();
  const { filters, filtered, setPayerFamilies, setDenialCodes, setDeadlineWithin, setOverdueOnly, resetFilters } = useFilters(sortedClaims);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('sweep');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);

  const statusFiltered = useMemo(() => {
    if (statusFilter === 'all') return filtered;
    if (statusFilter === 'skipped') return filtered.filter((c) => sessionStates[c.claimId]?.action === 'skipped');
    return filtered.filter((c) => c.status === statusFilter);
  }, [filtered, statusFilter, sessionStates]);

  const { selectedClaimId, selectedClaim, prevClaim, nextClaim, selectClaim, goToPrev, goToNext } = useClaimDetail(statusFiltered);
  const { contextKey, suggestedPrompts } = useChatContext(selectedClaimId);

  const handleProposalGenerated = useCallback((claimId: string, proposal: AiProposal) => {
    updateSessionState(claimId, { aiProposal: proposal, draftText: proposal.draftText });
  }, [updateSessionState]);

  function handleAction(action: ClaimSessionState['action']) {
    if (selectedClaimId && action) {
      updateSessionState(selectedClaimId, { action });
    }
  }

  function handleDraftChange(text: string) {
    if (selectedClaimId) {
      updateSessionState(selectedClaimId, { draftText: text });
    }
  }

  function handleProposalUpdate(proposal: AiProposal) {
    if (selectedClaimId) {
      updateSessionState(selectedClaimId, { aiProposal: proposal });
    }
  }

  const selectedSession = selectedClaimId ? getSessionState(selectedClaimId) : null;

  // Batch: pre-load proposals for all visible claims in the background.
  useBatchProposals(statusFiltered, sessionStates, handleProposalGenerated);

  // Fallback: if the selected claim wasn't covered by the batch yet, fetch individually.
  const { isLoading: isAutoAnalyzing } = useAutoProposal(
    selectedClaimId,
    selectedSession?.aiProposal,
    handleProposalGenerated,
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Filter Sidebar */}
      <FilterSidebar
        allClaims={sortedClaims}
        filters={filters}
        onPayerFamiliesChange={setPayerFamilies}
        onDenialCodesChange={setDenialCodes}
        onDeadlineWithinChange={setDeadlineWithin}
        onOverdueOnlyChange={setOverdueOnly}
        onReset={resetFilters}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
      />

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="font-bold text-gray-900 text-base">Claims Review</h1>
            <span className="text-xs text-gray-400">{statusFiltered.length} of {sortedClaims.length} claims</span>
          </div>
          <ViewToggle viewMode={viewMode} onChange={setViewMode} />
        </div>

        <UrgentBanner claims={sortedClaims} />
        <StatusTabs allClaims={sortedClaims} sessionStates={sessionStates} activeStatus={statusFilter} onStatusChange={setStatusFilter} />

        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Claims list */}
          <div className={`flex flex-col overflow-hidden transition-all ${selectedClaim ? 'w-[45%]' : 'flex-1'}`}>
            <ClaimsList
              claims={statusFiltered}
              sessionStates={sessionStates}
              selectedClaimId={selectedClaimId}
              onSelect={selectClaim}
              viewMode={viewMode}
            />
          </div>

          {/* Claim detail slide-over */}
          {selectedClaim && selectedSession && (
            <div className="flex-1 border-l border-gray-200 overflow-hidden">
              <ClaimDetail
                claim={selectedClaim}
                session={selectedSession}
                hasPrev={!!prevClaim}
                hasNext={!!nextClaim}
                onPrev={goToPrev}
                onNext={goToNext}
                onClose={() => selectClaim(null)}
                onAction={handleAction}
                onDraftChange={handleDraftChange}
                onProposalUpdate={handleProposalUpdate}
                isAutoAnalyzing={isAutoAnalyzing}
              />
            </div>
          )}
        </div>
      </div>

      {/* Chat Panel */}
      <ChatPanel
        contextKey={contextKey}
        selectedClaimId={selectedClaimId}
        suggestedPrompts={suggestedPrompts}
        onProposalGenerated={handleProposalGenerated}
        collapsed={chatCollapsed}
        onToggleCollapse={() => setChatCollapsed((c) => !c)}
      />
    </div>
  );
}
