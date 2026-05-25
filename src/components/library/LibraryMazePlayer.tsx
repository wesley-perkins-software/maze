/**
 * LibraryMazePlayer — client:only React island for /play/library/[id] routes.
 *
 * Follows the DailyMazePlayer pattern:
 *   static preview → fullscreen player on "Play" → custom post-solve overlay.
 */
import { useState, useCallback, useMemo, useEffect } from 'react';
import { generateMazeFromLibraryCatalog, GENERATOR_VERSION } from '../../lib/maze/generator';
import { getNextLibraryMaze, getLibraryMazesByDifficulty } from '../../lib/library/catalog';
import { markLibraryMazeComplete, isLibraryMazeComplete } from '../../lib/library/progress';
import {
  saveLibrarySession,
  loadLibrarySession,
  clearLibrarySession,
} from '../../lib/library/session';
import { MazeRenderer } from '../maze/MazeRenderer';
import { FullscreenMazePlayer } from '../maze/FullscreenMazePlayer';
import type { SolveStats } from '../maze/FullscreenMazePlayer';
import type { GameState } from '../../lib/gameplay/types';
import type { SessionProgress } from '../../lib/library/session';
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

function mazeShortLabel(e: LibraryCatalogEntry): string {
  const n = String(parseInt(e.id.split('-')[1] ?? '1', 10)).padStart(3, '0');
  const tier = e.difficulty.charAt(0).toUpperCase() + e.difficulty.slice(1);
  return `${tier} #${n}`;
}

function buildInitialGameState(p: SessionProgress): GameState {
  return {
    status: p.status === 'idle' ? 'idle' : 'paused',
    playerPosition: p.playerPosition,
    trail: p.trail,
    startTime: null,
    elapsedMs: p.elapsedMs,
    solutionVisible: p.solutionVisible,
    hintsUsed: p.hintsUsed,
    hintCells: [],
  };
}

