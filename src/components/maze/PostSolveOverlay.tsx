import { useEffect, useRef, useState } from 'react';
import { getMsUntilMidnightUTC } from '../../lib/utils/countdown';

// Set to 50 to activate a 320×50 banner ad slot above the tertiary actions.
const POST_SOLVE_AD_SLOT_H = 0;

export interface PostSolveNav {
  nextSlug: string;
  /** Override the label on the primary "Next" button. Defaults to "Next Maze". */
  nextLabel?: string;
  largerSlug?: string;
  randomSlug: string;
  categorySlug: string;
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
  /** Short positive line shown under "Maze Complete!", e.g. "Nice work — you solved today's challenge." */
  completionCopy?: string;
  /** e.g. "Come back tomorrow for a fresh challenge." */
  returnCopy?: string;
  /** Show a live countdown to the next daily maze */
  showCountdown?: boolean;
}

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

// Eight confetti particles: colors drawn from the brand palette
const CONFETTI = [
  { color: '#3b82f6', cx: '-52px', cy: '-68px', cr: '-120deg' },
  { color: '#8b5cf6', cx:  '58px', cy: '-72px', cr:  '135deg' },
  { color: '#f59e0b', cx: '-70px', cy: '-20px', cr:  '-90deg' },
  { color: '#a855f7', cx:  '74px', cy: '-18px', cr:   '90deg' },
  { color: '#3b82f6', cx: '-44px', cy:  '62px', cr:  '160deg' },
  { color: '#60a5fa', cx:  '48px', cy:  '58px', cr: '-150deg' },
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
      className="w-7 h-7 text-emerald-600"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CountdownLine() {
  const [ms, setMs] = useState(() => getMsUntilMidnightUTC());
  useEffect(() => {
    const id = setInterval(() => setMs(getMsUntilMidnightUTC()), 1000);
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
    <p className="text-slate-400 text-xs mt-0.5">
      New maze unlocks in {formatted}
    </p>
  );
}

function ShareButton({ mazeSlug }: { mazeSlug?: string }) {
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleShare = async () => {
    const btn = btnRef.current;
    if (!btn) return;
    const url = window.location.href;
    const title = 'I just solved a maze!';
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
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
      className="btn-ghost text-sm"
    >
      Share
    </button>
  );
}

export function PostSolveOverlay({
  elapsedMs,
  stepCount,
  hintsUsed,
  isNewBest: _isNewBest,
  personalBest: _personalBest,
  nav,
  onPlayAgain,
  onClose,
  mazeSlug,
  completionCopy,
  returnCopy,
  showCountdown,
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

  const statsItems: string[] = [`⏱ ${formatTime(elapsedMs)}`];
  if (stepCount > 0) statsItems.push(`${stepCount} steps`);
  if (hintsUsed > 0) statsItems.push(`${hintsUsed} hint${hintsUsed > 1 ? 's' : ''}`);

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-white/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Maze complete"
    >
      <ConfettiParticles />

      <div
        className="post-solve-card-in relative w-full max-w-xs bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 flex flex-col items-center gap-4"
        style={!interactive ? { pointerEvents: 'none' } : undefined}
      >

        {/* Success icon */}
        <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
          <CheckIcon />
        </div>

        {/* Heading + optional completion copy */}
        <div className="text-center leading-snug">
          <h3 className="text-xl font-bold text-slate-800">Maze Complete!</h3>
          {completionCopy && (
            <p className="mt-1.5 text-sm text-slate-500">{completionCopy}</p>
          )}
        </div>

        {/* Stats row */}
        <p className="text-sm text-slate-500 text-center">
          {statsItems.join(' · ')}
        </p>

        {/* Daily habit messaging */}
        {returnCopy && (
          <div className="text-center -mt-1">
            <p className="text-xs text-slate-500">{returnCopy}</p>
            {showCountdown && <CountdownLine />}
          </div>
        )}

        {/* Bridge copy — connects daily experience to maze library */}
        {showCountdown && nav && (
          <p className="text-xs text-slate-400 text-center -mt-1">
            Want more? Try another maze while you wait.
          </p>
        )}

        {/* Primary CTA — Next Maze */}
        {nav ? (
          <a
            href={`/mazes/${nav.nextSlug}`}
            className="btn-primary w-full justify-center text-base py-3"
            ref={primaryBtnRef as React.Ref<HTMLAnchorElement>}
          >
            {nav.nextLabel ?? 'Next Maze'}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
            </svg>
          </a>
        ) : (
          <button
            onClick={onPlayAgain}
            className="btn-primary w-full justify-center text-base py-3"
            ref={primaryBtnRef as React.Ref<HTMLButtonElement>}
          >
            Play Again
          </button>
        )}

        {/* Secondary CTA */}
        {nav && (
          <a
            href={`/${nav.categorySlug}`}
            className="btn-secondary text-sm justify-center py-2 w-full"
          >
            Browse Mazes
          </a>
        )}

        {/* Ad slot — reserved for future monetization */}
        {POST_SOLVE_AD_SLOT_H > 0 && (
          <div
            style={{ height: POST_SOLVE_AD_SLOT_H }}
            className="w-full rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-xs text-slate-400 shrink-0"
          >
            {/* Ad unit renders here */}
          </div>
        )}

        {/* Tertiary actions */}
        <div className="flex items-center gap-1 flex-wrap justify-center -mb-1">
          {nav && (
            <button onClick={onPlayAgain} className="btn-ghost text-sm">
              Play Again
            </button>
          )}
          {nav && !showCountdown && (
            <a href={`/mazes/${nav.randomSlug}`} className="btn-ghost text-sm">
              Random
            </a>
          )}
          {showCountdown && (
            <a href="/maze-generator" className="btn-ghost text-sm">
              Make Your Own
            </a>
          )}
          {!nav && onClose && (
            <button onClick={onClose} className="btn-ghost text-sm">
              Done
            </button>
          )}
          <ShareButton mazeSlug={mazeSlug} />
        </div>
      </div>
    </div>
  );
}
