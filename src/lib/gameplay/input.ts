import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { GameAction, Direction } from './types';

type Dispatch = (action: GameAction) => void;

const KEY_DIR_MAP: Record<string, Direction> = {
  ArrowUp:    'N',
  ArrowRight: 'E',
  ArrowDown:  'S',
  ArrowLeft:  'W',
  w: 'N', W: 'N',
  d: 'E', D: 'E',
  s: 'S', S: 'S',
  a: 'W', A: 'W',
};

/**
 * Attaches keyboard listener to the window.
 * Arrow keys and WASD dispatch MOVE actions.
 */
export function useKeyboardInput(dispatch: Dispatch, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    function handleKey(e: KeyboardEvent) {
      const dir = KEY_DIR_MAP[e.key];
      if (!dir) return;
      // Prevent page scroll when inside maze
      e.preventDefault();
      dispatch({ type: 'MOVE', direction: dir });
    }

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [dispatch, enabled]);
}

/**
 * Attaches touch handlers to any element for swipe-based movement.
 * Min swipe distance: 20px. Prevents scroll while swiping.
 */
export function useTouchInput(
  ref: RefObject<HTMLElement | SVGSVGElement | null>,
  dispatch: Dispatch,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled || !ref.current) return;
    const el = ref.current;

    let startX = 0;
    let startY = 0;

    function onTouchStart(e: TouchEvent) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }

    function onTouchMove(e: TouchEvent) {
      // Prevent page scroll while actively swiping the maze
      e.preventDefault();
    }

    function onTouchEnd(e: TouchEvent) {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      const MIN = 20;

      if (Math.abs(dx) < MIN && Math.abs(dy) < MIN) return;

      let dir: Direction;
      if (Math.abs(dx) >= Math.abs(dy)) {
        dir = dx > 0 ? 'E' : 'W';
      } else {
        dir = dy > 0 ? 'S' : 'N';
      }

      dispatch({ type: 'RUN', direction: dir });
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [ref, dispatch, enabled]);
}
