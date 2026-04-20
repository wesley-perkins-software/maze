import { useEffect, useRef, useState } from 'react';
import type { GameAction, Direction } from '../../lib/gameplay/types';

interface SwipePadProps {
  dispatch: (action: GameAction) => void;
  isActive: boolean;
}

const DIR_ARROWS: Record<Direction, string> = {
  N: '↑',
  S: '↓',
  W: '←',
  E: '→',
};

const MIN_SWIPE = 20;

export function SwipePad({ dispatch, isActive }: SwipePadProps) {
  const padRef = useRef<HTMLDivElement>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const [swipeDir, setSwipeDir] = useState<Direction | null>(null);

  useEffect(() => {
    if (!isActive || !padRef.current) return;
    const el = padRef.current;

    function getDir(dx: number, dy: number): Direction {
      return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : (dy > 0 ? 'S' : 'N');
    }

    function onTouchStart(e: TouchEvent) {
      startPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      setSwipeDir(null);
    }

    function onTouchMove(e: TouchEvent) {
      e.preventDefault();
      if (!startPosRef.current) return;
      const dx = e.touches[0].clientX - startPosRef.current.x;
      const dy = e.touches[0].clientY - startPosRef.current.y;
      if (Math.hypot(dx, dy) > MIN_SWIPE) {
        setSwipeDir(getDir(dx, dy));
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (!startPosRef.current) return;
      const dx = e.changedTouches[0].clientX - startPosRef.current.x;
      const dy = e.changedTouches[0].clientY - startPosRef.current.y;
      if (Math.hypot(dx, dy) >= MIN_SWIPE) {
        dispatch({ type: 'RUN', direction: getDir(dx, dy) });
      }
      startPosRef.current = null;
      setSwipeDir(null);
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [isActive, dispatch]);

  return (
    <div
      ref={padRef}
      className="flex-1 self-stretch rounded-xl bg-white border border-slate-200 shadow-sm
                 flex flex-col items-center justify-center gap-1 select-none touch-none min-h-[72px]"
      aria-label="Swipe area — swipe to move"
      role="region"
    >
      {swipeDir ? (
        <span
          className="text-3xl font-bold text-blue-500 transition-all duration-75"
          aria-hidden="true"
        >
          {DIR_ARROWS[swipeDir]}
        </span>
      ) : (
        <>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="2" /><polyline points="9 5 12 2 15 5" />
            <line x1="12" y1="19" x2="12" y2="22" /><polyline points="15 19 12 22 9 19" />
            <line x1="5" y1="12" x2="2" y2="12" /><polyline points="5 9 2 12 5 15" />
            <line x1="19" y1="12" x2="22" y2="12" /><polyline points="19 15 22 12 19 9" />
          </svg>
          <span className="text-[11px] text-slate-400 font-medium leading-none">Swipe</span>
        </>
      )}
    </div>
  );
}
