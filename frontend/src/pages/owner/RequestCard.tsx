import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { clock, rupees, STATUS_LABEL, when } from '@/lib/format';
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

<<<<<<< HEAD
const TONE = { REQUESTED: 'amber', ACCEPTED: 'yellow', PAID: 'yellow', PRINTING: 'yellow', READY: 'green', COMPLETED: 'gray', DENIED: 'red', CANCELLED: 'red', REFUNDED: 'red' } as const;

/** One incoming request with the single next action the shop can take. */
export function RequestCard({ order, highlight, onlinePayment, defaultReadyMins }: { order: IncomingRequest; highlight: boolean; onlinePayment: boolean; defaultReadyMins: number }) {
=======
const TONE = { REQUESTED: 'amber', ACCEPTED: 'brass', PAID: 'brass', PRINTING: 'brass', READY: 'green', COMPLETED: 'gray', DENIED: 'red', CANCELLED: 'red', REFUNDED: 'red' } as const;

/** One incoming request with the single next action the shop can take. */
export function RequestCard({ order, showStatus = true, highlight, onlinePayment, defaultReadyMins }: { order: IncomingRequest; showStatus?: boolean; highlight: boolean; onlinePayment: boolean; defaultReadyMins: number }) {
>>>>>>> fc060c7b2d80010a918ee9c381a985626c1701c7
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

  const spec = [
    first?.color === 'COLOR' ? 'Colour' : 'B/W',
    first?.sides === 'DOUBLE' ? '2-sided' : '1-sided',
    `${first?.copies ?? 1} cop${first?.copies === 1 ? 'y' : 'ies'}`,
    first?.binding && first.binding !== 'NONE' ? `${first.binding.toLowerCase()} binding` : null,
<<<<<<< HEAD
    `${pages} pg`,
=======
    `${pages} ${pages === 1 ? 'page' : 'pages'}`,
>>>>>>> fc060c7b2d80010a918ee9c381a985626c1701c7
  ].filter(Boolean).join(' · ');

  return (
    <article
      className={cn(
        'rounded-card border-2 bg-surface text-[0.9375rem] transition-colors duration-500',
<<<<<<< HEAD
        highlight ? 'border-magenta' : 'border-line',
=======
        highlight ? 'border-brass' : 'border-line',
>>>>>>> fc060c7b2d80010a918ee9c381a985626c1701c7
      )}
    >
      <div className="space-y-1.5 px-3.5 py-3">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate">
            <span className="font-semibold">{order.customer.name}</span>
            <span className="text-muted"> · {minutesAgo(order.createdAt)}</span>
          </p>
<<<<<<< HEAD
          {highlight && <Badge tone="magenta">New</Badge>}
          <Badge tone={TONE[order.status as keyof typeof TONE] ?? 'gray'}>{STATUS_LABEL[order.status]}</Badge>
          <span className="num font-semibold">{rupees(order.total)}</span>
        </div>

        <p className="text-muted">{spec}{order.paidAt ? ' · paid' : ''}</p>
=======
          {highlight && <Badge tone="brass">New</Badge>}
          {showStatus && <Badge tone={TONE[order.status as keyof typeof TONE] ?? 'gray'}>{STATUS_LABEL[order.status]}</Badge>}
          <span className="num font-semibold">{rupees(order.total)}</span>
        </div>

        <p className="text-muted">{spec}{order.paidAt ? ' · Paid' : ''}</p>
>>>>>>> fc060c7b2d80010a918ee9c381a985626c1701c7

        <ul className="space-y-0.5">
          {order.items.map((i) => (
            <li key={i.id} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate" title={i.fileName}>{i.fileName}</span>
              {i.file.deletedAt ? (
<<<<<<< HEAD
                <span className="text-muted">deleted</span>
=======
                <span className="text-muted">File deleted</span>
>>>>>>> fc060c7b2d80010a918ee9c381a985626c1701c7
              ) : (
                <span className="flex flex-none gap-3 text-[0.875rem]">
                  {i.file.mimeType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && (
                    <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={() => open(i.fileId, 'inline')}>View</button>
                  )}
                  <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={() => open(i.fileId, 'attachment')}>Download</button>
                </span>
              )}
            </li>
          ))}
        </ul>
        {fileError && <Alert tone="red">{fileError}</Alert>}

        {(order.specialInstructions || order.scheduledFor || (order.estimatedReadyAt && ['ACCEPTED', 'PAID', 'PRINTING'].includes(order.status))) && (
          <p className="text-[0.875rem]">
            {order.scheduledFor && <span>Booked for <span className="font-medium">{when(order.scheduledFor)}</span>. </span>}
<<<<<<< HEAD
            {order.estimatedReadyAt && ['ACCEPTED', 'PAID', 'PRINTING'].includes(order.status) && <span>Promised by {clock(order.estimatedReadyAt)}. </span>}
=======
            {order.estimatedReadyAt && ['ACCEPTED', 'PAID', 'PRINTING'].includes(order.status) && <span>Promised for {clock(order.estimatedReadyAt)}. </span>}
>>>>>>> fc060c7b2d80010a918ee9c381a985626c1701c7
            {order.specialInstructions && <span className="text-muted">Note: “{order.specialInstructions}”</span>}
          </p>
        )}
        {order.status === 'DENIED' && order.denyReason && <p className="text-muted">Denied: {order.denyReason}</p>}
<<<<<<< HEAD
        {order.proposedTime && <p className="text-[0.875rem] text-cyan-ink">Asked to move to {when(order.proposedTime)}. Waiting for the customer.</p>}
=======
        {order.proposedTime && <p className="text-[0.875rem] text-brass-ink">You suggested {when(order.proposedTime)}. Waiting for the customer to reply.</p>}
>>>>>>> fc060c7b2d80010a918ee9c381a985626c1701c7
      </div>

      {/* Actions */}
      <footer className="space-y-3 border-t border-line px-3.5 py-2.5">
        {order.status === 'REQUESTED' && mode === 'idle' && (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => setMode('accept')}>Accept</Button>
            <Button variant="danger" onClick={() => setMode('deny')}>Deny</Button>
            <Button onClick={() => setMode('time')}>Other time</Button>
          </div>
        )}
        {(order.status === 'ACCEPTED' || order.status === 'PAID') && mode === 'idle' && (
          <Button onClick={() => setMode('time')}>Other time</Button>
        )}
        {MOVABLE.includes(order.status) && mode === 'time' && (
          <div className="space-y-3">
<<<<<<< HEAD
            <p className="font-medium">Too busy? Suggest a new time. The customer can agree or keep their time.</p>
=======
            <p className="font-medium">Suggest a new time. The customer can accept it or keep theirs.</p>
>>>>>>> fc060c7b2d80010a918ee9c381a985626c1701c7
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
              className="h-11 w-full rounded-control border border-control bg-surface px-3 text-[1.0625rem] placeholder:text-muted"
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" loading={act.isPending} onClick={() => run('new-time', { time: newTime, note: timeNote.trim() || null })}>
                Send {when(newTime)}
              </Button>
              <Button onClick={() => setMode('idle')}>Back</Button>
            </div>
          </div>
        )}
        {order.status === 'REQUESTED' && mode === 'accept' && (
          <div className="space-y-3">
<<<<<<< HEAD
            <p className="font-medium">Ready in about…</p>
=======
            <p className="font-medium">How soon will it be ready?</p>
>>>>>>> fc060c7b2d80010a918ee9c381a985626c1701c7
            <Chips label="Ready in" value={readyIn} onPick={setReadyIn} options={READY_IN.map((m) => ({ value: m, label: m < 60 ? `${m} min` : `${m / 60} h` }))} />
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" loading={act.isPending} onClick={() => run('accept', { readyInMinutes: readyIn })}>
                Accept · ready by {clock(new Date(Date.now() + readyIn * 60_000).toISOString())}
              </Button>
              <Button onClick={() => setMode('idle')}>Back</Button>
            </div>
          </div>
        )}
        {order.status === 'REQUESTED' && mode === 'deny' && (
          <div className="space-y-3">
<<<<<<< HEAD
            <p className="font-medium">Why? The customer will see this.</p>
=======
            <p className="font-medium">Tell the customer why. They will see this message.</p>
>>>>>>> fc060c7b2d80010a918ee9c381a985626c1701c7
            <Chips label="Deny reason" value={reason} onPick={setReason} options={DENY_REASONS.map((r) => ({ value: r, label: r }))} />
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 200))}
              placeholder="Or type a reason"
              className="h-11 w-full rounded-control border border-control bg-surface px-3 text-[1.0625rem] placeholder:text-muted"
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" loading={act.isPending} disabled={reason.trim().length < 3} onClick={() => run('deny', { reason: reason.trim() })}>
                Deny request
              </Button>
              <Button onClick={() => setMode('idle')}>Back</Button>
            </div>
          </div>
        )}
