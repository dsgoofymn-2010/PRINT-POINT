import type { ReactNode } from 'react';
import { Mark } from '../Layout';
import { cn } from '../ui';

/** A message from the print assistant. */
export function Bot({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <Mark className="mt-1 h-7 w-7" />
      <div className="min-w-0 max-w-[40rem] flex-1 space-y-3 text-[1.125rem] leading-[28px]">{children}</div>
    </div>
  );
}

/** The customer's answer, right-aligned. Tapping it goes back to change the answer. */
export function Me({ children, onEdit }: { children: ReactNode; onEdit?: () => void }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-card rounded-br-none bg-primary px-4 py-2.5 text-[1.0625rem] text-on-primary">
        {children}
        {onEdit && (
          <button onClick={onEdit} className="ml-3 text-[0.9375rem] underline underline-offset-2 opacity-80 hover:opacity-100">
            Change
          </button>
        )}
      </div>
    </div>
  );
}

/** Tappable answer chips; at least 44px tall for thumbs. */
export function Chips<T extends string | number>({
  options,
  value,
  onPick,
  label,
}: {
  options: { value: T; label: ReactNode; hint?: ReactNode; disabled?: boolean }[];
  value?: T | null;
  onPick: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          disabled={o.disabled}
          aria-pressed={value === o.value}
          onClick={() => onPick(o.value)}
          className={cn(
            'min-h-[44px] rounded-control border px-4 py-2 text-left text-[1.0625rem] transition-colors disabled:cursor-not-allowed disabled:opacity-45',
            value === o.value ? 'border-ink bg-brass text-brass-ink' : 'border-control bg-surface text-ink hover:border-ink',
          )}
        >
          <span className="block font-medium">{o.label}</span>
          {o.hint && <span className="block text-[0.9375rem] text-muted">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}

export function Typing() {
  return (
    <span className="inline-flex gap-1" aria-label="Assistant is typing">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-2 w-2 animate-pulse rounded-full bg-muted" style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </span>
  );
}
