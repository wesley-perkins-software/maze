import { useRef, useCallback, useEffect } from 'react';
import type { GameAction, Direction } from '../../lib/gameplay/types';

interface DPadProps {
  dispatch: (action: GameAction) => void;
  isActive: boolean;
}

const INITIAL_DELAY_MS = 500;
const REPEAT_INTERVAL_MS = 150;

export function DPad({ dispatch, isActive }: DPadProps) {
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Cancel any in-progress hold when game is solved
  useEffect(() => {
    if (!isActive) clearHold();
  }, [isActive, clearHold]);

  const startHold = useCallback((dir: Direction) => {
    if (!isActive) return;
    dispatch({ type: 'MOVE', direction: dir });
    holdTimeoutRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => {
        dispatch({ type: 'MOVE', direction: dir });
      }, REPEAT_INTERVAL_MS);
    }, INITIAL_DELAY_MS);
  }, [dispatch, isActive]);

  if (!isActive) return null;

  const btnClass =
    'flex items-center justify-center w-14 h-14 rounded-xl ' +
    'bg-slate-100 border border-slate-300 text-slate-700 text-xl ' +
    'select-none touch-none active:bg-slate-300 active:scale-95 ' +
    'transition-all duration-75 cursor-pointer';

  function makeButton(dir: Direction, icon: string, label: string) {
    return (
      <button
        key={dir}
        aria-label={label}
        className={btnClass}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          startHold(dir);
        }}
        onPointerUp={clearHold}
        onPointerLeave={clearHold}
        onPointerCancel={clearHold}
      >
        {icon}
      </button>
    );
  }

  return (
    <div
      className="md:hidden grid grid-cols-3 gap-1 w-fit mx-auto"
      role="group"
      aria-label="Directional controls"
    >
      <div />{makeButton('N', '▲', 'Move up')}<div />
      {makeButton('W', '◀', 'Move left')}<div />{makeButton('E', '▶', 'Move right')}
      <div />{makeButton('S', '▼', 'Move down')}<div />
    </div>
  );
}
