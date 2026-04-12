export function Timer({ elapsedMs }: { elapsedMs: number }) {
  const totalSecs = Math.floor(elapsedMs / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  const display = mins > 0
    ? `${mins}:${String(secs).padStart(2, '0')}`
    : `${secs}s`;

  return (
    <span className="font-mono text-sm font-semibold text-slate-700" aria-live="off">
      {display}
    </span>
  );
}
