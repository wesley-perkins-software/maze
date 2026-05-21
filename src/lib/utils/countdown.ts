export function getMsUntilLocalMidnight(): number {
  const now = new Date();
  const midnight = new Date(
    now.getFullYear(), now.getMonth(), now.getDate() + 1,
  );
  return midnight.getTime() - now.getTime();
}

export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`;
  }
  return `${m}m ${String(sec).padStart(2, '0')}s`;
}
