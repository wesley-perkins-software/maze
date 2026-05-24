/**
 * LibraryMazePlayer — client:only React island for /play/library/[id] routes.
 *
 * Follows the DailyMazePlayer pattern:
 *   static preview → fullscreen player on "Play" → custom post-solve overlay.
 *
 * No session saving in PR 2. Completion marking is wired in PR 4.
 */
import { useState, useCallback, useMemo } from 'react';
import { generateMazeFromLibraryCatalog } from '../../lib/maze/generator';
import { getNextLibraryMaze } from '../../lib/library/catalog';
import { MazeRenderer } from '../maze/MazeRenderer';
import { FullscreenMazePlayer } from '../maze/FullscreenMazePlayer';
import type { SolveStats } from '../maze/FullscreenMazePlayer';
import type { LibraryCatalogEntry } from '../../types/maze';

export interface LibraryMazePlayerProps {
  entry: LibraryCatalogEntry;
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${s}s`;
  return sec === 0 ? `${m}m` : `${m}m ${sec}s`;
}

function formatNum(n: number): string {
  return n.toLocaleString();
}

export function LibraryMazePlayer({ entry }: LibraryMazePlayerProps) {
  const maze = useMemo(() => generateMazeFromLibraryCatalog(entry), [entry.id]);

  const [playing, setPlaying] = useState(false);
  const [playerKey, setPlayerKey] = useState(0);
  const [solveStats, setSolveStats] = useState<SolveStats | null>(null);

  const nextEntry = useMemo(() => getNextLibraryMaze(entry.id), [entry.id]);

  const previewCellSize = useMemo(() => {
    if (typeof window === 'undefined') return 6;
    const w = Math.min(window.innerWidth - 32, 880);
    return Math.max(4, Math.floor(w / maze.width));
  }, [maze.width]);

  const num = String(parseInt(entry.id.split('-')[1] ?? '1', 10)).padStart(3, '0');
  const label = `${entry.difficulty.charAt(0).toUpperCase()}${entry.difficulty.slice(1)} #${num}`;
  const collectionHref = `/${entry.difficulty}-mazes`;

  const handleSolve = useCallback((stats: SolveStats) => {
    setSolveStats(stats);
  }, []);

  const handleClose = useCallback(() => {
    setPlaying(false);
  }, []);

  const handlePlayAgain = useCallback(() => {
    setSolveStats(null);
    setPlayerKey((k) => k + 1);
    setPlaying(true);
  }, []);

  return (
    <div>
      {!playing && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
            <div className="flex justify-center p-4">
              <MazeRenderer maze={maze} cellSize={previewCellSize} />
            </div>
          </div>

          <div className="mt-4 flex justify-center">
            <button
              onClick={() => { setPlaying(true); setSolveStats(null); }}
              className="btn-primary rounded-lg px-6 py-3 text-base shadow-sm"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
              Play {label}
            </button>
          </div>
        </>
      )}

      {playing && (
        <FullscreenMazePlayer
          key={playerKey}
          maze={maze}
          label={label}
          onSolve={handleSolve}
          onClose={handleClose}
        />
      )}

      {solveStats && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xs rounded-2xl bg-white shadow-2xl p-6 flex flex-col gap-5">
            <div className="text-center">
              <p className="text-3xl mb-1">✓</p>
              <h2 className="text-xl font-bold text-slate-900">Maze Complete!</h2>
              <p className="mt-1 text-sm text-slate-500">{label}</p>
            </div>

            <div className="flex justify-around text-center">
              <div>
                <p className="text-2xl font-bold font-mono text-slate-900">
                  {formatTime(solveStats.elapsedMs)}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Time</p>
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-slate-900">
                  {formatNum(solveStats.stepCount)}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Steps</p>
              </div>
              {solveStats.hintsUsed > 0 && (
                <div>
                  <p className="text-2xl font-bold font-mono text-slate-900">
                    {solveStats.hintsUsed}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">Hints</p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {nextEntry && (
                <a
                  href={`/play/library/${nextEntry.id}`}
                  className="btn-primary w-full text-center rounded-lg py-2.5"
                >
                  Next Maze
                </a>
              )}
              <a
                href={collectionHref}
                className="w-full text-center rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Browse Collection
              </a>
              <button
                onClick={handlePlayAgain}
                className="w-full rounded-lg py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
              >
                Play Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
