import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { useState, type PointerEvent, type ReactNode } from 'react';

const finePointer = () => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;

/**
 * Tilts its child toward the mouse like a slip of paper picked up off the counter.
 * Only for glanceable cards (codes, live numbers), never around forms. Off for touch and reduced motion.
 */
export function Tilt({ children, className, max = 7 }: { children: ReactNode; className?: string; max?: number }) {
  const reduce = useReducedMotion();
  const [on] = useState(finePointer);
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const sx = useSpring(rx, { stiffness: 220, damping: 20 });
  const sy = useSpring(ry, { stiffness: 220, damping: 20 });

  if (reduce || !on) return <div className={className}>{children}</div>;

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 2 * max);
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 2 * max);
  };
  const leave = () => {
    rx.set(0);
    ry.set(0);
  };

  return (
    <div className={className} style={{ perspective: 800 }}>
      <motion.div onPointerMove={move} onPointerLeave={leave} style={{ rotateX: sx, rotateY: sy, transformStyle: 'preserve-3d' }}>
        {children}
      </motion.div>
    </div>
  );
}
