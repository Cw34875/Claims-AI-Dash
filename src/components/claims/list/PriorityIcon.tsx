interface Props {
  level: 1 | 2 | 3;
}

export function PriorityIcon({ level }: Props) {
  if (level === 3) {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-label="Critical">
        <title>Critical</title>
        <polygon points="7,1 13,13 1,13" fill="#dc2626" />
      </svg>
    );
  }
  if (level === 2) {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-label="Warning">
        <title>Warning</title>
        <polygon points="7,1 13,13 1,13" fill="#d97706" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-label="Low">
      <title>Low</title>
      <polygon points="7,1 13,13 1,13" fill="none" stroke="#9ca3af" strokeWidth="1.5" />
    </svg>
  );
}
