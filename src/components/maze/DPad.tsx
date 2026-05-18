import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import type { GameAction, Direction } from '../../lib/gameplay/types';

// How long between repeated RUN dispatches while a button is held.
// Longer than a single-cell repeat since each step covers more distance.
const HOLD_REPEAT_MS = 320;

interface DPadProps {
  dispatch: (action: GameAction) => void;
  isActive: boolean;
  compact?: boolean;
  disabled?: boolean;
}

function ChevronUp() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}
function ChevronDown() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
function ChevronLeft() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
function ChevronRight() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

export function DPad({ dispatch, isActive, compact = false, disabled = false }: DPadProps) {
  const [activeDirection, setActiveDirection] = useState<Direction | null>(null);
  const touchActiveRef = useRef(false);
  const touchResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tracks the active direction so touchmove doesn't re-fire for the same button
  // and so the repeat interval always dispatches the current direction.
  const lastDirectionRef = useRef<Direction | null>(null);

  function clearRepeat() {
    if (repeatTimerRef.current !== null) {
      clearInterval(repeatTimerRef.current);
      repeatTimerRef.current = null;
    }
  }

  function run(direction: Direction) {
    if (disabled) return;
    lastDirectionRef.current = direction;
    setActiveDirection(direction);
    dispatch({ type: 'RUN', direction });
    // Start (or restart) the hold-repeat interval for this direction.
    clearRepeat();
    repeatTimerRef.current = setInterval(() => {
      if (lastDirectionRef.current) {
        dispatch({ type: 'RUN', direction: lastDirectionRef.current });
      }
    }, HOLD_REPEAT_MS);
  }

  function stopInteraction() {
    clearRepeat();
    lastDirectionRef.current = null;
    setActiveDirection(null);
  }

  function getDirectionAtPoint(clientX: number, clientY: number): Direction | null {
    const target = document.elementFromPoint(clientX, clientY);
    if (!(target instanceof HTMLElement)) return null;
    const button = target.closest<HTMLButtonElement>('button[data-dir]');
    const direction = button?.dataset.dir as Direction | undefined;
    if (!direction || !['N', 'E', 'S', 'W'].includes(direction)) return null;
    return direction;
  }

  function handleTouchStart(e: TouchEvent<HTMLButtonElement>, direction: Direction) {
    e.preventDefault();
    if (disabled) return;
    // Cancel any pending reset so rapid taps don't let synthetic mousedown through.
    if (touchResetTimerRef.current !== null) {
      clearTimeout(touchResetTimerRef.current);
      touchResetTimerRef.current = null;
    }
    touchActiveRef.current = true;
    run(direction);
  }

  function handleMouseDown(direction: Direction) {
    if (disabled || touchActiveRef.current) return;
    run(direction);
  }

  // Unmount-only cleanup.
  useEffect(() => () => {
    clearRepeat();
    if (touchResetTimerRef.current !== null) clearTimeout(touchResetTimerRef.current);
  }, []);

  useEffect(() => {
    if (disabled) stopInteraction();
  }, [disabled]);

  // Window-level listeners. No dep array — safe to re-register each render.
  useEffect(() => {
    if (!isActive || disabled) return;

    function onTouchMove(e: TouchEvent) {
      if (!touchActiveRef.current) return;
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      const dir = getDirectionAtPoint(touch.clientX, touch.clientY);
      if (dir && dir !== lastDirectionRef.current) {
        run(dir);
      }
    }

    function onTouchEnd() {
      stopInteraction();
      // Delay flag reset so synthetic mousedown (fired ~0–300ms after touchend)
      // is still suppressed.
      if (touchResetTimerRef.current !== null) clearTimeout(touchResetTimerRef.current);
      touchResetTimerRef.current = setTimeout(() => {
        touchResetTimerRef.current = null;
        touchActiveRef.current = false;
      }, 400);
    }

    function onMouseUp() {
      if (!touchActiveRef.current) stopInteraction();
    }

    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    window.addEventListener('mouseup', onMouseUp, { passive: true });

    return () => {
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('mouseup', onMouseUp);
    };
  });

  // Early return after all hooks — safe per React rules.
  if (!isActive) return null;

  const baseBtnClass =
    'flex items-center justify-center w-14 h-14 rounded-full ' +
    'bg-[#FDFCF8] border-2 border-[var(--color-border)] text-[#64748B] shadow ' +
    'select-none touch-none ' +
    'transition-all duration-75 cursor-pointer ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1';

  function makeButton(dir: Direction, icon: ReactNode, label: string) {
    const isPressed = activeDirection === dir;
    return (
      <button
        type="button"
        aria-label={label}
        data-dir={dir}
        disabled={disabled}
        aria-disabled={disabled}
        className={`${baseBtnClass} ${disabled ? 'opacity-70 cursor-default' : ''} ${
          isPressed
            ? 'bg-[#F1EFE8] border-[var(--color-border-strong)] text-slate-700 shadow-none scale-[0.97]'
            : 'active:bg-[#F1EFE8] active:border-[var(--color-border-strong)] active:text-slate-700 active:scale-[0.97] active:shadow-none'
        }`}
        onMouseDown={() => handleMouseDown(dir)}
        onTouchStart={(e) => handleTouchStart(e, dir)}
      >
        {icon}
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Directional controls"
      className="touch-none"
      style={{
        display: 'grid',
        gridTemplateColumns: compact ? '56px 24px 56px' : '56px 32px 56px',
        gridTemplateRows: compact ? '56px 24px 56px' : '56px 32px 56px',
        justifyItems: 'center',
        alignItems: 'center',
      }}
    >
      <span aria-hidden="true" />
      {makeButton('N', <ChevronUp />, 'Move up')}
      <span aria-hidden="true" />
      {makeButton('W', <ChevronLeft />, 'Move left')}
      <span aria-hidden="true" />
      {makeButton('E', <ChevronRight />, 'Move right')}
      <span aria-hidden="true" />
      {makeButton('S', <ChevronDown />, 'Move down')}
      <span aria-hidden="true" />
    </div>
  );
}
