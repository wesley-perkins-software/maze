import type { ReactNode } from 'react';
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
        onPointerDown={() => dispatch({ type: 'RUN', direction: dir })}
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
