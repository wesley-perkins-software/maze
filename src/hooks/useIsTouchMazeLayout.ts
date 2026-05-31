import { useEffect, useState } from 'react';

function detectTouchLayout(): boolean {
  if (typeof window === 'undefined') return true;
  const isNarrow = window.matchMedia('(max-width: 1023px)').matches;
  const isCoarse = window.matchMedia('(pointer: coarse)').matches;
  const isHoverNone = window.matchMedia('(hover: none)').matches;
  const hasAnyCoarse = window.matchMedia('(any-pointer: coarse)').matches;
  const isFineAndHover = window.matchMedia('(pointer: fine) and (hover: hover)').matches;
  return isNarrow || isCoarse || isHoverNone || (hasAnyCoarse && !isFineAndHover);
}

/**
 * Returns true when the device should use the touch/mobile playable maze layout.
 * Uses pointer capability and hover in addition to viewport width, so tablets
 * (iPad, Kindle, Android tablets) get touch layout even at large viewport sizes.
 * Defaults to true (touch) before mount to avoid hydration mismatches.
 */
export function useIsTouchMazeLayout(): boolean {
  const [isTouchLayout, setIsTouchLayout] = useState(true);

  useEffect(() => {
    const update = () => setIsTouchLayout(detectTouchLayout());
    update();

    const queries = [
      window.matchMedia('(max-width: 1023px)'),
      window.matchMedia('(pointer: coarse)'),
      window.matchMedia('(hover: none)'),
      window.matchMedia('(any-pointer: coarse)'),
      window.matchMedia('(pointer: fine) and (hover: hover)'),
    ];
    queries.forEach(mq => mq.addEventListener('change', update));
    return () => queries.forEach(mq => mq.removeEventListener('change', update));
  }, []);

  return isTouchLayout;
}
