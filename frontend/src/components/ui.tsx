import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// Achromatic ledger: one near-black primary per screen, a grey secondary, text tertiary.
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'brass';
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:opacity-90 active:opacity-80 disabled:opacity-40',
  secondary: 'border border-control bg-surface text-ink hover:bg-raised active:bg-active disabled:opacity-50',
  ghost: 'text-ink hover:bg-active disabled:opacity-50',
  danger: 'border border-control bg-surface text-negative hover:bg-raised disabled:opacity-50',
  brass: 'bg-brass text-brass-ink hover:brightness-95 active:brightness-90 disabled:opacity-50',
};
const sizes = { sm: 'h-8 px-3 text-[14px]', md: 'h-9 px-4 text-sm', lg: 'h-11 px-5 text-[15px]' };
const btnBase =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium transition-[background-color,opacity,transform] duration-150 active:translate-y-px disabled:cursor-not-allowed';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  size?: keyof typeof sizes;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', loading, size = 'md', className, children, disabled, ...rest },
  ref,
) {
  return (
    <button ref={ref} disabled={disabled || loading} className={cn(btnBase, sizes[size], variants[variant], className)} {...rest}>
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
});

export function ButtonLink({ to, variant = 'secondary', className, children, size = 'md' }: { to: string; variant?: Variant; className?: string; children: ReactNode; size?: keyof typeof sizes }) {
  return (
    <Link to={to} className={cn(btnBase, sizes[size], variants[variant], className)}>
      {children}
    </Link>
  );
}

const fieldCls =
  'w-full h-10 rounded-control border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none disabled:bg-raised disabled:text-muted';

