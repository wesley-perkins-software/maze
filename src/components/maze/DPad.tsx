import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { GameAction, Direction } from '../../lib/gameplay/types';

interface DPadProps {
  dispatch: (action: GameAction) => void;
  isActive: boolean;
}

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
  const activePointerIdRef = useRef<number | null>(null);
  const lastDirectionRef = useRef<Direction | null>(null);
  const [activeDirection, setActiveDirection] = useState<Direction | null>(null);

  if (!isActive) return null;

  const baseBtnClass =
    'flex items-center justify-center w-16 h-16 rounded-2xl ' +
    'bg-white border border-slate-200 text-slate-500 shadow-sm ' +
    'select-none touch-none ' +
    'active:scale-95 active:shadow-none ' +
    'transition-all duration-75 cursor-pointer';

  function dispatchDirection(direction: Direction | null) {
    if (!direction || direction === lastDirectionRef.current) return;
    lastDirectionRef.current = direction;
    setActiveDirection(direction);
    dispatch({ type: 'RUN', direction });
  }

  function getDirectionAtPoint(clientX: number, clientY: number): Direction | null {
    const target = document.elementFromPoint(clientX, clientY);
    if (!(target instanceof HTMLElement)) return null;

    const button = target.closest<HTMLButtonElement>('button[data-dir]');
    const direction = button?.dataset.dir as Direction | undefined;

    if (!direction || !['N', 'E', 'S', 'W'].includes(direction)) return null;
    return direction;
  }

  function onButtonPointerDown(e: PointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    activePointerIdRef.current = e.pointerId;

    const direction = e.currentTarget.dataset.dir as Direction | undefined;
    if (direction) dispatchDirection(direction);
  }

  function onContainerPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (activePointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    dispatchDirection(getDirectionAtPoint(e.clientX, e.clientY));
  }

  function onContainerPointerEnd(e: PointerEvent<HTMLDivElement>) {
    if (activePointerIdRef.current !== e.pointerId) return;

    activePointerIdRef.current = null;
    lastDirectionRef.current = null;
    setActiveDirection(null);
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
            ? 'bg-blue-50 border-blue-300 text-blue-600'
            : 'active:bg-blue-50 active:border-blue-300 active:text-blue-600'
        }`}
        onPointerDown={onButtonPointerDown}
      >
        {icon}
      </button>
    );
  }

  return (
    <div
      className="md:hidden flex flex-col items-center gap-2 touch-none"
      role="group"
      aria-label="Directional controls"
      onPointerMove={onContainerPointerMove}
      onPointerUp={onContainerPointerEnd}
      onPointerCancel={onContainerPointerEnd}
      onPointerLeave={onContainerPointerEnd}
    >
      <div>{makeButton('N', <ChevronUp />, 'Move up')}</div>
      <div className="flex gap-2">
        {makeButton('W', <ChevronLeft />, 'Move left')}
        <div className="w-16 h-16" aria-hidden="true" />
        {makeButton('E', <ChevronRight />, 'Move right')}
      </div>
      <div>{makeButton('S', <ChevronDown />, 'Move down')}</div>
    </div>
  );
}
