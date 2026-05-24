/**
 * LibraryMazePlayer — client:only React island for /play/library/[id] routes.
 *
 * Follows the DailyMazePlayer pattern:
 *   static preview → fullscreen player on "Play" → custom post-solve overlay.
 */
import { useState, useCallback, useMemo, useEffect } from 'react';
import { generateMazeFromLibraryCatalog } from '../../lib/maze/generator';
import { getNextLibraryMaze } from '../../lib/library/catalog';
import { markLibraryMazeComplete, isLibraryMazeComplete } from '../../lib/library/progress';
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
  const [isComplete, setIsComplete] = useState<boolean | null>(null);

  const nextEntry = useMemo(() => getNextLibraryMaze(entry.id), [entry.id]);

  useEffect(() => {
    setIsComplete(isLibraryMazeComplete(entry.id));
  }, [entry.id]);

  const previewCellSize = useMemo(() => {
    if (typeof window === 'undefined') return 6;
    const w = Math.min(window.innerWidth - 32, 520);
    return Math.max(4, Math.floor(w / maze.width));
  }, [maze.width]);

  const num = String(parseInt(entry.id.split('-')[1] ?? '1', 10)).padStart(3, '0');
  const tierLabel = `${entry.difficulty.charAt(0).toUpperCase()}${entry.difficulty.slice(1)}`;
  const label = `${tierLabel} #${num}`;
  const collectionHref = `/${entry.difficulty}-mazes`;
  const collectionLabel = `${tierLabel} Mazes`;

  const handleSolve = useCallback((stats: SolveStats) => {
    markLibraryMazeComplete(entry.id);
    setIsComplete(true);
    setSolveStats(stats);
  }, [entry.id]);

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
        <div className="flex flex-col items-center gap-4">
          {isComplete !== null && (
            <div className="self-start text-sm">
              {isComplete ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600">
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                  </svg>
                  Complete
                </span>
              ) : (
                <span className="text-slate-400">Not started</span>
              )}
            </div>
          )}

          <div className="w-full max-w-[520px] rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex justify-center p-4">
              <MazeRenderer maze={maze} cellSize={previewCellSize} showEndpointMarkers={false} />
            </div>
          </div>

          <button
            onClick={() => { setPlaying(true); setSolveStats(null); }}
            className="btn-primary rounded-lg px-6 py-3 text-base shadow-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
            {isComplete === true ? 'Play Again' : `Play ${label}`}
          </button>

          <nav className="flex items-center gap-5 text-sm text-slate-500" aria-label="Collection navigation">
            <a href={collectionHref} className="hover:text-slate-700 transition-colors">
              ← {collectionLabel}
            </a>
            <a href="/maze-library" className="hover:text-slate-700 transition-colors">
              Maze Library
            </a>
          </nav>
        </div>
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