function FieldWrap({ label, hint, error, id, children }: { label?: string; hint?: string; error?: string; id: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-err`} className="text-[14px] text-negative" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-[14px] text-muted">{hint}</p>
      )}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; error?: string };
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, hint, error, id, className, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap label={label} hint={hint} error={error} id={fid}>
      <input ref={ref} id={fid} aria-invalid={!!error} aria-describedby={error ? `${fid}-err` : undefined} className={cn(fieldCls, error && 'border-negative', className)} {...rest} />
    </FieldWrap>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hint?: string; error?: string; options: { value: string; label: string }[] };
export function Select({ label, hint, error, id, options, className, ...rest }: SelectProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap label={label} hint={hint} error={error} id={fid}>
      <select id={fid} className={cn(fieldCls, 'border-control pr-8', className)} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldWrap>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string; error?: string };
export function Textarea({ label, hint, error, id, className, ...rest }: TextareaProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap label={label} hint={hint} error={error} id={fid}>
      <textarea id={fid} className={cn(fieldCls, 'h-auto min-h-[88px] py-2', className)} {...rest} />
    </FieldWrap>
  );
}

/** Segmented control: as wide as its options; 40px targets for thumbs. */
export function Segmented<T extends string>({ label, value, onChange, options, name }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; name: string }) {
  return (
    <fieldset>
      <legend className="mb-2 block text-sm font-medium text-ink">{label}</legend>
      <div className="inline-flex max-w-full flex-wrap gap-1 rounded-control bg-active p-1">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'cursor-pointer rounded-[5px] px-3 py-1.5 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink',
              value === o.value ? 'bg-surface font-medium text-ink' : 'text-muted hover:text-ink',
            )}
          >
            <input type="radio" className="sr-only" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** A panel. `flush` lets a table or list run to the card's edges while the header keeps the padding. */
export function Card({ className, children, title, action, flush }: { className?: string; children: ReactNode; title?: ReactNode; action?: ReactNode; flush?: boolean }) {
  return (
    <section className={cn('rounded-card border border-line bg-surface', flush ? 'pb-2' : 'p-5', className)}>
      {(title || action) && (
        <div className={cn('mb-4 flex items-baseline justify-between gap-3', flush && 'mb-2 px-5 pt-5')}>
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const tones = {
  gray: 'bg-active text-ink',
  blue: 'bg-active text-ink',
  green: 'bg-[#dcfae5] text-[#04250e] dark:bg-[#172a1d] dark:text-[#3fc07a]',
  amber: 'bg-[#fffbeb] text-[#92400e] dark:bg-[#2a2410] dark:text-[#e0c060]',
  red: 'bg-[#ffedea] text-[#831c1e] dark:bg-[#2c1a20] dark:text-[#e5566f]',
  brass: 'bg-brass text-brass-ink',
};
export function Badge({ tone = 'gray', children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={cn('inline-flex h-5 flex-none items-center whitespace-nowrap rounded-chip px-1.5 text-xs font-medium', tones[tone])}>{children}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className ?? 'h-5 w-5')} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".2" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

/** Loading keeps the layout: flat grey bars at the size of the rows they stand for. */
export function Loading({ label = 'Loading', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-label={label} className="space-y-3 py-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-10 rounded-control bg-active" style={{ width: `${92 - i * 14}%` }} />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-control px-5 py-6">
      <p className="font-medium">{title}</p>
      {body && <p className="mt-1 text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Something went wrong';
  return (
    <div role="alert" className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-control bg-[#ffedea] px-3 py-2 text-sm text-[#831c1e] dark:bg-[#2c1a20] dark:text-[#e5566f]">
      <span>{msg}</span>
      {onRetry && (
        <button onClick={onRetry} className="font-medium underline underline-offset-2">
          Retry
        </button>
      )}
    </div>
  );
}

export function Alert({ tone = 'blue', children }: { tone?: 'blue' | 'green' | 'amber' | 'red'; children: ReactNode }) {
  const t = {
    blue: 'bg-active text-ink',
    green: 'bg-[#dcfae5] text-[#04250e] dark:bg-[#172a1d] dark:text-[#3fc07a]',
    amber: 'border border-[#fde68a] bg-[#fffbeb] text-[#92400e] dark:border-transparent dark:bg-[#2a2410] dark:text-[#e0c060]',
    red: 'bg-[#ffedea] text-[#831c1e] dark:bg-[#2c1a20] dark:text-[#e5566f]',
  }[tone];
  return <div className={cn('rounded-control px-3 py-2 text-sm', t)}>{children}</div>;
}

/** Underline tabs on a full-width rule; scroll sideways on a phone. */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex gap-5 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            '-mb-px whitespace-nowrap border-b-2 pb-2.5 pt-1 text-sm transition-colors',
            value === t.value ? 'border-ink font-medium text-ink' : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {t.label}
          {t.count != null && t.count > 0 && <span className="ml-1.5 text-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** One KPI cell; group several inside <KpiStrip> so they share one container split by dividers. */
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="px-5 py-4">
      <p className="text-[14px] text-muted">{label}</p>
      <p className="num mt-1 text-2xl font-medium leading-8">{value}</p>
      {hint && <p className="mt-0.5 text-[14px] text-muted">{hint}</p>}
    </div>
  );
}

export function KpiStrip({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const c = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' }[cols];
  return <div className={cn('grid grid-cols-2 divide-line rounded-card border border-line bg-surface sm:divide-x [&>*]:border-line max-sm:[&>*:nth-child(n+3)]:border-t max-sm:[&>*:nth-child(even)]:border-l', c)}>{children}</div>;
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold leading-8 tracking-[-0.01em]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

/** Key/value row used in summaries; figures share one right edge. */
export function Row({ label, value, strong, tone }: { label: ReactNode; value: ReactNode; strong?: boolean; tone?: 'positive' }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-1', strong && 'mt-1 border-t border-line pt-3 text-base font-semibold')}>
      <span className={cn(!strong && 'text-muted', tone === 'positive' && 'text-positive')}>{label}</span>
      <span className={cn('num text-right', tone === 'positive' && 'text-positive')}>{value}</span>
    </div>
  );
}
