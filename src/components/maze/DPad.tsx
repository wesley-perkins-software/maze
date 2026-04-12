import { useRef, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { GameAction, Direction } from '../../lib/gameplay/types';

interface DPadProps {
  dispatch: (action: GameAction) => void;
  isActive: boolean;
}

const INITIAL_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 120;

function ChevronUp() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}
function ChevronDown() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
function ChevronLeft() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
function ChevronRight() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

export function DPad({ dispatch, isActive }: DPadProps) {
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tracks whether the hold interval has fired at least once this press
  const holdDidFireRef = useRef(false);
  // Tracks whether onPointerDown ran (so onClick can skip if it did)
  const pointerDownFiredRef = useRef(false);

  const clearHold = useCallback(() => {
    if (holdTimeoutRef.current !== null) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (holdIntervalRef.current !== null) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isActive) clearHold();
  }, [isActive, clearHold]);

  if (!isActive) return null;

  const btnClass =
    'flex items-center justify-center w-16 h-16 rounded-2xl ' +
    'bg-white border border-slate-200 text-slate-500 shadow-sm ' +
    'select-none touch-manipulation ' +
    'active:bg-blue-50 active:border-blue-300 active:text-blue-600 active:scale-95 active:shadow-none ' +
    'transition-all duration-75 cursor-pointer';

  function makeButton(dir: Direction, icon: ReactNode, label: string) {
    return (
      <button
        aria-label={label}
        className={btnClass}
        onPointerDown={() => {
          // Mark that pointer down fired so onClick knows not to double-dispatch
          pointerDownFiredRef.current = true;
          holdDidFireRef.current = false;
          // Dispatch immediately for snappy feel
          dispatch({ type: 'MOVE', direction: dir });
          // Start hold-to-repeat after initial delay
          holdTimeoutRef.current = setTimeout(() => {
            holdIntervalRef.current = setInterval(() => {
              holdDidFireRef.current = true;
              dispatch({ type: 'MOVE', direction: dir });
            }, REPEAT_INTERVAL_MS);
          }, INITIAL_DELAY_MS);
        }}
        onPointerUp={clearHold}
        onPointerLeave={clearHold}
        onPointerCancel={clearHold}
        onClick={() => {
          // Fallback for browsers where onPointerDown doesn't fire reliably.
          // Also guards against double-dispatch when both events fire normally.
          const wasPointerDown = pointerDownFiredRef.current;
          pointerDownFiredRef.current = false;
          if (!wasPointerDown && !holdDidFireRef.current) {
            dispatch({ type: 'MOVE', direction: dir });
          }
          holdDidFireRef.current = false;
        }}
      >
        {icon}
      </button>
    );
  }

  return (
    <div
      className="md:hidden flex flex-col items-center gap-2"
      role="group"
      aria-label="Directional controls"
    >
      <div>{makeButton('N', <ChevronUp />, 'Move up')}</div>
      <div className="flex gap-2">
        {makeButton('W', <ChevronLeft />, 'Move left')}
        <div className="w-16 h-16" />
        {makeButton('E', <ChevronRight />, 'Move right')}
      </div>
      <div>{makeButton('S', <ChevronDown />, 'Move down')}</div>
    </div>
  );
}
