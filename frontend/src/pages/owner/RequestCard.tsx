import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { clock, fileSize, rupees, STATUS_LABEL, when } from '@/lib/format';
import { TimePicker, inMinutes } from '@/components/TimePicker';
import type { IncomingRequest } from '@/lib/types';
import { Alert, Badge, Button, cn } from '@/components/ui';
import { Chips } from '@/components/chat/Bubbles';

export function minutesAgo(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ${m % 60} min ago` : new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const DENY_REASONS = ['File unreadable', 'Shop busy', 'Out of colour ink', 'Out of paper', 'Closing soon'];
const READY_IN = [10, 15, 30, 45, 60, 120];
const BUSY_NOTES = ['Shop is busy right now', 'Long queue at the moment', 'Machine under repair'];
/** The shop can ask to move an order until it starts printing. */
const MOVABLE = ['REQUESTED', 'ACCEPTED', 'PAID'];

const TONE = { REQUESTED: 'amber', ACCEPTED: 'brass', PAID: 'brass', PRINTING: 'brass', READY: 'green', COMPLETED: 'gray', DENIED: 'red', CANCELLED: 'red', REFUNDED: 'red' } as const;

/** One incoming request with the single next action the shop can take. */
export function RequestCard({ order, highlight, onlinePayment, defaultReadyMins }: { order: IncomingRequest; highlight: boolean; onlinePayment: boolean; defaultReadyMins: number }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'idle' | 'accept' | 'deny' | 'time'>('idle');
  const [newTime, setNewTime] = useState(() => inMinutes(60));
  const [timeNote, setTimeNote] = useState(BUSY_NOTES[0]);
  const [readyIn, setReadyIn] = useState<number>(defaultReadyMins);
  const [reason, setReason] = useState('');
  const [code, setCode] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);

  const act = useMutation({
    mutationFn: ({ action, body }: { action: string; body?: unknown }) => api.post(`/shop/requests/${order.id}/${action}`, body ?? {}),
    onSuccess: () => {
      setMode('idle');
      setCode('');
      void qc.invalidateQueries({ queryKey: ['owner-requests'] });
    },
  });
  const run = (action: string, body?: unknown) => act.mutate({ action, body });
  const open = (fileId: string, mode: 'inline' | 'attachment') => {
    setFileError(null);
    api.openFile(fileId, mode).catch((e: Error) => setFileError(e.message));
  };

  const first = order.items[0];
  const pages = order.items.reduce((s, i) => s + i.printedPages * i.copies, 0);
  const verify = (e: FormEvent) => {
    e.preventDefault();
    run('collect', { code });
  };

  return (
    <article
      className={cn(
        'rounded-card border bg-surface transition-[box-shadow,border-color] duration-500',
        highlight ? 'border-ink shadow-[0_0_0_4px_rgb(var(--brass))]' : 'border-line',
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="text-[18px] font-semibold">
            {order.customer.name} <span className="num font-normal text-muted">{order.customer.mobile}</span>
          </p>
          <p className="text-[15px] text-muted">
            <span className="num">{order.orderNumber}</span> · received {minutesAgo(order.createdAt)} ({clock(order.createdAt)})
          </p>
        </div>
        <div className="flex items-center gap-2">
          {highlight && <Badge tone="brass">New</Badge>}
          <Badge tone={TONE[order.status as keyof typeof TONE] ?? 'gray'}>{STATUS_LABEL[order.status]}</Badge>
        </div>
      </header>

      <div className="space-y-3 px-4 py-3 text-[16px]">
        <ul className="space-y-2">
          {order.items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="min-w-0 flex-1 truncate font-medium" title={i.fileName}>{i.fileName}</span>
              <span className="num text-muted">{i.printedPages} pg × {i.copies} · {fileSize(i.file.sizeBytes)}</span>
              {i.file.deletedAt ? (
                <span className="text-[15px] text-muted">File deleted</span>
              ) : (
                <span className="flex gap-1">
                  {i.file.mimeType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && (
                    <Button size="sm" variant="ghost" onClick={() => open(i.fileId, 'inline')}>Preview</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => open(i.fileId, 'attachment')}>Download</Button>
                </span>
              )}
            </li>
          ))}
        </ul>
        {fileError && <Alert tone="red">{fileError}</Alert>}

        <p>
          <span className="font-medium">{first?.color === 'COLOR' ? 'Colour' : 'B/W'}</span> · {first?.sides === 'DOUBLE' ? 'double-sided' : 'single-sided'} ·{' '}
          {first?.copies} cop{first?.copies === 1 ? 'y' : 'ies'} · {first?.binding === 'SPIRAL' ? 'spiral binding' : 'no binding'} · <span className="num">{pages}</span> pages to print
        </p>
        {order.specialInstructions && (
          <p className="rounded-control bg-raised px-3 py-2">
            <span className="text-muted">Note: </span>“{order.specialInstructions}”
          </p>
        )}
        <p className="text-[17px]">
          Total <span className="num font-semibold">{rupees(order.total)}</span>
          {order.paidAt && <span className="text-muted"> · paid online</span>}
          {order.estimatedReadyAt && ['ACCEPTED', 'PAID', 'PRINTING'].includes(order.status) && <span className="text-muted"> · promised by {clock(order.estimatedReadyAt)}</span>}
        </p>
        {order.status === 'DENIED' && order.denyReason && <p className="text-muted">Denied: {order.denyReason}</p>}
        {order.scheduledFor && (
          <p className="rounded-control bg-raised px-3 py-2">
            <span className="text-muted">Booked for </span>
            <span className="font-medium">{when(order.scheduledFor)}</span>
          </p>
        )}
        {order.proposedTime && (
          <Alert tone="amber">You asked to move this to {when(order.proposedTime)}. Waiting for the customer to answer.</Alert>
        )}
      </div>

      {/* Actions */}
      <footer className="space-y-3 border-t border-line px-4 py-3">
        {order.status === 'REQUESTED' && mode === 'idle' && (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="lg" onClick={() => setMode('accept')}>Accept</Button>
            <Button variant="danger" size="lg" onClick={() => setMode('deny')}>Deny</Button>
            <Button size="lg" onClick={() => setMode('time')}>Ask for another time</Button>
          </div>
        )}
        {(order.status === 'ACCEPTED' || order.status === 'PAID') && mode === 'idle' && (
          <Button size="lg" onClick={() => setMode('time')}>Ask for another time</Button>
        )}
        {MOVABLE.includes(order.status) && mode === 'time' && (
          <div className="space-y-3">
            <p className="font-medium">Too busy? Suggest a new time. The customer can agree or keep their time.</p>
            <TimePicker
              label="New time"
              value={newTime}
              min={new Date().toISOString()}
              onChange={setNewTime}
              quick={[
                { label: 'In 30 min', iso: inMinutes(30) },
                { label: 'In 1 hour', iso: inMinutes(60) },
                { label: 'In 2 hours', iso: inMinutes(120) },
              ]}
            />
            <Chips label="Message" value={timeNote} onPick={setTimeNote} options={BUSY_NOTES.map((r) => ({ value: r, label: r }))} />
            <input
              value={timeNote}
              onChange={(e) => setTimeNote(e.target.value.slice(0, 200))}
              placeholder="Message for the customer (optional)"
              className="h-11 w-full rounded-control border border-control bg-surface px-3 text-[17px] placeholder:text-muted"
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="lg" loading={act.isPending} onClick={() => run('new-time', { time: newTime, note: timeNote.trim() || null })}>
                Send {when(newTime)}
              </Button>
              <Button size="lg" onClick={() => setMode('idle')}>Back</Button>
            </div>
          </div>
        )}
        {order.status === 'REQUESTED' && mode === 'accept' && (
          <div className="space-y-3">
            <p className="font-medium">Ready in about…</p>
            <Chips label="Ready in" value={readyIn} onPick={setReadyIn} options={READY_IN.map((m) => ({ value: m, label: m < 60 ? `${m} min` : `${m / 60} h` }))} />
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="lg" loading={act.isPending} onClick={() => run('accept', { readyInMinutes: readyIn })}>
                Accept · ready by {clock(new Date(Date.now() + readyIn * 60_000).toISOString())}
              </Button>
              <Button size="lg" onClick={() => setMode('idle')}>Back</Button>
            </div>
          </div>
        )}
        {order.status === 'REQUESTED' && mode === 'deny' && (
          <div className="space-y-3">
            <p className="font-medium">Why? The customer will see this.</p>
            <Chips label="Deny reason" value={reason} onPick={setReason} options={DENY_REASONS.map((r) => ({ value: r, label: r }))} />
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 200))}
              placeholder="Or type a reason"
              className="h-11 w-full rounded-control border border-control bg-surface px-3 text-[17px] placeholder:text-muted"
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" size="lg" loading={act.isPending} disabled={reason.trim().length < 3} onClick={() => run('deny', { reason: reason.trim() })}>
                Deny request
              </Button>
              <Button size="lg" onClick={() => setMode('idle')}>Back</Button>
            </div>
          </div>
        )}
        {order.status === 'ACCEPTED' && onlinePayment && mode === 'idle' && <p className="text-muted">Waiting for the customer to pay online. You’ll be able to start printing once it’s paid.</p>}
        {order.status === 'ACCEPTED' && !onlinePayment && (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" loading={act.isPending} onClick={() => run('printing')}>Mark printing</Button>
            <span className="text-[15px] text-muted">Online payment is off. Collect {rupees(order.total)} at the counter.</span>
          </div>
        )}
        {order.status === 'PAID' && <Button variant="primary" size="lg" loading={act.isPending} onClick={() => run('printing')}>Mark printing</Button>}
        {order.status === 'PRINTING' && <Button variant="primary" size="lg" loading={act.isPending} onClick={() => run('ready')}>Mark ready</Button>}
        {order.status === 'READY' && (
          <form onSubmit={verify} className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-[15px] font-medium">Customer’s pickup code</span>
              <input
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="num h-11 w-40 rounded-control border border-control bg-surface px-3 text-[20px] tracking-[0.3em]"
              />
            </label>
            <Button type="submit" variant="primary" size="lg" loading={act.isPending} disabled={code.length !== 6}>Verify & mark collected</Button>
          </form>
        )}
        {act.error && <Alert tone="red">{act.error.message}</Alert>}
      </footer>
    </article>
  );
}
