import { useEffect, useRef, useState } from "react";

/**
 * CountUp — animasi angka naik dari 0 ke value akhir.
 * Tidak mengubah data/logic, murni presentasi.
 *
 * Props:
 *  - value: number (nilai akhir)
 *  - format: (n: number) => string (default: Math.round langsung ke string)
 *  - duration: ms (default 700)
 */
export default function CountUp({ value = 0, format = (n) => String(Math.round(n)), duration = 700 }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);
  const prevValueRef = useRef(0);

  useEffect(() => {
    const from = prevValueRef.current;
    const to = Number.isFinite(value) ? value : 0;
    const start = performance.now();

    // Hormati preferensi reduced motion
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setDisplay(to);
      prevValueRef.current = to;
      return;
    }

    const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

    function tick(now) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = easeOutQuart(t);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevValueRef.current = to;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => rafRef.current && cancelAnimationFrame(rafRef.current);
  }, [value]);

  return <>{format(display)}</>;
}
