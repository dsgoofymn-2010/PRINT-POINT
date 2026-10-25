import { useEffect, useRef } from 'react';

const N = 170; // frames after ~170 are blank paper, so skip them
const W = 1280;
const H = 720;
const CROP = 1.3; // zoom in slightly to trim the frame edges
const src = (i: number) => `/printer-frames/${String(i + 1).padStart(3, '0')}.webp`;

/** Full-width scroll-driven printer animation shown above the home page. */
export function PrinterScrollIntro() {
  const trackRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!track || !cv || !ctx) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const frames: (HTMLImageElement | undefined)[] = new Array(N);
    let cur = 0;
    let last = -1;
    let raf = 0;

    const draw = (i: number, force = false) => {
      if (i === last && !force) return;
      let k = i;
      while (k > 0 && !frames[k]) k--;
      const im = frames[k];
      if (!im) return;
      const s = Math.max(cv.width / W, cv.height / H) * CROP; // cover + crop
      const dw = W * s, dh = H * s;
      ctx.drawImage(im, (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh);
      last = i;
    };

    for (let i = 0; i < N; i++) {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => { frames[i] = im; if (i === 0) draw(0, true); };
      im.src = src(i);
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(cv.clientWidth * dpr);
      cv.height = Math.round(cv.clientHeight * dpr);
      draw(Math.round(cur), true);
    };

    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    const tick = () => {
      const p = clamp(-track.getBoundingClientRect().top / (track.offsetHeight - innerHeight));
      const target = p * (N - 1);
      cur = reduce ? target : cur + (target - cur) * 0.18;
      if (Math.abs(target - cur) < 0.05) cur = target;
      draw(Math.round(cur));
      raf = requestAnimationFrame(tick);
    };

    addEventListener('resize', resize);
    resize();
    raf = requestAnimationFrame(tick);
    return () => { removeEventListener('resize', resize); cancelAnimationFrame(raf); };
  }, []);

  return (
    <section
      ref={trackRef}
      aria-hidden="true"
      className="relative ml-[calc(50%-50vw)] w-screen bg-paper"
      style={{ height: '268vh' }}
    >
      <div className="sticky top-0 h-[100dvh] overflow-hidden">
        <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent to-paper" />
      </div>
    </section>
  );
}
