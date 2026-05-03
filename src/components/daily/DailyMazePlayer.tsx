/**
 * DailyMazePlayer — client:only React island for the Maze of the Day page.
 *
 * Matches the generator UX exactly: static preview → fullscreen player on
 * "Play". Runs entirely in the browser. Derives today's UTC date, hashes it
 * to a seed, and generates a 60×60 large maze — same result for every user
 * on the same calendar day, no server or rebuild required.
 */
import { useState, useEffect, useCallback } from 'react';
import { generateMaze } from '../../lib/maze/generator';
import { getMazesByDifficulty } from '../../lib/catalog/index';
import { dateToSeed } from '../../lib/catalog/index';
import { MazeRenderer } from '../maze/MazeRenderer';
import { FullscreenMazePlayer } from '../maze/FullscreenMazePlayer';
import type { SolveStats } from '../maze/FullscreenMazePlayer';
import { PostSolveOverlay } from '../maze/PostSolveOverlay';
import type { PostSolveNav } from '../maze/PostSolveOverlay';
import type { MazeData } from '../../types/maze';

function getUTCDateString(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function DailyMazePlayer({ autoPlay = false }: { autoPlay?: boolean }) {
  const [maze, setMaze] = useState<MazeData | null>(null);
  const [dateLabel, setDateLabel] = useState('');
  const [previewCellSize, setPreviewCellSize] = useState(8);
  const [playing, setPlaying] = useState(false);
  const [solveStats, setSolveStats] = useState<SolveStats | null>(null);
  const [playerKey, setPlayerKey] = useState(0);
  const [postSolveNav, setPostSolveNav] = useState<PostSolveNav | null>(null);

  useEffect(() => {
    const today = getUTCDateString();
    const seed = dateToSeed(today);

    const generated = generateMaze({ width: 60, height: 60, difficulty: 'large', seed });
    generated.id = `daily-${today}`;
    generated.slug = `daily-${today}`;

    // Pick two distinct large catalog mazes deterministically so post-solve
    // "Play Another" and "Random" links are stable across all users today.
    const largePool = getMazesByDifficulty('large');
    const nextMaze = largePool[seed % largePool.length];
    const randomMaze = largePool[(seed + 7) % largePool.length] ?? nextMaze;

    setPostSolveNav({
      nextSlug: nextMaze.slug,
      nextLabel: 'Try Another Maze',
      randomSlug: randomMaze.slug,
      categorySlug: 'large-mazes',
      categoryLabel: 'Large',
    });

    setDateLabel(formatDateLabel(today));

    // Scale the preview to fill the content area (max ~880px) responsively.
    const containerW = Math.min(window.innerWidth - 32, 880);
    setPreviewCellSize(Math.max(6, Math.floor(containerW / 60)));

    setMaze(generated);
    if (autoPlay) setPlaying(true);
  }, []);

  const handleSolve = useCallback((stats: SolveStats) => {
    const today = getUTCDateString();
    localStorage.setItem(`daily_completed_${today}`, 'true');
    window.dispatchEvent(new StorageEvent('storage', {
      key: `daily_completed_${today}`,
      newValue: 'true',
      oldValue: null,
      storageArea: localStorage,
    }));
    setSolveStats(stats);
  }, []);

  function handleClose() {
    setPlaying(false);
    if (autoPlay) window.location.href = '/maze-of-the-day/';
  }

  if (!maze) {
    return <LoadingSkeleton />;
  }

  const mazeLabel = dateLabel ? `Today's Maze — ${dateLabel}` : "Today's Maze";

  return (
    <div>
      {/* Static preview — only shown when not in autoPlay mode */}
      {!autoPlay && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
            <div className="flex justify-center p-4">
              <MazeRenderer maze={maze} cellSize={previewCellSize} />
            </div>
          </div>

          {/* Primary action */}
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => { setPlaying(true); setSolveStats(null); }}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
              Play Today's Maze
            </button>
          </div>
        </>
      )}

      {/* Fullscreen player — takes over the screen, same as the generator */}
      {playing && (
        <FullscreenMazePlayer
          key={playerKey}
          maze={maze}
          label={mazeLabel}
          onSolve={handleSolve}
          onClose={handleClose}
        />
      )}

      {/* Post-solve overlay — rendered above the fullscreen player (z-[60] > z-50) */}
      {solveStats && (
        <div className="fixed inset-0 z-[60]">
          <PostSolveOverlay
            elapsedMs={solveStats.elapsedMs}
            stepCount={solveStats.stepCount}
            hintsUsed={solveStats.hintsUsed}
            isNewBest={solveStats.isNewBest}
            personalBest={null}
            nav={postSolveNav ?? undefined}
            completionCopy="Nice work — you solved today's challenge."
            returnCopy="Come back tomorrow for a fresh challenge."
            showCountdown={true}
            onPlayAgain={() => {
              setSolveStats(null);
              setPlayerKey((k) => k + 1);
            }}
            onClose={() => {
              setSolveStats(null);
              handleClose();
            }}
          />
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50 py-24">
      <svg
        className="w-8 h-8 text-blue-400 animate-spin"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
      </svg>
      <p className="text-sm text-slate-500">Generating today's maze…</p>
    </div>
  );
}
