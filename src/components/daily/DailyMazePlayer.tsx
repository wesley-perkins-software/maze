/**
 * DailyMazePlayer — client:only React island for the Maze of the Day page.
 *
 * Matches the generator UX exactly: static preview → fullscreen player on
 * "Play". Runs entirely in the browser. Derives today's local calendar date,
 * hashes it to a seed, and generates a 60×60 large maze — same result for
 * every user on the same local calendar day, no server or rebuild required.
 * The maze resets at local midnight.
 *
 * Save/resume: progress is autosaved via onSessionChange (debounced + on
 * exit/visibilitychange/pagehide). On return to this page a resume card
 * appears immediately; "Resume" restores position/trail/time, "Restart"
 * clears the saved session and starts from the beginning.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { generateMaze, GENERATOR_VERSION } from '../../lib/maze/generator';
import { getMazesByDifficulty } from '../../lib/catalog/index';
import { MazeRenderer } from '../maze/MazeRenderer';
import { FullscreenMazePlayer } from '../maze/FullscreenMazePlayer';
import type { SolveStats } from '../maze/FullscreenMazePlayer';
import { PostSolveOverlay } from '../maze/PostSolveOverlay';
import type { PostSolveNav } from '../maze/PostSolveOverlay';
import type { MazeData } from '../../types/maze';
import type { GameState } from '../../lib/gameplay/types';
import {
  saveDailySession,
  loadDailySession,
  clearDailySession,
} from '../../lib/gameplay/dailySession';
import type { DailyMazeSession } from '../../lib/gameplay/dailySession';

function getLocalDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dailyMazeSeed(dateStr: string): number {
  const input = `maze-of-the-day:${dateStr}:v${GENERATOR_VERSION}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatResumeTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0) return `${s} second${s !== 1 ? 's' : ''}`;
  if (rem === 0) return `${m} minute${m !== 1 ? 's' : ''}`;
  return `${m} minute${m !== 1 ? 's' : ''} ${rem} second${rem !== 1 ? 's' : ''}`;
}

export function DailyMazePlayer({ autoPlay = false }: { autoPlay?: boolean }) {
  const [maze, setMaze] = useState<MazeData | null>(null);
  const [dateLabel, setDateLabel] = useState('');
  const [previewCellSize, setPreviewCellSize] = useState(8);
  const [playing, setPlaying] = useState(false);
  const [solveStats, setSolveStats] = useState<SolveStats | null>(null);
  const [playerKey, setPlayerKey] = useState(0);
  const [postSolveNav, setPostSolveNav] = useState<PostSolveNav | null>(null);

  // ── Session state ────────────────────────────────────────────────────────────
  const [resumeSession, setResumeSession] = useState<DailyMazeSession | null>(null);
  const [initialGameState, setInitialGameState] = useState<GameState | undefined>(undefined);
  const [initialShowTrail, setInitialShowTrail] = useState<boolean | undefined>(undefined);
  // Stable ref so autosave callback never captures a stale maze.
  const mazeRef = useRef<MazeData | null>(null);

  useEffect(() => {
    const today = getLocalDateString();
    const seed = dailyMazeSeed(today);

    const generated = generateMaze({ width: 60, height: 60, difficulty: 'large', seed, anyPortalSide: true });
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

    mazeRef.current = generated;
    setMaze(generated);

    // Load any saved progress for today; only restores if date + seed + version match.
    const saved = loadDailySession(GENERATOR_VERSION, today, seed);
    if (saved) setResumeSession(saved);

    if (autoPlay) setPlaying(true);
  }, []);

  // ── Autosave ─────────────────────────────────────────────────────────────────
  const handleSessionChange = useCallback((gameState: GameState, showTrail: boolean) => {
    const currentMaze = mazeRef.current;
    if (!currentMaze || gameState.status === 'solved') return;
    saveDailySession({
      generatorVersion: GENERATOR_VERSION,
      localDate: getLocalDateString(),
      maze: {
        width: currentMaze.width,
        height: currentMaze.height,
        seed: currentMaze.seed,
        difficulty: 'large',
        label: 'Large',
        anyPortalSide: true,
      },
      progress: {
        playerPosition: gameState.playerPosition,
        elapsedMs: gameState.elapsedMs,
        steps: gameState.trail.length,
        hintsUsed: gameState.hintsUsed,
        trail: gameState.trail,
        showTrail,
        solutionVisible: gameState.solutionVisible,
        status: gameState.status,
      },
    });
  }, []);

  // ── Resume saved session ─────────────────────────────────────────────────────
  const handleResume = useCallback(() => {
    if (!resumeSession) return;
    const { progress } = resumeSession;

    // Maze is already generated in state (same seed); just inject saved GameState.
    const restored: GameState = {
      status: progress.status === 'idle' ? 'idle' : 'paused',
      playerPosition: progress.playerPosition,
      trail: progress.trail,
      startTime: null,
      elapsedMs: progress.elapsedMs,
      solutionVisible: progress.solutionVisible,
      hintsUsed: progress.hintsUsed,
      hintCells: [],
    };

    setInitialGameState(restored);
    setInitialShowTrail(progress.showTrail);
    setResumeSession(null);
    setPlaying(true);
  }, [resumeSession]);

  // ── Restart (clear saved progress and start from beginning) ─────────────────
  const handleRestart = useCallback(() => {
    clearDailySession();
    setResumeSession(null);
    setInitialGameState(undefined);
    setInitialShowTrail(undefined);
    setSolveStats(null);
    setPlayerKey((k) => k + 1);
    setPlaying(true);
  }, []);

  // ── Solve ────────────────────────────────────────────────────────────────────
  const handleSolve = useCallback((stats: SolveStats) => {
    clearDailySession();
    const today = getLocalDateString();
    localStorage.setItem(`daily_completed_${today}`, 'true');
    window.dispatchEvent(new StorageEvent('storage', {
      key: `daily_completed_${today}`,
      newValue: 'true',
      oldValue: null,
      storageArea: localStorage,
    }));
    setSolveStats(stats);
  }, []);

  // ── Exit fullscreen player ───────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    setPlaying(false);
    setInitialGameState(undefined);
    setInitialShowTrail(undefined);
    // Reload session so the resume card appears immediately on the preview page
    // (the player saved synchronously before calling onClose).
    const today = getLocalDateString();
    const currentMaze = mazeRef.current;
    if (currentMaze) {
      const saved = loadDailySession(GENERATOR_VERSION, today, currentMaze.seed);
      setResumeSession(saved);
    }
    if (autoPlay) window.location.href = '/maze-of-the-day/';
  }, [autoPlay]);

  if (!maze) {
    return <LoadingSkeleton />;
  }

  const mazeLabel = dateLabel ? `Today's Maze — ${dateLabel}` : "Today's Maze";

  // Resume card metadata
  const showResumeCard = resumeSession !== null && !playing && !solveStats;
  const resumeTimeStr = resumeSession && resumeSession.progress.elapsedMs >= 1000
    ? formatResumeTime(resumeSession.progress.elapsedMs)
    : null;
  const resumeSteps = resumeSession?.progress.steps ?? 0;
  const resumeStepWord = resumeSteps === 1 ? 'step' : 'steps';
  const resumeDetail = resumeSteps === 0 && !resumeTimeStr
    ? 'Not started'
    : resumeTimeStr
      ? `${resumeTimeStr} · ${resumeSteps.toLocaleString()} ${resumeStepWord}`
      : `${resumeSteps.toLocaleString()} ${resumeStepWord}`;

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

          {/* Resume card — shown when there is unfinished progress for today */}
          {showResumeCard && (
            <div
              className="mt-4 rounded-sm border border-slate-200 bg-white px-4 py-3 flex flex-col gap-3"
              role="region"
              aria-label="Unfinished daily maze session"
            >
              <div>
                <p className="text-sm font-semibold text-slate-800 leading-snug">
                  Unfinished daily maze
                </p>
                <p className="mt-0.5 text-xs font-mono text-slate-500 leading-snug">
                  Large · {resumeDetail}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleResume}
                  className="flex-1 rounded-sm bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 transition-colors"
                >
                  Resume
                </button>
                <button
                  onClick={handleRestart}
                  className="flex-1 rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-400 hover:text-slate-800 transition-colors"
                >
                  Restart
                </button>
              </div>
            </div>
          )}

          {/* Primary action — hidden when resume card is shown */}
          {!showResumeCard && (
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
          )}
        </>
      )}

      {/* Fullscreen player — takes over the screen, same as the generator */}
      {playing && (
        <FullscreenMazePlayer
          key={playerKey}
          maze={maze}
          initialGameState={initialGameState}
          initialShowTrail={initialShowTrail}
          label={mazeLabel}
          onSessionChange={handleSessionChange}
          onReset={clearDailySession}
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
              setInitialGameState(undefined);
              setInitialShowTrail(undefined);
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
