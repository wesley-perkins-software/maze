import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import type { GameAction, Direction } from '../../lib/gameplay/types';

interface DPadProps {
  dispatch: (action: GameAction) => void;
  isActive: boolean;
}

function ChevronUp() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}
function ChevronDown() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
function ChevronLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
function ChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

export function DPad({ dispatch, isActive }: DPadProps) {
  const [activeDirection, setActiveDirection] = useState<Direction | null>(null);
  const lastDirectionRef = useRef<Direction | null>(null);
  const touchActiveRef = useRef(false);

  if (!isActive) return null;

  const baseBtnClass =
    'flex items-center justify-center w-10 h-10 rounded-full ' +
    'bg-white border border-slate-200 text-slate-500 shadow-sm ' +
    'select-none touch-none ' +
    'transition-all duration-75 cursor-pointer';

  function dispatchDirection(direction: Direction | null) {
    if (!direction || direction === lastDirectionRef.current) return;
    lastDirectionRef.current = direction;
    setActiveDirection(direction);
    dispatch({ type: 'RUN', direction });
  }

  function clearInteraction() {
    touchActiveRef.current = false;
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
    touchActiveRef.current = true;
    dispatchDirection(direction);
  }

  useEffect(() => {
    function onTouchMove(e: TouchEvent) {
      if (!touchActiveRef.current) return;
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      dispatchDirection(getDirectionAtPoint(touch.clientX, touch.clientY));
    }

    function onTouchEnd() {
      if (!touchActiveRef.current) return;
      clearInteraction();
    }

    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  });

  function handleMouseDown(direction: Direction) {
    dispatchDirection(direction);
  }

  function makeButton(dir: Direction, icon: ReactNode, label: string) {
    const isPressed = activeDirection === dir;
    return (
      <button
        type="button"
        aria-label={label}
        data-dir={dir}
        className={`${baseBtnClass} ${
          isPressed
            ? 'bg-blue-500 border-blue-400 text-white shadow-inner scale-95'
            : 'active:bg-blue-500 active:border-blue-400 active:text-white active:scale-95 active:shadow-inner'
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
      className="flex flex-col items-center gap-1 touch-none"
      role="group"
      aria-label="Directional controls"
    >
      <div>{makeButton('N', <ChevronUp />, 'Move up')}</div>
      <div className="flex gap-1">
        {makeButton('W', <ChevronLeft />, 'Move left')}
        <div className="w-10 h-10" aria-hidden="true" />
        {makeButton('E', <ChevronRight />, 'Move right')}
      </div>
      <div>{makeButton('S', <ChevronDown />, 'Move down')}</div>
    </div>
  );
}
