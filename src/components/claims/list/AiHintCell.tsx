interface Props {
  hint: string;
}

export function AiHintCell({ hint }: Props) {
  return (
    <span className="text-xs text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded max-w-[160px] truncate block" title={hint}>
      {hint}
    </span>
  );
}
