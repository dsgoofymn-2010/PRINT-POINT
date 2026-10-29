import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useMainShop } from '@/lib/mainShop';
import { when } from '@/lib/format';
import { useShopQueue } from '../chat/QueuePanel';
import { Button, cn } from '../ui';
import { drawComposite, loadPlateFonts } from './plates';
import type { PressScene } from './pressScene';

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** One line of live shop state under the call to action. Hidden until the queue answers. */
function ShopLine() {
  const shop = useMainShop().data;
  const q = useShopQueue(shop?.id ?? null).data;
  if (!q) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-[1rem] text-muted">
      <span className={cn('inline-block h-2.5 w-2.5 rounded-full', q.isOpen ? 'bg-positive' : 'bg-negative')} aria-hidden="true" />
      <span className="font-medium text-ink">{q.isOpen ? 'Open now' : 'Closed'}</span>
      {q.isOpen ? (
        <span>
          · {q.pending} waiting · about {q.estimatedWaitMins} min
        </span>
      ) : (
        q.nextOpenAt && <span>· opens {when(q.nextOpenAt)}</span>
      )}
    </p>
  );
}

/**
 * Home hero. A printer feeds out a sheet; scrolling lifts it and pulls it apart into its
 * cyan, magenta, yellow and black plates. Reduced motion or no WebGL gets the finished sheet, still.
 */
export function PressHero({ onStart }: { onStart: () => void }) {
  const reduce = useReducedMotion() ?? false;
  const trackRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<PressScene | null>(null);
  const [ready, setReady] = useState(false);
  const [poster, setPoster] = useState<string | null>(null);
  const webgl = useMemo(hasWebGL, []);
  const shop = useMainShop().data;
  const queue = useShopQueue(shop?.id ?? null).data;
  const open = queue ? queue.isOpen : null;

  // The flat sheet: shown while three.js loads, and instead of it when the scene can't run.
  useEffect(() => {
    let live = true;
    void loadPlateFonts().then(() => {
      if (live) setPoster(drawComposite(0.45).toDataURL('image/png'));
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const track = trackRef.current;
    if (!canvas || !track || !webgl) return;
    let alive = true;
    let scene: PressScene | null = null;
    const cleanups: (() => void)[] = [];

    void import('./pressScene')
      .then(({ mountPressScene }) => mountPressScene(canvas, { textureScale: innerWidth < 768 ? 0.5 : 0.75 }))
      .then((s) => {
        if (!alive) return s.dispose();
        scene = s;
        sceneRef.current = s;
        setReady(true);

        const read = () => {
          if (reduce) return s.setProgress(0.82);
          const r = track.getBoundingClientRect();
          s.setProgress(-r.top / Math.max(1, track.offsetHeight - innerHeight));
        };
        read();
        addEventListener('scroll', read, { passive: true });
        addEventListener('resize', read);
        cleanups.push(() => removeEventListener('scroll', read), () => removeEventListener('resize', read));

        if (!reduce && matchMedia('(hover: hover) and (pointer: fine)').matches) {
          const move = (e: PointerEvent) => s.setPointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
          addEventListener('pointermove', move, { passive: true });
          cleanups.push(() => removeEventListener('pointermove', move));
        }

        // Stop drawing once the hero is off screen or the tab is hidden.
        let visible = true;
        const sync = () => s.setRunning(visible && document.visibilityState === 'visible');
        const io = new IntersectionObserver(([e]) => {
          visible = e.isIntersecting;
          sync();
        });
        io.observe(track);
        document.addEventListener('visibilitychange', sync);
        cleanups.push(() => io.disconnect(), () => document.removeEventListener('visibilitychange', sync));
      })
      .catch(() => {
        if (alive) setReady(false);
      });

    return () => {
      alive = false;
      cleanups.forEach((f) => f());
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [webgl, reduce]);

  useEffect(() => {
    sceneRef.current?.setOpen(open);
  }, [open, ready]);

  return (
    <section
      ref={trackRef}
      aria-labelledby="hero-title"
      className="relative ml-[calc(50%-50vw)] w-screen bg-paper"
      style={{ height: reduce || !webgl ? undefined : '220vh' }}
    >
      <div className={cn('relative flex flex-col overflow-hidden lg:block', reduce || !webgl ? 'min-h-[100dvh]' : 'sticky top-0 h-[100dvh]')}>
        <div className="relative z-10 mx-auto flex w-full max-w-[1152px] flex-col justify-center px-4 pb-4 pt-24 sm:px-6 lg:h-full lg:pb-16">
          <div className="lg:max-w-[400px] xl:max-w-[480px]">
          <h1 id="hero-title" className="hero-type misreg-fine text-[3.5rem] sm:text-[4.75rem] lg:text-[5.75rem]">
            Print it
            <br />
            <em className="italic">nearby.</em>
          </h1>
          <p className="mt-6 max-w-[30rem] text-[1.125rem] leading-relaxed text-muted lg:mt-8">
            Upload your files. We check them, you pay, and you collect at the counter with a code.
          </p>
          <div className="mt-6 flex flex-col items-start gap-4 lg:mt-8">
            <Button variant="action" size="lg" className="min-h-[52px] px-6 text-[1.125rem]" onClick={onStart}>
              Upload your files
            </Button>
            <ShopLine />
          </div>
          {!reduce && webgl && <p className="mt-8 hidden text-[0.9375rem] text-muted lg:block">Scroll to pull the print apart into its four inks.</p>}
          </div>
        </div>

        {/* Phone: fills the space under the text. Desktop: runs from the text column to the screen edge. */}
        <div className="relative min-h-0 flex-1 [perspective:1400px] lg:absolute lg:inset-y-0 lg:left-[46%] lg:right-0 xl:left-[max(42%,calc(50%-96px))]" aria-hidden="true">
          {poster && (
            <img
              src={poster}
              alt=""
              className={cn(
                'absolute left-1/2 top-1/2 h-[78%] max-h-[640px] w-auto shadow-[18px_24px_0_rgb(var(--cyan)/0.25)] transition-opacity duration-500 [transform:translate(-50%,-50%)_rotateY(-16deg)_rotateX(6deg)]',
                ready ? 'opacity-0' : 'opacity-100',
              )}
            />
          )}
          {webgl && <canvas ref={canvasRef} className={cn('absolute inset-0 block h-full w-full transition-opacity duration-700', ready ? 'opacity-100' : 'opacity-0')} />}
        </div>
      </div>
    </section>
  );
}
