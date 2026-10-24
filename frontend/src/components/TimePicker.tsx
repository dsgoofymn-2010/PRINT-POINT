import { toLocalInput, when } from '@/lib/format';
import { cn } from './ui';

export interface QuickTime {
  label: string;
  iso: string;
}

/** Date + time picker with one-tap shortcuts. Works in ISO strings. */
export function TimePicker({
  label,
  value,
  onChange,
  min,
  quick = [],
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  quick?: QuickTime[];
}) {
  return (
    <div className="space-y-2">
      {quick.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={`${label} shortcuts`}>
          {quick.map((q) => {
            const active = Math.abs(new Date(q.iso).getTime() - new Date(value).getTime()) < 60_000;
            return (
              <button
                key={q.label}
                type="button"
                onClick={() => onChange(q.iso)}
                aria-pressed={active}
                className={cn(
                  'min-h-[40px] rounded-control border px-3 text-[15px]',
                  active ? 'border-ink bg-ink text-on-primary' : 'border-line bg-surface hover:bg-active',
                )}
              >
                {q.label}
              </button>
            );
          })}
        </div>
      )}
      <label className="block">
        <span className="mb-1 block text-[15px] font-medium">{label}</span>
        <input
          type="datetime-local"
          value={toLocalInput(new Date(value))}
          min={min ? toLocalInput(new Date(min)) : undefined}
          onChange={(e) => e.target.value && onChange(new Date(e.target.value).toISOString())}
          className="h-11 w-full max-w-xs rounded-control border border-control bg-surface px-3 text-[17px]"
        />
      </label>
      <p className="text-[15px] text-muted">{when(value)}</p>
    </div>
  );
}

/** Now + some minutes, rounded up to the next 15 minutes. */
export function inMinutes(mins: number, from = Date.now()): string {
  const step = 15 * 60_000;
  return new Date(Math.ceil((from + mins * 60_000) / step) * step).toISOString();
}

/** Tomorrow at the given "HH:mm" (local time). */
export function tomorrowAt(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(h, m || 0, 0, 0);
  return d.toISOString();
}
