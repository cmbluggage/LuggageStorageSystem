'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';

/** Mounted once in the root layout. Skips entirely under prefers-reduced-motion. */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const lenis = new Lenis({ autoRaf: true });
    return () => lenis.destroy();
  }, []);

  return null;
}
