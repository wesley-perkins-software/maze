import { useState, useCallback, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { Difficulty, MazeData, Point } from '../../types/maze';
import { generateMaze, GENERATOR_VERSION } from '../../lib/maze/index';
import { getMazeDebugSummary, shouldLogMazeStateDebug } from '../../lib/maze/fingerprint';
import { MazeRenderer } from './MazeRenderer';
import { FullscreenMazePlayer } from './FullscreenMazePlayer';
import type { SolveStats } from './FullscreenMazePlayer';
import { PostSolveOverlay } from './PostSolveOverlay';
import { renderDownloadSVG } from '../../lib/svg/renderToString';
import { getEndpointMarkerCenter, getMazeBodyBounds, inferPortalSide, warnInvalidPortalSide } from '../../lib/maze/endpointMarkers';
import { DEFAULT_START_ARROW_POINTS, FinishMarkerIcon, StartMarkerIcon } from './EndpointMarkerGlyphs';
import type { PortalSide } from '../../lib/maze/endpointMarkers';
import {
  loadGeneratedSession,
  saveGeneratedSession,
  clearGeneratedSession,
  isSameGeneratedMazeIdentity,
} from '../../lib/gameplay/session';
import type { GeneratedMazeSession } from '../../lib/gameplay/session';
import type { GameState } from '../../lib/gameplay/types';
import {
  trackMazeStarted,
  trackMazeCompleted,
  trackSessionResumed,
  trackMazeGenerated,
  trackMazeSizeSelected,
  trackMazePrinted,
  trackMazeDownloaded,
} from '../../lib/analytics';

type SizePreset = 'small' | 'medium' | 'large' | 'expert' | 'hardcore';

const SIZE_OPTIONS: { value: SizePreset; label: string; detail: string }[] = [
  { value: 'small',   label: 'Small',   detail: '20 × 20' },
  { value: 'medium',  label: 'Medium',  detail: '40 × 40' },
  { value: 'large',   label: 'Large',   detail: '60 × 60' },
  { value: 'expert',  label: 'Expert',  detail: '80 × 80' },
  { value: 'hardcore', label: 'Hardcore', detail: '100 × 100' },
];

const SIZE_MAP: Record<SizePreset, { w: number; h: number }> = {
  small:   { w: 20,  h: 20 },
  medium:  { w: 40,  h: 40 },
  large:   { w: 60,  h: 60 },
  expert:  { w: 80,  h: 80 },
  hardcore: { w: 100, h: 100 },
};

export const CUSTOM_RANGE = { min: 10, max: 100 };

const PREVIEW_PADDING = 6;
const PREVIEW_ENDPOINT_MARKER_SIZE_PX = 28;
const PREVIEW_ENDPOINT_MARKER_RADIUS_PX = PREVIEW_ENDPOINT_MARKER_SIZE_PX / 2;
export const GENERATOR_PREVIEW_ENDPOINT_GAP_PX = -1;
const PREVIEW_MARKER_OUTSIDE_OFFSET_PX = PREVIEW_ENDPOINT_MARKER_RADIUS_PX + GENERATOR_PREVIEW_ENDPOINT_GAP_PX;

function formatPercent(value: number, total: number): string {
  return `${(value / total) * 100}%`;
}

function offsetFromEdge(value: string, side: PortalSide, offsetPx: number): string {
  if (side === 'top' || side === 'left') return `calc(${value} - ${offsetPx}px)`;
  if (side === 'bottom' || side === 'right') return `calc(${value} + ${offsetPx}px)`;
  return value;
}

export function getPreviewMarkerPosition(
  maze: MazeData,
  point: Point,
  cellSize: number,
  label = 'endpoint',
): CSSProperties | null {
  const totalW = maze.width * cellSize + PREVIEW_PADDING * 2;
  const totalH = maze.height * cellSize + PREVIEW_PADDING * 2;
  const side = inferPortalSide(maze, point);

  if (!side) {
    warnInvalidPortalSide(maze, point, label);
    return null;
  }

  // The preview marker artwork is a fixed-size HTML/SVG overlay, not part of
  // the scaled maze SVG. Use the shared geometry helper to find the portal's
  // border anchor in maze coordinates, then apply the perpendicular outside
  // projection in CSS pixels so large mazes do not cover the marker visually.
  // The generator preview intentionally uses a slightly tighter, preview-only
  // gap than shared playable/minimap marker placement.
  const borderAnchor = getEndpointMarkerCenter({
    mazeWidth: maze.width,
    mazeHeight: maze.height,
    cellSize,
    bounds: getMazeBodyBounds(maze.width, maze.height, cellSize, PREVIEW_PADDING),
    portal: point,
    portalSide: side,
    markerRadius: 0,
    placementMode: 'outside',
    outsideGap: 0,
  });
  const left = formatPercent(borderAnchor.x, totalW);
  const top = formatPercent(borderAnchor.y, totalH);
  const position = {
    left: side === 'left' || side === 'right' ? offsetFromEdge(left, side, PREVIEW_MARKER_OUTSIDE_OFFSET_PX) : left,
    top: side === 'top' || side === 'bottom' ? offsetFromEdge(top, side, PREVIEW_MARKER_OUTSIDE_OFFSET_PX) : top,
  } satisfies CSSProperties;

  if (import.meta.env.DEV && typeof window !== 'undefined' && window.localStorage.getItem('maze:endpoint-debug') === '1') {
    console.debug('[maze:endpoint-marker] preview marker', {
      label,
      point,
      side,
      bounds: getMazeBodyBounds(maze.width, maze.height, cellSize, PREVIEW_PADDING),
      borderAnchor,
      position,
      maze: { slug: maze.slug, width: maze.width, height: maze.height, seed: maze.seed },
    });
  }

  return position;
}

function getPreviewEntryArrowPoints(maze: MazeData): string {
  const { entry } = maze;

  const side = inferPortalSide(maze, entry);

  if (!side) {
    warnInvalidPortalSide(maze, entry, 'entry');
    return DEFAULT_START_ARROW_POINTS;
  }

  if (side === 'top') return DEFAULT_START_ARROW_POINTS;
  if (side === 'bottom') return '6.72,15.08 17.28,15.08 12,7.16';
  if (side === 'left') return '8.92,6.72 16.84,12 8.92,17.28';
  if (side === 'right') return '15.08,6.72 7.16,12 15.08,17.28';

  return DEFAULT_START_ARROW_POINTS;
}

function PreviewEndpointMarkers({ maze, cellSize }: { maze: MazeData; cellSize: number }) {
  const markerBase = 'pointer-events-none absolute z-10 h-6 w-6 -translate-x-1/2 -translate-y-1/2 overflow-visible drop-shadow-[0_2px_4px_rgba(15,23,42,0.32)] md:h-7 md:w-7';
  const entryArrowPoints = getPreviewEntryArrowPoints(maze);
  const entryStyle = getPreviewMarkerPosition(maze, maze.entry, cellSize, 'entry');
  const exitStyle = getPreviewMarkerPosition(maze, maze.exit, cellSize, 'exit');

  return (
    <>
      {entryStyle && (
      <svg
        viewBox="0 0 24 24"
        className={markerBase}
        style={entryStyle}
        aria-hidden="true"
      >
        <StartMarkerIcon arrowPoints={entryArrowPoints} />
      </svg>
      )}
      {exitStyle && (
      <svg
        viewBox="0 0 24 24"
        className={markerBase}
        style={exitStyle}
        aria-hidden="true"
      >
        <FinishMarkerIcon />
      </svg>
      )}
    </>
  );
}

function PreviewStartLegend({ arrowPoints }: { arrowPoints: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium leading-none text-arch-600 sm:text-[13px]">
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0 overflow-visible sm:h-5 sm:w-5" aria-hidden="true">
        <StartMarkerIcon arrowPoints={arrowPoints} />
      </svg>
      Start
    </span>
  );
}

function PreviewFinishLegend() {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium leading-none text-arch-600 sm:text-[13px]">
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0 overflow-visible sm:h-5 sm:w-5" aria-hidden="true">
        <FinishMarkerIcon />
      </svg>
      Finish
    </span>
  );
}