<<<<<<< HEAD
        {order.status === 'ACCEPTED' && onlinePayment && mode === 'idle' && <p className="text-muted">Waiting for the customer to pay.</p>}
        {order.status === 'ACCEPTED' && !onlinePayment && (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" loading={act.isPending} onClick={() => run('printing')}>Mark printing</Button>
            <span className="text-[0.9375rem] text-muted">Collect {rupees(order.total)} at the counter.</span>
=======
        {order.status === 'ACCEPTED' && onlinePayment && mode === 'idle' && <p className="text-muted">Waiting for the customer to pay online.</p>}
        {order.status === 'ACCEPTED' && !onlinePayment && (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" loading={act.isPending} onClick={() => run('printing')}>Mark printing</Button>
            <span className="text-[0.9375rem] text-muted">Collect {rupees(order.total)} when they pick up.</span>
>>>>>>> fc060c7b2d80010a918ee9c381a985626c1701c7
          </div>
        )}
        {order.status === 'PAID' && <Button variant="primary" loading={act.isPending} onClick={() => run('printing')}>Mark printing</Button>}
        {order.status === 'PRINTING' && <Button variant="primary" loading={act.isPending} onClick={() => run('ready')}>Mark ready</Button>}
        {order.status === 'READY' && (
          <form onSubmit={verify} className="flex flex-wrap items-center gap-2">
            <label className="block">
              <span className="sr-only">Customer’s pickup code</span>
              <input
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="Pickup code"
                className="num h-10 w-36 rounded-control border border-control bg-surface px-3 tracking-[0.2em] placeholder:tracking-normal"
              />
            </label>
            <Button type="submit" variant="primary" loading={act.isPending} disabled={code.length !== 6}>Mark collected</Button>
          </form>
        )}
        {act.error && <Alert tone="red">{act.error.message}</Alert>}
      </footer>
    </article>
  );
}
