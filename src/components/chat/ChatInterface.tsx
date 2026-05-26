import { useRef, useEffect, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { AiProposal } from '../../types';
import { mapToProposal, type ClaimReview } from '../../utils/proposals';
import { MessageBubble } from './MessageBubble';
import { SuggestedPrompts } from './SuggestedPrompts';

interface Props {
  contextKey: string;
  selectedClaimId: string | null;
  suggestedPrompts: string[];
  onProposalGenerated?: (claimId: string, proposal: AiProposal) => void;
}

export function ChatInterface({ contextKey, selectedClaimId, suggestedPrompts, onProposalGenerated }: Props) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { claimContext: selectedClaimId ?? undefined },
    }),
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Parse AI proposals from tool results.
  // AI SDK v6: tool parts have type `tool-${toolName}` and properties (state, input, output)
  // spread directly on the part — NOT nested under a `toolInvocation` property.
  // Completed tool state is 'output-available', not 'result'.
  useEffect(() => {
    if (!onProposalGenerated || !selectedClaimId) return;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant') return;

    for (const part of lastMsg.parts) {
      const p = part as { type: string; state?: string; output?: unknown; toolName?: string };

      // Resolve tool name: static tools encode it in the type ('tool-editClaim'),
      // dynamic tools have an explicit toolName field.
      let toolName: string | null = null;
      if (p.type === 'dynamic-tool' && p.toolName) {
        toolName = p.toolName;
      } else if (p.type.startsWith('tool-')) {
        toolName = p.type.slice('tool-'.length);
      }

      if (!toolName || p.state !== 'output-available' || !p.output) continue;

      if (toolName === 'editClaim') {
        const output = p.output as ClaimReview & { error?: string };
        if (!output.error && output.claimId) {
          onProposalGenerated(output.claimId, mapToProposal(output));
        }
      }

      if (toolName === 'analyzeClaim') {
        const output = p.output as { claim?: { claimId: string } };
        if (output.claim) {
          const textParts = lastMsg.parts.filter((q) => q.type === 'text');
          const text = textParts.map((q) => (q as { type: 'text'; text: string }).text).join('');

          const proposal: AiProposal = {
            claimId: output.claim.claimId,
            recommendedAction: extractSection(text, 'recommended action') || 'Review and appeal',
            confidence: extractConfidence(text),
            reasoning: extractSection(text, 'reasoning') || text.slice(0, 300),
            fieldEdits: [],
            draftText: extractSection(text, 'draft') || '',
            isWriteOff: text.toLowerCase().includes('write-off') || text.toLowerCase().includes('write off'),
          };

          onProposalGenerated(output.claim.claimId, proposal);
        }
      }
    }
  }, [messages, selectedClaimId, onProposalGenerated]);

  function extractSection(text: string, keyword: string): string {
    const patterns = [
      new RegExp(`${keyword}[:\\s]+([^\\n]+)`, 'i'),
      new RegExp(`\\*\\*${keyword}[:\\*]*\\*\\*[:\\s]+([^\\n]+)`, 'i'),
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) return m[1].trim();
    }
    return '';
  }

  function extractConfidence(text: string): 'high' | 'medium' | 'low' {
    const lower = text.toLowerCase();
    if (lower.includes('high confidence')) return 'high';
    if (lower.includes('low confidence')) return 'low';
    return 'medium';
  }

  async function handleSend(text: string) {
    if (!text.trim() || isLoading) return;
    setInput('');
    await sendMessage({ text });
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {messages.length === 0 && (
        <SuggestedPrompts prompts={suggestedPrompts} onSelect={handleSend} />
      )}

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 text-sm mt-8">
            <div className="text-4xl mb-3">💬</div>
            <p>Ask me anything about your claims queue.</p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isLoading && (
          <div className="flex justify-start mb-3">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-2.5">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-gray-200 p-3 bg-white">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(input); }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={selectedClaimId ? `Ask about ${selectedClaimId}…` : 'Ask about your queue…'}
            disabled={isLoading}
            className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </form>
        {contextKey !== 'queue' && (
          <p className="text-xs text-gray-400 mt-1.5 text-center">Context: {contextKey}</p>
        )}
      </div>
    </div>
  );
}