function presetDifficulty(preset: SizePreset): Difficulty {
  if (preset === 'expert' || preset === 'hardcore') return 'large';
  return preset;
}

function createInitialMaze() {
  const { w, h } = SIZE_MAP.medium;
  const seed = newSeed();

  return generateMaze({ width: w, height: h, difficulty: 'medium', seed, anyPortalSide: true });
}

function logMazeStateDebug(label: string, maze: MazeData) {
  if (!shouldLogMazeStateDebug()) return;

  console.debug(`[maze:state] ${label}`, getMazeDebugSummary(maze));
}

function newSeed() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }

  return Math.floor(Math.random() * 0xffffffff);
}

export function difficultyForCustomSize(w: number, h: number): Difficulty {
  const area = w * h;
  const smallArea  = SIZE_MAP.small.w  * SIZE_MAP.small.h;
  const mediumArea = SIZE_MAP.medium.w * SIZE_MAP.medium.h;
  const largeArea  = SIZE_MAP.large.w  * SIZE_MAP.large.h;

  const smallMediumMidpoint = (smallArea  + mediumArea) / 2;
  const mediumLargeMidpoint = (mediumArea + largeArea)  / 2;

  if (area <= smallMediumMidpoint) return 'small';
  if (area <= mediumLargeMidpoint) return 'medium';
  return 'large';
}

function formatResumeTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0) return `${s} second${s !== 1 ? 's' : ''}`;
  if (rem === 0) return `${m} minute${m !== 1 ? 's' : ''}`;
  return `${m} minute${m !== 1 ? 's' : ''} ${rem} second${rem !== 1 ? 's' : ''}`;
}


function ResumeBanner({
  session,
  onResume,
  onDiscard,
}: {
  session: GeneratedMazeSession;
  onResume: () => void;
  onDiscard: () => void;
}) {
  const { maze: m, progress } = session;

  // Only show elapsed time once at least 1 second has passed; avoid "0 seconds".
  const timeStr = progress.elapsedMs >= 1000 ? formatResumeTime(progress.elapsedMs) : null;
  const stepWord = progress.steps === 1 ? 'step' : 'steps';
  const detail = progress.steps === 0 && !timeStr
    ? 'Not started'
    : timeStr
      ? `${timeStr} · ${progress.steps.toLocaleString()} ${stepWord}`
      : `${progress.steps.toLocaleString()} ${stepWord}`;

  return (
    <div
      className="rounded-sm border border-arch-200 bg-arch-surface px-4 py-3 flex flex-col gap-3"
      role="region"
      aria-label="Unfinished maze session"
    >
      <div>
        <p className="text-sm font-semibold text-arch-charcoal leading-snug">
          You have an unfinished maze.
        </p>
        <p className="mt-0.5 text-xs font-mono text-arch-600 leading-snug">
          {(m.label && m.label.trim().length > 0) ? m.label : `${m.width} × ${m.height}`} · {detail}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onResume}
          className="btn-primary flex-1 justify-center rounded-sm px-3 py-2 text-sm font-semibold"
        >
          Resume
        </button>
        <button
          onClick={onDiscard}
          className="btn-secondary flex-1 justify-center rounded-sm px-3 py-2 text-sm font-medium"
        >
          Discard
        </button>
      </div>
    </div>
  );
}

