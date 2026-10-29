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
  const titleRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    const cv = canvasRef.current;
    const title = titleRef.current;
    const ctx = cv?.getContext('2d');
    if (!track || !cv || !ctx || !title) return;
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
    let shownTitle = -1;
    // The title rides the same smoothed frame position, so it starts as the sheet covers the
    // screen (~frame 116) and reaches full size a little before the intro ends, then holds.
    const placeTitle = () => {
      const t = clamp((cur / (N - 1) - 0.68) / 0.25);
      if (t === shownTitle) return;
      shownTitle = t;
      const grow = 1 - Math.pow(1 - t, 3);
      title.style.opacity = String(clamp(t / 0.3));
      title.style.transform = reduce ? 'none' : `scale(${0.28 + 0.72 * grow})`;
    };
    const tick = () => {
      const p = clamp(-track.getBoundingClientRect().top / (track.offsetHeight - innerHeight));
      const target = p * (N - 1);
      cur = reduce ? target : cur + (target - cur) * 0.18;
      if (Math.abs(target - cur) < 0.05) cur = target;
      draw(Math.round(cur));
      placeTitle();
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
      className="relative -mt-24 ml-[calc(50%-50vw)] w-screen bg-[#e7e8e7]"
      style={{ height: '268vh' }}
    >
      {/* The video's own grey, so the frames have no seam; the bottom fade hands over to the paper ground. */}
      <div className="sticky top-0 h-[100dvh] overflow-hidden bg-[#e7e8e7]">
        <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent to-paper" />
        {/* Printed onto the blank sheet: ink roman + magenta italic, same Bodoni as the hero. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4">
          <p
            ref={titleRef}
            className="hero-type misreg-fine whitespace-nowrap text-center text-[clamp(3.25rem,14vw,13rem)] text-ink opacity-0"
            // A mid optical size keeps Bodoni's hairlines visible at this poster scale.
            style={{ transform: 'scale(0.28)', fontVariationSettings: "'opsz' 22", fontWeight: 600 }}
          >
            Print <em className="italic text-magenta">Point</em>
          </p>
        </div>
      </div>
    </section>
  );
}
