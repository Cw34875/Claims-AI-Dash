interface Props {
  deadlineDays: number | null;
}

export function DeadlineBadge({ deadlineDays }: Props) {
  if (deadlineDays === null) {
    return <span className="text-gray-400 text-xs">—</span>;
  }
  if (deadlineDays < 0) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">
        OVERDUE
      </span>
    );
  }
  if (deadlineDays <= 7) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-red-50 text-red-600">
        {deadlineDays}d
      </span>
    );
  }
  if (deadlineDays <= 14) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-orange-50 text-orange-600">
        {deadlineDays}d
      </span>
    );
  }
  if (deadlineDays <= 30) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-yellow-50 text-yellow-600">
        {deadlineDays}d
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-500">
      {deadlineDays}d
    </span>
  );
}