export function MazeGenerator() {
  const [sizePreset, setSizePreset] = useState<SizePreset>('medium');
  const [showCustom, setShowCustom] = useState(false);
  const [customWidth,  setCustomWidth]  = useState(40);
  const [customHeight, setCustomHeight] = useState(40);
  const [playing,   setPlaying]   = useState(false);
  const [solveStats, setSolveStats] = useState<SolveStats | null>(null);
  const [playerKey, setPlayerKey] = useState(0);
  const [printRoot, setPrintRoot] = useState<HTMLElement | null>(null);
  const hasPlayedRef = useRef(false);
  const lastSeedRef = useRef<number | null>(null);
  const customPreviewTimerRef = useRef<number | null>(null);
  const customPreviewRequestRef = useRef(0);

  // ── Session state ─────────────────────────────────────────────────────────────
  const [resumeSession, setResumeSession] = useState<GeneratedMazeSession | null>(null);
  // Injected into FullscreenMazePlayer to restore a saved session.
  const [initialGameState, setInitialGameState] = useState<GameState | undefined>(undefined);
  const [initialShowTrail, setInitialShowTrail] = useState<boolean | undefined>(undefined);
  // Mirror of maze ref so autosave callback can read it without a stale closure.
  const mazeRef = useRef<MazeData | null>(null);
  const presetLabelRef = useRef<string>('Medium');


  useEffect(() => {
    setPrintRoot(document.body);
  }, []);

  // Load any saved session on mount.
  useEffect(() => {
    const session = loadGeneratedSession(GENERATOR_VERSION);
    if (session) setResumeSession(session);
  }, []);

  const getDimensions = useCallback(
    () => showCustom ? { w: customWidth, h: customHeight } : SIZE_MAP[sizePreset],
    [showCustom, customWidth, customHeight, sizePreset],
  );

  const [maze, setMaze] = useState(() => {
    const initialMaze = createInitialMaze();
    lastSeedRef.current = initialMaze.seed;
    mazeRef.current = initialMaze;
    return initialMaze;
  });

  const nextSeed = useCallback(() => {
    let seed = newSeed();

    while (seed === lastSeedRef.current) {
      seed = newSeed();
    }

    lastSeedRef.current = seed;
    return seed;
  }, []);

  const cancelScheduledCustomPreview = useCallback(() => {
    if (customPreviewTimerRef.current !== null) {
      window.clearTimeout(customPreviewTimerRef.current);
      customPreviewTimerRef.current = null;
    }

    customPreviewRequestRef.current += 1;
  }, []);

  useEffect(() => {
    logMazeStateDebug('preview render', maze);
  }, [maze]);

  const generate = useCallback((preset: SizePreset | null, dims: { w: number; h: number }, lightMode = false) => {
    const difficulty: Difficulty = preset
      ? presetDifficulty(preset)
      : difficultyForCustomSize(dims.w, dims.h);
    const m = generateMaze({ width: dims.w, height: dims.h, difficulty, seed: nextSeed(), anyPortalSide: true, lightMode });
    setMaze(m);
    mazeRef.current = m;
    setPlaying(false);
    setSolveStats(null);
    // Reset any pending restored state when a fresh maze is generated.
    setInitialGameState(undefined);
    setInitialShowTrail(undefined);
  }, [nextSeed]);

  useEffect(() => {
    if (!showCustom) {
      cancelScheduledCustomPreview();
      return;
    }

    const requestId = customPreviewRequestRef.current + 1;
    customPreviewRequestRef.current = requestId;

    if (customPreviewTimerRef.current !== null) {
      window.clearTimeout(customPreviewTimerRef.current);
    }

    customPreviewTimerRef.current = window.setTimeout(() => {
      customPreviewTimerRef.current = null;

      if (customPreviewRequestRef.current !== requestId) return;

      generate(null, { w: customWidth, h: customHeight }, true);
    }, 220);

    return () => {
      if (customPreviewTimerRef.current !== null) {
        window.clearTimeout(customPreviewTimerRef.current);
        customPreviewTimerRef.current = null;
      }
    };
  }, [showCustom, customWidth, customHeight, generate, cancelScheduledCustomPreview]);

  const handleSizeChange = useCallback((s: SizePreset) => {
    cancelScheduledCustomPreview();
    setSizePreset(s);
    setShowCustom(false);
    generate(s, SIZE_MAP[s]);
    trackMazeSizeSelected('generator', s);
  }, [generate, cancelScheduledCustomPreview]);

  const handleGenerate = useCallback(() => {
    cancelScheduledCustomPreview();

    if (resumeSession) {
      clearGeneratedSession();
      setResumeSession(null);
    }

    if (showCustom) {
      generate(null, { w: customWidth, h: customHeight });
      trackMazeGenerated({
        maze_context: 'generator',
        maze_difficulty: 'custom',
        maze_size: `${customWidth}x${customHeight}`,
        width: customWidth,
        height: customHeight,
      });
    } else {
      generate(sizePreset, SIZE_MAP[sizePreset]);
      trackMazeGenerated({
        maze_context: 'generator',
        maze_difficulty: sizePreset,
        maze_size: `${SIZE_MAP[sizePreset].w}x${SIZE_MAP[sizePreset].h}`,
        width: SIZE_MAP[sizePreset].w,
        height: SIZE_MAP[sizePreset].h,
      });
    }
  }, [showCustom, customWidth, customHeight, sizePreset, generate, cancelScheduledCustomPreview, resumeSession]);

  const isPreviewSameAsSavedSession = resumeSession
    ? isSameGeneratedMazeIdentity(resumeSession, maze, GENERATOR_VERSION)
    : false;

  const handlePlay = useCallback(() => {
    if (resumeSession) {
      clearGeneratedSession();
      setResumeSession(null);
    }
    logMazeStateDebug('play click', maze);
    hasPlayedRef.current = true;
    setInitialGameState(undefined);
    setInitialShowTrail(undefined);
    setPlaying(true);
    trackMazeStarted({
      maze_context: 'generator',
      maze_size: `${maze.width}x${maze.height}`,
      maze_difficulty: showCustom ? 'custom' : sizePreset,
    });
  }, [maze, resumeSession, showCustom, sizePreset]);

  const handleResume = useCallback(() => {
    if (!resumeSession) return;
    trackSessionResumed({
      maze_context: 'generator',
      maze_size: `${resumeSession.maze.width}x${resumeSession.maze.height}`,
      maze_difficulty: resumeSession.maze.difficulty ?? 'custom',
    });
    const { maze: m, progress } = resumeSession;

    const restoredMaze = generateMaze({
      width: m.width,
      height: m.height,
      difficulty: m.difficulty,
      seed: m.seed,
      anyPortalSide: true,
    });

    // Restore as 'paused' (or 'idle' if the session never started) so the
    // timer doesn't run until the player explicitly resumes. The RESUME reducer
    // action recalculates startTime = Date.now() - elapsedMs, meaning time
    // spent away from the page is never counted.
    const restored: GameState = {
      status: progress.status === 'idle' ? 'idle' : 'paused',
      playerPosition: progress.playerPosition,
      trail: progress.trail,
      startTime: null,
      elapsedMs: progress.elapsedMs,
      solutionVisible: progress.solutionVisible,
      hintsUsed: progress.hintsUsed,
      // hintCells are intentionally not restored — they are transient, derived
      // from the current position and solver. Player can re-request a hint.
      hintCells: [],
    };

    setMaze(restoredMaze);
    mazeRef.current = restoredMaze;
    lastSeedRef.current = restoredMaze.seed;
    setInitialGameState(restored);
    setInitialShowTrail(progress.showTrail);
    setResumeSession(null);
    hasPlayedRef.current = true;
    setPlaying(true);
    logMazeStateDebug('resume click', restoredMaze);
  }, [resumeSession]);

  // "Discard" in the resume banner — clears the saved session and hides the card.
  // Does NOT start a maze, generate a maze, or change the current preview.
  // The user can use normal generator controls to start a fresh game.
  const handleDiscard = useCallback(() => {
    clearGeneratedSession();
    setResumeSession(null);
  }, []);

  const handleSolve = useCallback((stats: SolveStats) => {
    clearGeneratedSession();
    setSolveStats(stats);
    trackMazeCompleted({
      maze_context: 'generator',
      maze_size: `${maze.width}x${maze.height}`,
      maze_difficulty: showCustom ? 'custom' : sizePreset,
      elapsed_ms: stats.elapsedMs,
      elapsed_sec: Math.floor(stats.elapsedMs / 1000),
      steps: stats.stepCount,
      hints_used: stats.hintsUsed,
    });
  }, [maze, showCustom, sizePreset]);

  // Autosave callback — called by FullscreenMazePlayer on state changes.
  const handleSessionChange = useCallback((gameState: GameState, showTrail: boolean) => {
    const currentMaze = mazeRef.current;
    if (!currentMaze || gameState.status === 'solved') return;

    saveGeneratedSession({
      generatorVersion: GENERATOR_VERSION,
      maze: {
        width: currentMaze.width,
        height: currentMaze.height,
        seed: currentMaze.seed,
        difficulty: currentMaze.difficulty,
        label: presetLabelRef.current,
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

  // Clear saved session when the player confirms a reset.
  const handleReset = useCallback(() => {
    clearGeneratedSession();
  }, []);

  const handleDownloadSVG = useCallback(() => {
    const svg = renderDownloadSVG(maze);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `maze-${maze.width}x${maze.height}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    trackMazeDownloaded({
      maze_context: 'generator',
      maze_difficulty: showCustom ? 'custom' : sizePreset,
      maze_size: `${maze.width}x${maze.height}`,
      source_page: '/maze-generator',
      file_type: 'svg',
    });
  }, [maze, showCustom, sizePreset]);

  const handlePrint = useCallback(() => {
    window.requestAnimationFrame(() => window.print());
    trackMazePrinted({
      maze_context: 'generator',
      maze_difficulty: showCustom ? 'custom' : sizePreset,
      maze_size: `${maze.width}x${maze.height}`,
      source_page: '/maze-generator',
      include_answer_key: false,
    });
  }, [maze, showCustom, sizePreset]);

  const toggleCustom = useCallback(() => {
    setShowCustom((prev) => {
      if (!prev) {
        const { w, h } = SIZE_MAP[sizePreset];
        setCustomWidth(w);
        setCustomHeight(h);
      }
      return !prev;
    });
  }, [sizePreset]);

  const { w: width, h: height } = getDimensions();
  const cellSize = Math.max(8, Math.min(28, Math.floor(400 / Math.max(width, height))));

  const btnBase    = 'rounded-sm border py-2 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-arch-accent';
  const activeBtn  = 'border-arch-charcoal bg-arch-charcoal text-white dark:bg-arch-dark-surface-raised dark:border-arch-400 dark:text-arch-charcoal';
  const inactiveBtn = 'border-arch-200 bg-arch-surface text-arch-600 hover:border-arch-charcoal hover:text-arch-charcoal hover:bg-arch-bg';

  const presetLabel = showCustom ? 'Custom' : sizePreset.charAt(0).toUpperCase() + sizePreset.slice(1);
  presetLabelRef.current = presetLabel;
  const previewStartArrowPoints = getPreviewEntryArrowPoints(maze);

  const printMaze = (
    <div className="print-only" aria-hidden="true">
      <div className="print-maze-sheet">
        <div className="print-maze-art">
          <MazeRenderer
            maze={maze}
            cellSize={12}
            wallThickness={2}
            padding={6}
            showEndpointMarkers={false}
            showPlayer={false}
            showTrail={false}
            showHintPath={false}
            showSolution={false}
            showPlayerGlow={false}
          />
        </div>
      </div>
    </div>
  );

  return (
    <>
    <div className="screen-only flex flex-col lg:grid lg:grid-cols-[320px_1fr] gap-7 lg:gap-10 lg:items-start">

      {/* ── Maze panel — top on mobile, right column on desktop ── */}
      <div className="min-w-0 w-full lg:col-start-2 lg:row-start-1">

        {/* Preview card — square, viewport-fitted */}
        <div
          className="maze-generator-svg border border-arch-400/60 bg-arch-surface overflow-visible mx-auto"
          style={{
            width: 'min(100%, calc(100vh - 140px))',
            aspectRatio: '1 / 1',
            boxShadow: 'inset 0 0 0 6px #FFFFFF, inset 0 0 0 7px #B0AEA8',
          }}
        >
          <div className="flex justify-center items-center w-full h-full overflow-visible p-3">
            <div
              className="relative overflow-visible"
              style={{
                aspectRatio: `${maze.width * cellSize + PREVIEW_PADDING * 2} / ${maze.height * cellSize + PREVIEW_PADDING * 2}`,
                width: maze.width >= maze.height ? '100%' : 'auto',
                height: maze.width >= maze.height ? 'auto' : '100%',
                maxWidth: '100%',
                maxHeight: '100%',
              }}
            >
              <MazeRenderer
                maze={maze}
                cellSize={cellSize}
                padding={PREVIEW_PADDING}
                fillContainer
                showEndpointMarkers={false}
              />
              <PreviewEndpointMarkers maze={maze} cellSize={cellSize} />
            </div>
          </div>
        </div>

        {/* Identity caption — below card, flush with card edges */}
        <div
          className="grid grid-cols-[minmax(0,1fr)_auto_auto_minmax(0,1fr)] items-center gap-x-5 pt-2 pb-1 mx-auto sm:gap-x-6"
          style={{ width: 'min(100%, calc(100vh - 140px))' }}
          aria-label="Maze preview metadata"
        >
          <span className="whitespace-nowrap text-[13px] font-mono font-medium text-arch-600 sm:text-sm">{width} × {height}</span>
          <PreviewStartLegend arrowPoints={previewStartArrowPoints} />
          <PreviewFinishLegend />
          <span className="justify-self-end whitespace-nowrap text-[13px] font-mono font-medium text-arch-600 sm:text-sm">{presetLabel}</span>
        </div>

        {playing && (
          <FullscreenMazePlayer
            key={playerKey}
            maze={maze}
            initialGameState={initialGameState}
            initialShowTrail={initialShowTrail}
            label={presetLabel}
            onSessionChange={handleSessionChange}
            onReset={handleReset}
            onSolve={handleSolve}
            mazeContext="generator"
            onClose={() => {
              setPlaying(false);
              setInitialGameState(undefined);
              setInitialShowTrail(undefined);
              // Reload any session the player just saved so the resume card
              // appears immediately after Exit (without requiring a page reload).
              const saved = loadGeneratedSession(GENERATOR_VERSION);
              setResumeSession(saved);
            }}
          />
        )}

        {solveStats && (
          <div className="fixed inset-0 z-[60]">
            <PostSolveOverlay
              elapsedMs={solveStats.elapsedMs}
              stepCount={solveStats.stepCount}
              hintsUsed={solveStats.hintsUsed}
              isNewBest={solveStats.isNewBest}
              personalBest={null}
              onPlayAgain={() => {
                setSolveStats(null);
                setPlayerKey(k => k + 1);
              }}
              onClose={() => {
                setSolveStats(null);
                setPlaying(false);
              }}
              contextLabel={presetLabel && presetLabel.trim() ? `Generated Maze · ${presetLabel}` : `Generated Maze · ${maze.width}×${maze.height}`}
              mazeContext="generator"
              onNewMaze={handleGenerate}
              mazeWidth={maze.width}
              mazeHeight={maze.height}
              mazeLabel={presetLabel}
            />
          </div>
        )}
      </div>

      {/* ── Controls panel — below maze on mobile, left column on desktop ──
          Order: size selector → [rule] → actions → [rule] → browse */}
      <div className="w-full shrink-0 flex flex-col gap-4 lg:col-start-1 lg:row-start-1">

        {/* Desktop-only editorial header — hidden on mobile (page renders heading above) */}
        <div className="hidden lg:block">
          <nav aria-label="Breadcrumb" className="mb-3">
            <ol className="flex items-center gap-1">
              <li>
                <a href="/" className="text-xs font-mono text-arch-400 hover:text-arch-600 transition-colors">
                  Home
                </a>
              </li>
              <li><span className="text-xs font-mono text-arch-400 mx-1.5">/</span></li>
              <li><span className="text-xs font-mono text-arch-600">Maze Generator</span></li>
            </ol>
          </nav>
          <p className="text-xs tracking-widest uppercase font-semibold text-arch-accent mb-2">Free Maze Generator</p>
          {/* aria-hidden because the real h1 lives in the page (lg:hidden) for SEO */}
          <div className="font-display text-5xl text-arch-charcoal leading-none mb-2" aria-hidden="true">
            Build Your Own Maze
          </div>
          <p className="text-sm text-arch-600 leading-relaxed mb-4">
            Choose a size, generate a maze, then play online or print.
          </p>
        </div>

        {/* Resume banner — shown when an unfinished generated-maze session exists */}
        {resumeSession && !playing && (
          <ResumeBanner session={resumeSession} onResume={handleResume} onDiscard={handleDiscard} />
        )}

        {/* Size selector — always first */}
        <fieldset>
          <legend className="block text-xs tracking-widest uppercase font-semibold text-arch-600 mb-2">Size</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {SIZE_OPTIONS.map(({ value, label, detail }) => (
              <button
                key={value}
                onClick={() => handleSizeChange(value)}
                className={`${btnBase} flex flex-col items-center leading-tight px-1 ${
                  !showCustom && sizePreset === value ? activeBtn : inactiveBtn
                }`}
                aria-pressed={!showCustom && sizePreset === value}
              >
                <span>{label}</span>
                <span className={`text-xs font-mono font-medium ${!showCustom && sizePreset === value ? 'text-white/85 dark:text-arch-charcoal/70' : 'text-arch-600'}`}>{detail}</span>
              </button>
            ))}
            {/* Custom — sixth slot */}
            <button
              onClick={toggleCustom}
              className={`${btnBase} flex flex-col items-center leading-tight px-1 ${
                showCustom ? activeBtn : inactiveBtn
              }`}
              aria-pressed={showCustom}
            >
              <span>Custom</span>
              <span className={`text-xs font-mono font-medium ${showCustom ? 'text-white/85 dark:text-arch-charcoal/70' : 'text-arch-600'}`}>Up to 100</span>
            </button>
          </div>

          {/* Custom inputs — compact inline rows: Label [slider] Value */}
          {showCustom && (
            <div className="mt-3 space-y-2.5 border-t border-arch-200 pt-3">
              <div className="flex items-center gap-2">
                <label htmlFor="maze-width" className="text-sm font-semibold text-arch-charcoal w-12 shrink-0">Width</label>
                <input
                  id="maze-width"
                  type="range"
                  min={CUSTOM_RANGE.min}
                  max={CUSTOM_RANGE.max}
                  value={customWidth}
                  onChange={(e) => setCustomWidth(Number(e.target.value))}
                  className="generator-range flex-1 min-w-0"
                />
                <span className="text-sm font-mono font-semibold text-arch-charcoal w-9 text-right shrink-0">{customWidth}</span>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="maze-height" className="text-sm font-semibold text-arch-charcoal w-12 shrink-0">Height</label>
                <input
                  id="maze-height"
                  type="range"
                  min={CUSTOM_RANGE.min}
                  max={CUSTOM_RANGE.max}
                  value={customHeight}
                  onChange={(e) => setCustomHeight(Number(e.target.value))}
                  className="generator-range flex-1 min-w-0"
                />
                <span className="text-sm font-mono font-semibold text-arch-charcoal w-9 text-right shrink-0">{customHeight}</span>
              </div>
            </div>
          )}
        </fieldset>

        {/* Divider */}
        <div className="border-t border-arch-200" />

        {/* Actions */}
        <div className="space-y-2.5">
          {/* Primary generator action */}
          <button
            onClick={handleGenerate}
            className="w-full inline-flex items-center justify-center gap-2 rounded-sm border-2 border-arch-charcoal bg-arch-surface px-5 py-3 text-base font-semibold text-arch-charcoal hover:bg-arch-bg active:bg-arch-bg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Generate New Maze
          </button>

          {/* Primary play/restart action */}
          <button
            onClick={handlePlay}
            className="w-full inline-flex items-center justify-center gap-2 rounded-sm px-5 py-3 text-base font-semibold transition-colors bg-arch-accent text-white hover:bg-arch-accent-dark active:bg-arch-accent-dark"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z"/>
            </svg>
            {isPreviewSameAsSavedSession ? 'Restart This Maze' : 'Play This Maze'}
          </button>

          {/* Utility */}
          <div className="flex gap-2">
            <button
              onClick={handleDownloadSVG}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-sm border border-arch-200 bg-arch-surface px-3 py-2 text-sm font-medium text-arch-600 hover:bg-arch-bg hover:border-arch-400 hover:text-arch-charcoal transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              Download SVG
            </button>
            <button
              onClick={handlePrint}
              className="hidden lg:inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-arch-200 bg-arch-surface px-3 py-2 text-sm font-medium text-arch-600 hover:bg-arch-bg hover:border-arch-400 hover:text-arch-charcoal transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
              </svg>
              Print
            </button>
          </div>
          <p className="lg:hidden border-l-2 border-arch-200 pl-3 text-sm leading-relaxed text-arch-600">
            For best print results, download the SVG and print from a desktop browser.
          </p>
        </div>

      </div>
    </div>
    {printRoot ? createPortal(printMaze, printRoot) : null}
    </>
  );
}
