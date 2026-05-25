export function useChatContext(selectedClaimId: string | null) {
  const contextKey = selectedClaimId ?? 'queue';
  const isClaimContext = selectedClaimId !== null;

  const suggestedPrompts = isClaimContext
    ? [
        'Draft an appeal letter for this claim',
        'What is the best action for this denial?',
        'Find similar claims with the same denial code',
        'What documentation do I need for this appeal?',
      ]
    : [
        'What should I work on first?',
        'Show me the highest priority claims',
        'Which claims have deadlines this week?',
        'Summarize the claims by payer',
      ];

  return { contextKey, isClaimContext, suggestedPrompts };
}
