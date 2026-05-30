import { useEffect, useRef, useState } from 'react';
import { getMsUntilLocalMidnight } from '../../lib/utils/countdown';
import { getDailyNow } from '../../lib/utils/dailyNow';

// Set to 50 to activate a 320×50 banner ad slot between secondary and tertiary actions.
// When enabling, also widen the card from max-w-xs to max-w-sm to give the ad breathing room.
const POST_SOLVE_AD_SLOT_H = 0;

export interface PostSolveNav {
  nextSlug: string;
  /** Override the label on the primary "Next" button. Defaults to "Next Maze". */
  nextLabel?: string;
  /** Direct href for the next maze — used instead of /mazes/{nextSlug} when provided. */
  nextHref?: string;
  largerSlug?: string;
  randomSlug: string;
  categorySlug: string;
  /** Direct href for the collection/category page — used instead of /{categorySlug} when provided. */
  categoryHref?: string;
  categoryLabel: string;
}

export interface PostSolveOverlayProps {
  elapsedMs: number;
  stepCount: number;
  hintsUsed: number;
  isNewBest: boolean;
  personalBest: number | null;
  nav?: PostSolveNav;
  onPlayAgain: () => void;
  onClose?: () => void;
  mazeSlug?: string;
  /** @deprecated No longer rendered. Kept for API compatibility. */
  completionCopy?: string;
  /** @deprecated No longer rendered. Kept for API compatibility. */
  returnCopy?: string;
  /** Show a live countdown to the next daily maze */
  showCountdown?: boolean;
  /**
   * Generator-specific: when provided, "New Maze" becomes the primary CTA and
   * "Play Again" becomes secondary. Replaces the default "Play Again" primary layout.
   */
  onNewMaze?: () => void;
  /** Width of the generated maze — shown in share text. */
  mazeWidth?: number;
  /** Height of the generated maze — shown in share text. */
  mazeHeight?: number;
  /** Friendly generator size label, e.g. "Large". */
  mazeLabel?: string;
  /** Daily maze post-solve: daily-specific title, actions, and share text. */
  isDailyMode?: boolean;
  /** Optional label shown under the title, e.g. "Today's Maze", "Generated Maze · Small", "Small #003" */
  contextLabel?: string;
  /** Current daily streak count (days in a row). Only shown in daily mode. */
  streakCurrent?: number;
  /** All-time longest streak. Only shown in daily mode when > 1. */
  streakLongest?: number;
}

