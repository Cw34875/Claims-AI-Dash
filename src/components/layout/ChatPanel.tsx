import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiProposal } from '../../types';
import { ChatInterface } from '../chat/ChatInterface';

interface Props {
  contextKey: string;
  selectedClaimId: string | null;
  suggestedPrompts: string[];
  onProposalGenerated?: (claimId: string, proposal: AiProposal) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const MIN_WIDTH = 280;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 380;

export function ChatPanel({ contextKey, selectedClaimId, suggestedPrompts, onProposalGenerated, collapsed, onToggleCollapse }: Props) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    const delta = startX.current - e.clientX;
    setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta)));
  }, []);

  const onMouseUp = useCallback(() => {
    dragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const onDragHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  if (collapsed) {
    return (
      <div className="w-10 border-l border-gray-200 bg-gray-50 flex flex-col items-center pt-3 shrink-0">
        <button onClick={onToggleCollapse} className="p-1.5 hover:bg-gray-200 rounded" title="Expand chat">
          💬
        </button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 border-l border-gray-200" style={{ width }}>
      {/* Drag handle */}
      <div
        onMouseDown={onDragHandleMouseDown}
        className="w-1 shrink-0 cursor-col-resize hover:bg-blue-400 active:bg-blue-500 transition-colors bg-transparent"
        title="Drag to resize"
      />

      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200 bg-white shrink-0">
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">AI Assistant</span>
          <button onClick={onToggleCollapse} className="p-1 hover:bg-gray-200 rounded text-gray-400 text-sm">✕</button>
        </div>
        <ChatInterface
          key={contextKey}
          contextKey={contextKey}
          selectedClaimId={selectedClaimId}
          suggestedPrompts={suggestedPrompts}
          onProposalGenerated={onProposalGenerated}
        />
      </div>
    </div>
  );
}
