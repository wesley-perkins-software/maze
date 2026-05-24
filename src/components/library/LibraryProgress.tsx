/**
 * LibraryProgress — client:load island that reads completion state from
 * localStorage and renders a live progress summary.
 *
 * PR 2: renders static totals only (shows 0 / N until PR 4 wires markLibraryMazeComplete).
 * PR 4: will read completedMazeIds from mazethis.library.progress and update counts.
 */
import { useState, useEffect } from 'react';
import { getLibraryProgress } from '../../lib/library/progress';
import type { Difficulty } from '../../types/maze';

interface LibraryProgressProps {
  /** When set, shows count only for this difficulty tier. */
  difficulty?: Difficulty;
  /** Total maze count for the tier or library. Used to render "N / total" */
  total: number;
}

export function LibraryProgress({ difficulty, total }: LibraryProgressProps) {
  const [completed, setCompleted] = useState(0);

  useEffect(() => {
    const progress = getLibraryProgress();
    const count = difficulty
      ? progress.completedMazeIds.filter((id) => id.startsWith(`${difficulty}-`)).length
      : progress.completedMazeIds.length;
    setCompleted(count);
  }, [difficulty]);

  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-slate-700">
        {completed} / {total} complete
      </span>
      <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
