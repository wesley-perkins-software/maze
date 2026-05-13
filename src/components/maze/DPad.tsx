import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import type { GameAction, Direction } from '../../lib/gameplay/types';

const HOLD_DELAY_MS = 240;
const REPEAT_INTERVAL_MS = 100;

interface DPadProps {
  dispatch: (action: GameAction) => void;
  isActive: boolean;
}

function ChevronUp() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}
function ChevronDown() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
function ChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
function ChevronRight() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

export function DPad({ dispatch, isActive }: DPadProps) {
  const [activeDirection, setActiveDirection] = useState<Direction | null>(null);
  const touchActiveRef = useRef(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heldDirectionRef = useRef<Direction | null>(null);

  function clearRepeatTimers() {
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (repeatTimerRef.current !== null) {
      clearInterval(repeatTimerRef.current);
      repeatTimerRef.current = null;
    }
  }

  function startHold(direction: Direction) {
    heldDirectionRef.current = direction;
    setActiveDirection(direction);
    dispatch({ type: 'MOVE', direction });
    clearRepeatTimers();
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      repeatTimerRef.current = setInterval(() => {
        if (heldDirectionRef.current) {
          dispatch({ type: 'MOVE', direction: heldDirectionRef.current });
        }
      }, REPEAT_INTERVAL_MS);
    }, HOLD_DELAY_MS);
  }

  function stopHold() {
    clearRepeatTimers();
    heldDirectionRef.current = null;
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
    touchActiveRef.current = true;
    startHold(direction);
  }

  function handleMouseDown(direction: Direction) {
    if (touchActiveRef.current) return;
    startHold(direction);
  }

  // Unmount-only cleanup to cancel any in-flight timers.
  useEffect(() => () => clearRepeatTimers(), []);

  // Window-level event listeners. No dep array — re-registers each render,
  // which is safe because it only runs after the DOM has committed.
  // Timers are NOT cleared in this cleanup path (only on unmount above).
  useEffect(() => {
    if (!isActive) return;

    function onTouchMove(e: TouchEvent) {
      if (!touchActiveRef.current) return;
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      const dir = getDirectionAtPoint(touch.clientX, touch.clientY);
      if (dir && dir !== heldDirectionRef.current) {
        startHold(dir);
      }
    }

    function onTouchEnd() {
      if (!touchActiveRef.current) return;
      touchActiveRef.current = false;
      stopHold();
    }

    function onMouseUp() {
      if (!touchActiveRef.current) {
        stopHold();
      }
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
    'flex items-center justify-center w-12 h-12 rounded-full ' +
    'bg-white border border-[var(--color-border)] text-slate-500 shadow-sm ' +
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
        className={`${baseBtnClass} ${
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

  // Grid layout: 3×3, buttons 48px, center gap 28px → 124×124px total cluster.
  // Up/Down sit in the narrow center column and overflow symmetrically into the
  // empty corner cells; Left/Right do the same vertically. justifyItems/alignItems
  // center keeps each button on the cross-axis regardless of cell size.
  return (
    <div
      role="group"
      aria-label="Directional controls"
      className="touch-none"
      style={{
        display: 'grid',
        gridTemplateColumns: '48px 28px 48px',
        gridTemplateRows: '48px 28px 48px',
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
