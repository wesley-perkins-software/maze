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
 * Arrow keys and WASD dispatch RUN actions so desktop movement matches swipe/D-pad movement.
 */
export function useKeyboardInput(dispatch: Dispatch, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    function handleKey(e: KeyboardEvent) {
      const dir = KEY_DIR_MAP[e.key];
      if (!dir) return;
      // Prevent page scroll when inside maze
      e.preventDefault();
      dispatch({ type: 'RUN', direction: dir });
    }

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [dispatch, enabled]);
}

// Pointer Events-based input:
// - Quick flick (pointer lifts before ACTIVATION_DELAY_MS): dispatches RUN (slide to wall).
// - Press-and-drag (pointer held past delay): dispatches repeated MOVE (one cell per DRAG_THRESHOLD px).
const ACTIVATION_DELAY_MS = 150; // ms before continuous drag mode activates
const DRAG_THRESHOLD = 28;       // px finger must move from last origin to trigger one MOVE
const THROTTLE_MS = 80;          // min ms between consecutive continuous MOVEs (~12.5/sec)
const MIN_SWIPE = 20;            // px minimum for a quick-flick RUN (preserved from original)

/**
 * Attaches pointer-event handlers to any element for swipe and continuous drag movement.
 *
 * Quick flick  → RUN (slide to wall, existing behaviour).
 * Press + drag → repeated single-cell MOVE while finger is held down.
 */
export function useTouchInput(
  ref: RefObject<HTMLElement | SVGSVGElement | null>,
  dispatch: Dispatch,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled || !ref.current) return;
    const el = ref.current as HTMLElement;

    // Per-gesture state (reset on each pointerdown)
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;
    let latestX = 0;
    let latestY = 0;
    let hasContinuousMoved = false;
    let continuousActive = false;
    let lastMoveTime = 0;
    let activationTimer: ReturnType<typeof setTimeout> | null = null;
    let activePointerId: number | null = null;

    function resetState() {
      hasContinuousMoved = false;
      continuousActive = false;
      lastMoveTime = 0;
      activePointerId = null;
      if (activationTimer !== null) {
        clearTimeout(activationTimer);
        activationTimer = null;
      }
    }

    function onPointerDown(e: PointerEvent) {
      // Only track the first finger; ignore subsequent contacts.
      if (activePointerId !== null) return;
      activePointerId = e.pointerId;

      startX = originX = latestX = e.clientX;
      startY = originY = latestY = e.clientY;
      hasContinuousMoved = false;
      continuousActive = false;
      lastMoveTime = 0;

      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }

      activationTimer = setTimeout(() => {
        activationTimer = null;
        continuousActive = true;
        // Reset origin to where the finger is now so the first MOVE is intentional.
        originX = latestX;
        originY = latestY;
      }, ACTIVATION_DELAY_MS);
    }

    function onPointerMove(e: PointerEvent) {
      if (e.pointerId !== activePointerId) return;
      latestX = e.clientX;
      latestY = e.clientY;

      if (!continuousActive) return;

      const dx = e.clientX - originX;
      const dy = e.clientY - originY;
      const now = Date.now();

      if (Math.max(Math.abs(dx), Math.abs(dy)) >= DRAG_THRESHOLD && (now - lastMoveTime) >= THROTTLE_MS) {
        const dir: Direction = Math.abs(dx) >= Math.abs(dy)
          ? (dx > 0 ? 'E' : 'W')
          : (dy > 0 ? 'S' : 'N');

        dispatch({ type: 'MOVE', direction: dir });
        originX = e.clientX;
        originY = e.clientY;
        lastMoveTime = now;
        hasContinuousMoved = true;
      }
    }

    function onPointerUp(e: PointerEvent) {
      if (e.pointerId !== activePointerId) return;

      if (activationTimer !== null) {
        clearTimeout(activationTimer);
        activationTimer = null;
      }

      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }

      if (!hasContinuousMoved) {
        // Quick flick: evaluate total delta and dispatch RUN (original behaviour).
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.max(Math.abs(dx), Math.abs(dy)) >= MIN_SWIPE) {
          const dir: Direction = Math.abs(dx) >= Math.abs(dy)
            ? (dx > 0 ? 'E' : 'W')
            : (dy > 0 ? 'S' : 'N');
          dispatch({ type: 'RUN', direction: dir });
        }
      }

      resetState();
    }

    const prevTouchAction = (el as HTMLElement).style.touchAction;
    (el as HTMLElement).style.touchAction = 'none';

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      (el as HTMLElement).style.touchAction = prevTouchAction;
      if (activationTimer !== null) clearTimeout(activationTimer);
    };
  }, [ref, dispatch, enabled]);
}
