import { useState, useMemo, useCallback } from 'react';
import { useClaimsState } from '../../hooks/useClaimsState';
import { useFilters } from '../../hooks/useFilters';
import { useClaimDetail } from '../../hooks/useClaimDetail';
import { useChatContext } from '../../hooks/useChatContext';
import { useAutoProposal } from '../../hooks/useAutoProposal';
import { useBatchProposals } from '../../hooks/useBatchProposals';
import { FilterSidebar } from '../layout/FilterSidebar';
import { ChatPanel } from '../layout/ChatPanel';
import { PriorityTabs } from './StatusTabs';
import type { PriorityFilterValue } from './StatusTabs';
import { UrgentBanner } from './UrgentBanner';
import { ViewToggle } from './ViewToggle';
import { ClaimsList } from './list/ClaimsList';
import { ClaimDetail } from './detail/ClaimDetail';
import type { ViewMode, AiProposal, ClaimSessionState } from '../../types';

export function ClaimsWorkspace() {
  const { sortedClaims, sessionStates, updateSessionState, getSessionState } = useClaimsState();
  const { filters, filtered, setPayerFamilies, setDenialCodes, setStatuses, setDeadlineWithin, setOverdueOnly, resetFilters } = useFilters(sortedClaims);
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilterValue>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('sweep');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [listCollapsed, setListCollapsed] = useState(false);

  const displayClaims = useMemo(() => {
    // Status filter from sidebar (handles skipped via sessionStates)
    let result = filtered;
    if (filters.statuses.length > 0) {
      const realStatuses = filters.statuses.filter((s) => s !== 'skipped');
      const includeSkipped = filters.statuses.includes('skipped');
      result = filtered.filter((c) => {
        const isSkipped = sessionStates[c.claimId]?.action === 'skipped';
        if (includeSkipped && isSkipped) return true;
        if (realStatuses.length > 0 && realStatuses.includes(c.status)) return true;
        return false;
      });
    }
    // Priority filter from top bar
    if (priorityFilter === 'all') return result;
    const levelMap: Record<PriorityFilterValue, number> = { high: 3, medium: 2, low: 1, all: 0 };
    return result.filter((c) => c.priorityLevel === levelMap[priorityFilter]);
  }, [filtered, filters.statuses, priorityFilter, sessionStates]);

  const { selectedClaimId, selectedClaim, prevClaim, nextClaim, selectClaim, goToPrev, goToNext } = useClaimDetail(displayClaims);
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

  const handleBatchApply = useCallback((updates: { claimId: string; proposal: AiProposal }[]) => {
    for (const { claimId, proposal } of updates) {
      updateSessionState(claimId, { action: 'submitted', aiProposal: proposal });
    }
  }, [updateSessionState]);

  const selectedSession = selectedClaimId ? getSessionState(selectedClaimId) : null;

  // Batch: pre-load proposals for all visible claims in the background.
  useBatchProposals(displayClaims, sessionStates, handleProposalGenerated);

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
        sessionStates={sessionStates}
        filters={filters}
        onPayerFamiliesChange={setPayerFamilies}
        onDenialCodesChange={setDenialCodes}
        onStatusesChange={setStatuses}
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
            <span className="text-xs text-gray-400">{displayClaims.length} of {sortedClaims.length} claims</span>
          </div>
          <ViewToggle viewMode={viewMode} onChange={setViewMode} />
        </div>

        <UrgentBanner claims={sortedClaims} />
        <PriorityTabs allClaims={filtered} activePriority={priorityFilter} onPriorityChange={setPriorityFilter} />

        <div className="flex-1 flex min-h-0">
          {/* Claims list */}
          <div className={`flex flex-col overflow-hidden transition-all duration-200 ${
            !selectedClaim ? 'flex-1' : listCollapsed ? 'w-0' : 'w-[45%]'
          }`}>
            <ClaimsList
              claims={displayClaims}
              sessionStates={sessionStates}
              selectedClaimId={selectedClaimId}
              onSelect={selectClaim}
              onProposalGenerated={handleProposalGenerated}
              onBatchApply={handleBatchApply}
              viewMode={viewMode}
            />
          </div>

          {/* Divider toggle — only visible when a claim is open */}
          {selectedClaim && (
            <div className="relative shrink-0 w-0 z-10">
              <button
                onClick={() => setListCollapsed((c) => !c)}
                className="absolute top-3 -translate-x-1/2 h-8 w-5 bg-white border border-gray-200 rounded shadow-sm flex items-center justify-center hover:bg-gray-50 text-gray-400 text-xs"
                title={listCollapsed ? 'Show claims list' : 'Hide claims list'}
              >
                {listCollapsed ? '›' : '‹'}
              </button>
            </div>
          )}

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
