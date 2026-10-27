import { useEffect, useRef } from 'react';

const N = 170; // frames after ~170 are blank paper, so skip them
const W = 1280;
const H = 720;
const CROP = 1.3; // zoom in slightly to trim the frame edges
const src = (i: number) => `/printer-frames/${String(i + 1).padStart(3, '0')}.webp`;

/** Scroll share over which the shop name lifts away and the printer takes over. */
const NAME_OUT = 0.16;

/** Full-width scroll-driven printer animation shown above the home page, with the shop's name on top. */
export function PrinterScrollIntro({ shopName }: { shopName?: string }) {
  const trackRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nameRef = useRef<HTMLDivElement>(null);

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
      const name = nameRef.current;
      if (name) {
        const out = clamp(p / NAME_OUT);
        name.style.opacity = String(1 - out);
        // Reduced motion: fade only, no travel.
        name.style.transform = reduce ? '' : `translate3d(0, ${-out * 64}px, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };

    addEventListener('resize', resize);
    resize();
    raf = requestAnimationFrame(tick);
    return () => { removeEventListener('resize', resize); cancelAnimationFrame(raf); };
  }, []);

  return (
    <section ref={trackRef} className="relative ml-[calc(50%-50vw)] w-screen bg-paper" style={{ height: '268vh' }}>
      <div className="sticky top-0 h-[100dvh] overflow-hidden">
        {/* First frame as a plain image: shows before the frames load, and without script. */}
        <img src={src(0)} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-[1.3] object-cover" />
        <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 block h-full w-full" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent to-paper" />
        {/* Same column as the page below; top padding clears the floating nav. */}
        <div ref={nameRef} className="absolute inset-0 mx-auto flex max-w-[1152px] items-center justify-center px-4 will-change-transform sm:px-6">
          <div className="text-center">
            <h1 className="intro-name display text-balance text-ink" style={{ fontSize: 'clamp(2.75rem, 7vw, 6.5rem)' }}>
              {shopName ?? 'PrintPoint'}
            </h1>
            <p className="mx-auto mt-4 max-w-[30rem] rounded-control bg-paper px-3 py-1.5 text-[1.0625rem] text-ink">
              Xerox and printing in Chennai. Send your files, pay once we accept, collect at the counter.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
