import { flushSync } from 'react-dom';

export function runPageTransition(update) {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || prefersReducedMotion) {
    update();
    return;
  }

  try {
    document.startViewTransition(() => flushSync(update));
  } catch {
    update();
  }
}
