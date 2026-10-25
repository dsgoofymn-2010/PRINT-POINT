import { useState } from 'react';

/**
 * Column chart by the app-screen rules: square bars on a zero baseline, 4 faint gridlines,
 * round ticks above the maximum, no y-axis line, and the one data hue (brass) only on the
 * highlighted bar (today). Everything else is ink.
 */
export interface BarDatum {
  label: string;
  value: number;
  highlight?: boolean;
}

function niceStep(max: number, ticks = 4) {
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

export function Bars({ data, format, height = 200, ariaLabel }: { data: BarDatum[]; format: (v: number) => string; height?: number; ariaLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step + (max % step === 0 ? step : 0);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const W = 640;
  const left = 56;
  const plotW = W - left - 8;
  const plotH = height - 28;
  const slot = plotW / data.length;
  const bw = Math.min(40, slot * 0.6);
  const y = (v: number) => 8 + plotH - (v / top) * plotH;
  const labelEvery = Math.ceil(data.length / 7);

  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${height + 8}`} className="block h-auto w-full" role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - 8} y1={y(t)} y2={y(t)} stroke="rgb(var(--border))" strokeWidth={t === 0 ? 2 : 1} />
            <text x={left - 8} y={y(t) + 4} textAnchor="end" fontSize="12" fill="rgb(var(--muted))" className="num">
              {format(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = left + slot * i + (slot - bw) / 2;
          const h = y(0) - y(d.value);
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={left + slot * i} y={8} width={slot} height={plotH} fill="transparent" />
              {d.value > 0 && <rect x={x} y={y(d.value)} width={bw} height={h} fill={d.highlight ? 'rgb(var(--data))' : 'rgb(var(--ink))'} opacity={hover === null || hover === i ? 1 : 0.45} />}
              {(i % labelEvery === 0 || i === data.length - 1) && (
                <text x={x + bw / 2} y={height + 4} textAnchor="middle" fontSize="12" fill={d.highlight ? 'rgb(var(--ink))' : 'rgb(var(--muted))'}>
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <figcaption className="num pointer-events-none absolute right-0 top-0 rounded-control bg-surface px-2 py-1 text-[0.875rem]">
          {data[hover].label}: {format(data[hover].value)}
        </figcaption>
      )}
    </figure>
  );
}
