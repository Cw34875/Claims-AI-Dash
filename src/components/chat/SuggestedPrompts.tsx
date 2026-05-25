interface Props {
  prompts: string[];
  onSelect: (prompt: string) => void;
}

export function SuggestedPrompts({ prompts, onSelect }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5 p-3 border-b border-gray-100">
      {prompts.map((p) => (
        <button
          key={p}
          onClick={() => onSelect(p)}
          className="text-xs px-2.5 py-1.5 bg-gray-100 hover:bg-indigo-100 hover:text-indigo-700 text-gray-600 rounded-full transition-colors"
        >
          {p}
        </button>
      ))}
    </div>
  );
}