function formatTimeCompact(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${totalSec}s`;
  if (sec === 0) return `${min}m`;
  return `${min}m ${sec}s`;
}

function formatTimeFull(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const minLabel = min === 1 ? '1 minute' : `${min} minutes`;
  const secLabel = sec === 1 ? '1 second' : `${sec} seconds`;
  if (min === 0) return secLabel;
  if (sec === 0) return minLabel;
  return `${minLabel} ${secLabel}`;
}

// Eight confetti particles: colors drawn from the brand palette
const CONFETTI = [
  { color: '#3b82f6', cx: '-52px', cy: '-68px', cr: '-120deg' },
  { color: '#22c55e', cx:  '58px', cy: '-72px', cr:  '135deg' },
  { color: '#f59e0b', cx: '-70px', cy: '-20px', cr:  '-90deg' },
  { color: '#a855f7', cx:  '74px', cy: '-18px', cr:   '90deg' },
  { color: '#3b82f6', cx: '-44px', cy:  '62px', cr:  '160deg' },
  { color: '#22c55e', cx:  '48px', cy:  '58px', cr: '-150deg' },
  { color: '#f59e0b', cx:   '0px', cy: '-80px', cr:   '45deg' },
  { color: '#ef4444', cx:   '0px', cy:  '70px', cr:  '-45deg' },
] as const;

function ConfettiParticles() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden" aria-hidden="true">
      {CONFETTI.map((p, i) => (
        <div
          key={i}
          className="absolute w-2 h-2 rounded-sm"
          style={{
            background: p.color,
            '--cx': p.cx,
            '--cy': p.cy,
            '--cr': p.cr,
            animation: `post-solve-confetti 600ms ${i * 40}ms ease-out both`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      className="w-7 h-7"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#047857"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CountdownLine() {
  const [ms, setMs] = useState(() => getMsUntilLocalMidnight(getDailyNow()));
  useEffect(() => {
    const id = setInterval(() => setMs(getMsUntilLocalMidnight(getDailyNow())), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const formatted = h > 0
    ? `${h}h ${String(m).padStart(2, '0')}m`
    : `${m}m ${String(sec).padStart(2, '0')}s`;
  return (
    <p className="text-slate-500 dark:text-slate-400 text-xs text-center">
      New daily maze unlocks in {formatted}
    </p>
  );
}

function ShareButton({
  shareText,
  mazeSlug: _mazeSlug,
  className = 'btn-ghost text-sm',
}: {
  shareText: string;
  mazeSlug?: string;
  className?: string;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleShare = async () => {
    const btn = btnRef.current;
    if (!btn) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'MazePuzzles.io', text: shareText });
      } else {
        await navigator.clipboard.writeText(shareText);
        const orig = btn.textContent ?? '';
        btn.textContent = 'Copied!';
        setTimeout(() => { if (btn) btn.textContent = orig; }, 2000);
      }
    } catch { /* user cancelled */ }
  };

  return (
    <button
      ref={btnRef}
      onClick={handleShare}
      className={className}
    >
      Share Result
    </button>
  );
}

function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}

export function PostSolveOverlay({
  elapsedMs,
  stepCount,
  hintsUsed: _hintsUsed,
  isNewBest: _isNewBest,
  personalBest: _personalBest,
  nav,
  onPlayAgain,
  onClose,
  mazeSlug,
  showCountdown,
  onNewMaze,
  mazeWidth,
  mazeHeight,
  mazeLabel,
  isDailyMode,
  contextLabel,
  streakCurrent,
  streakLongest,
}: PostSolveOverlayProps) {
  const primaryBtnRef = useRef<HTMLAnchorElement | HTMLButtonElement>(null);
  // On mobile, the browser fires a synthetic click event at the touch position
  // after touchend (ghost click). If the overlay renders before that event fires,
  // the click lands on whatever button is at the touch position and dismisses the
  // overlay before the user sees it. Disabling pointer-events for 400ms (longer
  // than the ~300ms ghost-click window) prevents this.
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      setInteractive(true);
      primaryBtnRef.current?.focus();
    }, 400);
    return () => clearTimeout(id);
  }, []);

  const generatorUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/maze-generator`
    : '/maze-generator';

  const dailyShareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/maze-of-the-day`
    : '/maze-of-the-day';

  const shareText = isDailyMode
    ? `I solved today's MazePuzzles.io Maze of the Day in ${formatTimeFull(elapsedMs)}.\n\nCan you solve it?\n${dailyShareUrl}`
    : onNewMaze && mazeWidth && mazeHeight
    ? `I solved a ${mazeWidth}×${mazeHeight} maze in ${formatTimeFull(elapsedMs)}${stepCount > 0 ? ` and ${stepCount} steps` : ''}. Try making your own maze: ${generatorUrl}`
    : `I just solved a maze! Try it: ${typeof window !== 'undefined' ? window.location.href : ''}`;

  const isGeneratorMode = Boolean(onNewMaze && !nav && !isDailyMode);

  // Resolve nav hrefs
  const nextHref = nav ? (nav.nextHref || (nav.nextSlug ? `/mazes/${nav.nextSlug}` : '')) : '';
  const categoryHref = nav ? (nav.categoryHref || `/${nav.categorySlug}`) : '';
  const hasNext = Boolean(nextHref);

  // Primary CTA logic:
  // - Daily: Share Result
  // - Generator: New Maze
  // - Library with next: Next Maze (link)
  // - Library without next: Browse Collection (link)
  // - Fallback: Play Again

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-white/90 dark:bg-slate-900/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Maze complete"
    >
      <ConfettiParticles />

      <div
        className="post-solve-card-in relative w-full max-w-xs bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 p-6 flex flex-col items-center gap-4"
        style={!interactive ? { pointerEvents: 'none' } : undefined}
      >

        {/* Dismiss X — shown whenever onClose is provided */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <XIcon />
          </button>
        )}

        {/* Success icon */}
        <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0" style={{ background: '#D1FAE5', border: '1.5px solid #6EE7B7' }}>
          <CheckIcon />
        </div>

        {/* Title + context label */}
        <div className="text-center leading-snug">
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            {isDailyMode ? 'Daily Maze Complete!' : 'Maze Complete!'}
          </h3>
          {contextLabel && (
            <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">{contextLabel}</p>
          )}
        </div>

        {/* Stats */}
        {stepCount > 0 ? (
          <div className="flex gap-8 justify-center">
            <StatBlock value={formatTimeCompact(elapsedMs)} label="Time" />
            <StatBlock value={stepCount.toLocaleString()} label="Steps" />
          </div>
        ) : (
          <StatBlock value={formatTimeCompact(elapsedMs)} label="Time" />
        )}

        {/* Streak — daily mode only */}
        {isDailyMode && streakCurrent != null && streakCurrent >= 1 && (
          <div className="w-full rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 px-4 py-2.5 flex items-center justify-center gap-2">
            <span className="text-lg leading-none" aria-hidden="true">🔥</span>
            <div className="text-center">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 leading-tight">
                  {streakCurrent === 1 ? '1-day streak' : `${streakCurrent}-day streak`}
                </p>
                {streakLongest != null && streakLongest > streakCurrent && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 leading-tight">
                    Best: {streakLongest} {streakLongest === 1 ? 'day' : 'days'}
                  </p>
                )}
                {streakLongest != null && streakLongest === streakCurrent && streakCurrent > 1 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 leading-tight">
                    New best!
                  </p>
                )}
            </div>
          </div>
        )}

        {/* Primary CTA */}
        {isDailyMode ? (
          <ShareButton
            shareText={shareText}
            className="btn-primary w-full justify-center text-base py-3 rounded-lg"
          />
        ) : isGeneratorMode ? (
          <button
            onClick={onNewMaze}
            className="btn-primary w-full justify-center text-base py-3 rounded-lg"
            ref={primaryBtnRef as React.Ref<HTMLButtonElement>}
          >
            New Maze
          </button>
        ) : nav && hasNext ? (
          <a
            href={nextHref}
            className="btn-primary w-full justify-center text-base py-3 rounded-lg"
            ref={primaryBtnRef as React.Ref<HTMLAnchorElement>}
          >
            {nav.nextLabel ?? 'Next Maze'}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
            </svg>
          </a>
        ) : nav && !hasNext ? (
          <a
            href={categoryHref}
            className="btn-primary w-full justify-center text-base py-3 rounded-lg"
            ref={primaryBtnRef as React.Ref<HTMLAnchorElement>}
          >
            {nav.categoryLabel}
          </a>
        ) : (
          <button
            onClick={onPlayAgain}
            className="btn-primary w-full justify-center text-base py-3 rounded-lg"
            ref={primaryBtnRef as React.Ref<HTMLButtonElement>}
          >
            Play Again
          </button>
        )}

        {/* Secondary CTA */}
        {isDailyMode ? (
          <a
            href="/maze-generator"
            className="btn-secondary w-full justify-center text-sm py-2.5 rounded-lg"
          >
            Create a Maze
          </a>
        ) : isGeneratorMode ? (
          <button
            onClick={onPlayAgain}
            className="btn-secondary w-full justify-center text-sm py-2.5 rounded-lg"
          >
            Play Again
          </button>
        ) : nav && hasNext ? (
          <a
            href={categoryHref}
            className="btn-secondary w-full justify-center text-sm py-2.5 rounded-lg"
          >
            {nav.categoryLabel}
          </a>
        ) : null}

        {/* Ad slot — reserved for future monetization.
            Position: after secondary CTA, before tertiary actions.
            When enabling POST_SOLVE_AD_SLOT_H, also widen card to max-w-sm. */}
        {POST_SOLVE_AD_SLOT_H > 0 && (
          <div
            style={{ height: POST_SOLVE_AD_SLOT_H }}
            className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs text-slate-400 shrink-0"
          >
            {/* Ad unit renders here */}
          </div>
        )}

        {/* Tertiary actions */}
        <div className="flex items-center gap-1 flex-wrap justify-center -mb-1">
          {isDailyMode ? (
            <button onClick={onPlayAgain} className="btn-ghost text-sm rounded-lg">
              Play Again
            </button>
          ) : isGeneratorMode ? (
            <ShareButton shareText={shareText} mazeSlug={mazeSlug} className="btn-ghost text-sm rounded-lg" />
          ) : nav && hasNext ? (
            <button onClick={onPlayAgain} className="btn-ghost text-sm rounded-lg">
              Play Again
            </button>
          ) : null}
        </div>

        {/* Small note: countdown for daily */}
        {showCountdown && <CountdownLine />}
      </div>
    </div>
  );
}