export function LibraryMazePlayer({ entry }: LibraryMazePlayerProps) {
  const maze = useMemo(() => generateMazeFromLibraryCatalog(entry), [entry.id]);

  const [playing, setPlaying] = useState(false);
  const [playerKey, setPlayerKey] = useState(0);
  const [solveStats, setSolveStats] = useState<SolveStats | null>(null);
  const [isComplete, setIsComplete] = useState<boolean | null>(null);
  const [savedSession, setSavedSession] = useState<ReturnType<typeof loadLibrarySession>>(null);
  const [shouldResume, setShouldResume] = useState(false);

  const nextEntry = useMemo(() => getNextLibraryMaze(entry.id), [entry.id]);

  const adjacentMazes = useMemo(() => {
    const group = getLibraryMazesByDifficulty(entry.difficulty);
    const idx = group.findIndex((m) => m.id === entry.id);
    return {
      prev: idx > 0 ? group[idx - 1]! : null,
      next: idx !== -1 && idx < group.length - 1 ? group[idx + 1]! : null,
    };
  }, [entry.id, entry.difficulty]);

  useEffect(() => {
    setIsComplete(isLibraryMazeComplete(entry.id));
    setSavedSession(loadLibrarySession(entry.id, GENERATOR_VERSION));
  }, [entry.id]);

  const previewMaxWidth = entry.difficulty === 'small' || entry.difficulty === 'medium' ? 480 : 440;

  const previewCellSize = useMemo(() => {
    if (typeof window === 'undefined') return 6;
    const w = Math.min(window.innerWidth - 32, previewMaxWidth);
    return Math.max(4, Math.floor(w / maze.width));
  }, [maze.width, previewMaxWidth]);

  const num = String(parseInt(entry.id.split('-')[1] ?? '1', 10)).padStart(3, '0');
  const tierLabel = `${entry.difficulty.charAt(0).toUpperCase()}${entry.difficulty.slice(1)}`;
  const label = `${tierLabel} #${num}`;
  const collectionHref = `/${entry.difficulty}-mazes`;
  const collectionLabel = `${tierLabel} Mazes`;

  // Completion overrides in-progress — a completed maze never shows "In progress".
  const hasInProgress = savedSession !== null && isComplete !== true;

  const handleSolve = useCallback((stats: SolveStats) => {
    markLibraryMazeComplete(entry.id);
    clearLibrarySession(entry.id);
    setIsComplete(true);
    setSavedSession(null);
    setSolveStats(stats);
  }, [entry.id]);

  const handleClose = useCallback(() => {
    setPlaying(false);
    setShouldResume(false);
    // FullscreenMazePlayer fires onSessionChange synchronously before calling onClose,
    // so we can immediately reload the freshly-saved session here.
    setSavedSession(loadLibrarySession(entry.id, GENERATOR_VERSION));
  }, [entry.id]);

  const handleSessionChange = useCallback((gameState: GameState, showTrail: boolean) => {
    if (gameState.status === 'solved') return;
    saveLibrarySession(entry.id, GENERATOR_VERSION, {
      playerPosition: gameState.playerPosition,
      elapsedMs: gameState.elapsedMs,
      steps: gameState.trail.length,
      hintsUsed: gameState.hintsUsed,
      trail: gameState.trail,
      showTrail,
      solutionVisible: gameState.solutionVisible,
      status: gameState.status,
    } as SessionProgress);
  }, [entry.id]);

  const handleReset = useCallback(() => {
    clearLibrarySession(entry.id);
    setSavedSession(null);
    setShouldResume(false);
  }, [entry.id]);

  const handleResumeCTA = useCallback(() => {
    setShouldResume(true);
    setPlaying(true);
    setSolveStats(null);
  }, []);

  const handlePlayFresh = useCallback(() => {
    setShouldResume(false);
    setPlaying(true);
    setSolveStats(null);
  }, []);

  const handlePlayAgain = useCallback(() => {
    setSolveStats(null);
    setShouldResume(false);
    setPlayerKey((k) => k + 1);
    setPlaying(true);
  }, []);

  const ctaLabel = isComplete === true
    ? 'Play Again'
    : hasInProgress
      ? `Resume ${label}`
      : `Play ${label}`;

  const handleCTA = isComplete === true
    ? handlePlayFresh
    : hasInProgress
      ? handleResumeCTA
      : handlePlayFresh;

  const initialGameState =
    shouldResume && savedSession ? buildInitialGameState(savedSession.progress) : undefined;
  const initialShowTrail =
    shouldResume && savedSession ? savedSession.progress.showTrail : undefined;

  return (
    <div>
      {!playing && (
        <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-8">
          {/* Left column (desktop) / top (mobile): single constrained action stack */}
          <div className="flex flex-col">
            <div className="max-w-[340px] w-full flex flex-col">
              <div>
                <h1 className="text-2xl font-bold leading-tight text-[var(--color-charcoal)]">
                  {tierLabel} Maze #{num}
                </h1>
                <p className="mt-1 text-base text-[var(--color-muted-strong)]">
                  Part of the{' '}
                  <a href={collectionHref} className="hover:text-[var(--color-charcoal)] transition-colors">
                    {collectionLabel}
                  </a>{' '}
                  collection.
                </p>
              </div>

              {isComplete !== null && (
                <div className="mt-3 text-sm">
                  {isComplete ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600">
                      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                      </svg>
                      Complete
                    </span>
                  ) : hasInProgress ? (
                    <span className="text-amber-600 font-medium">In progress</span>
                  ) : (
                    <span className="text-[var(--color-muted)]">Not started</span>
                  )}
                </div>
              )}

              {/* Desktop-only: CTA + nav, top-aligned within the constrained stack */}
              <div className="hidden md:flex flex-col mt-4">
                <button
                  onClick={handleCTA}
                  className="btn-primary w-full rounded-lg px-6 py-3 text-base shadow-sm"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  {ctaLabel}
                </button>

                <div className="flex items-center justify-between gap-2 mt-4 pt-4 border-t border-[var(--color-border)]">
                  {adjacentMazes.prev ? (
                    <a href={`/play/library/${adjacentMazes.prev.id}`} className="inline-flex items-center rounded border border-[var(--color-border-strong)] px-3 py-1.5 text-sm font-medium text-[var(--color-charcoal)] hover:border-[var(--color-charcoal)] hover:bg-[var(--color-border)] transition-colors">
                      ← {mazeShortLabel(adjacentMazes.prev)}
                    </a>
                  ) : (
                    <span aria-hidden="true" />
                  )}
                  {adjacentMazes.next ? (
                    <a href={`/play/library/${adjacentMazes.next.id}`} className="inline-flex items-center rounded border border-[var(--color-border-strong)] px-3 py-1.5 text-sm font-medium text-[var(--color-charcoal)] hover:border-[var(--color-charcoal)] hover:bg-[var(--color-border)] transition-colors">
                      {mazeShortLabel(adjacentMazes.next)} →
                    </a>
                  ) : (
                    <span aria-hidden="true" />
                  )}
                </div>

                <nav className="flex items-center justify-center gap-3 mt-2 text-sm" aria-label="Collection navigation">
                  <a href={collectionHref} className="font-medium text-[var(--color-muted-strong)] underline-offset-4 hover:text-[var(--color-charcoal)] hover:underline transition-colors">← Back to {collectionLabel}</a>
                  <span aria-hidden="true" className="text-[var(--color-muted)]">·</span>
                  <a href="/maze-library" className="font-medium text-[var(--color-muted-strong)] underline-offset-4 hover:text-[var(--color-charcoal)] hover:underline transition-colors">Maze Library</a>
                </nav>
              </div>
            </div>
          </div>

          {/* Preview card — right column (desktop) / middle (mobile) */}
          <div className={`shrink-0 mx-auto md:mx-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-adaptive overflow-hidden ${
            previewMaxWidth === 480
              ? 'w-full max-w-[480px] md:w-[480px]'
              : 'w-full max-w-[440px] md:w-[440px]'
          }`}>
            <div className="flex justify-center p-4">
              <MazeRenderer maze={maze} cellSize={previewCellSize} showEndpointMarkers={false} />
            </div>
          </div>

          {/* Mobile-only: CTA, prev/next, broader nav — below preview */}
          <div className="md:hidden flex flex-col items-center gap-3">
            <button
              onClick={handleCTA}
              className="btn-primary rounded-lg px-6 py-3 text-base shadow-sm"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
              {ctaLabel}
            </button>

            <div className="flex items-center justify-between w-full gap-2">
              {adjacentMazes.prev ? (
                <a href={`/play/library/${adjacentMazes.prev.id}`} className="inline-flex items-center rounded border border-[var(--color-border-strong)] px-3 py-1.5 text-sm font-medium text-[var(--color-charcoal)] hover:border-[var(--color-charcoal)] hover:bg-[var(--color-border)] transition-colors">
                  ← {mazeShortLabel(adjacentMazes.prev)}
                </a>
              ) : (
                <span aria-hidden="true" />
              )}
              {adjacentMazes.next ? (
                <a href={`/play/library/${adjacentMazes.next.id}`} className="inline-flex items-center rounded border border-[var(--color-border-strong)] px-3 py-1.5 text-sm font-medium text-[var(--color-charcoal)] hover:border-[var(--color-charcoal)] hover:bg-[var(--color-border)] transition-colors">
                  {mazeShortLabel(adjacentMazes.next)} →
                </a>
              ) : (
                <span aria-hidden="true" />
              )}
            </div>

            <nav className="flex items-center gap-3 text-sm" aria-label="Collection navigation">
              <a href={collectionHref} className="font-medium text-[var(--color-muted-strong)] underline-offset-4 hover:text-[var(--color-charcoal)] hover:underline transition-colors">← Back to {collectionLabel}</a>
              <span aria-hidden="true" className="text-[var(--color-muted)]">·</span>
              <a href="/maze-library" className="font-medium text-[var(--color-muted-strong)] underline-offset-4 hover:text-[var(--color-charcoal)] hover:underline transition-colors">Maze Library</a>
            </nav>
          </div>
        </div>
      )}

      {playing && (
        <FullscreenMazePlayer
          key={playerKey}
          maze={maze}
          label={label}
          onSolve={handleSolve}
          onClose={handleClose}
          onSessionChange={handleSessionChange}
          onReset={handleReset}
          initialGameState={initialGameState}
          initialShowTrail={initialShowTrail}
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
