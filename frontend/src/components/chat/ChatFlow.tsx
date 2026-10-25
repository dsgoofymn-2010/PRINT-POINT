import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { rupees } from '@/lib/format';
import type { ChatOptions, PrintRequest, Quote } from '@/lib/types';
import { useMainShop } from '@/lib/mainShop';
import { when } from '@/lib/format';
import { TimePicker, inMinutes } from '../TimePicker';
import { Alert, Button, ErrorState } from '../ui';
import { Bot, Chips, Me } from './Bubbles';
import { FileStep } from './FileStep';
import { useMyRequests } from './MyRequests';
import { PhoneStep } from './PhoneStep';
import { PriceSummary, type Rates } from './PriceSummary';
import { useShopQueue } from './QueuePanel';
import { StatusCard } from './StatusCard';
import { useChatFiles } from './useChatFiles';

const STEPS = ['files', 'color', 'sides', 'copies', 'binding', 'note', 'review', 'sent'] as const;
type Step = (typeof STEPS)[number];

const COPY_CHIPS = [1, 2, 3, 5, 10];

/** The home page: a print assistant that asks one thing at a time. */
export function ChatFlow() {
  const { user, loading: authLoading } = useAuth();
  const qc = useQueryClient();
  const files = useChatFiles(Boolean(user));
  const [step, setStep] = useState<Step>('files');
  const [opts, setOpts] = useState<Partial<ChatOptions>>({});
  const [customCopies, setCustomCopies] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [sentId, setSentId] = useState<string | null>(null);
  const [bookAt, setBookAt] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const at = (s: Step) => STEPS.indexOf(step) >= STEPS.indexOf(s);
  const go = (s: Step) => setStep(s);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [step, files.files.length]);

  const mainShop = useMainShop();
  const shop = mainShop.data ?? null;
  const shopId = shop?.id ?? null;
  const queue = useShopQueue(shopId);
  const shopOpen = queue.data?.isOpen ?? shop?.isOpen ?? false;
  // While closed, customers book a time from the shop's next opening onwards.
  const nextOpen = shopOpen ? null : (queue.data?.nextOpenAt ?? shop?.nextOpenAt ?? null);
  const bookTime = nextOpen && bookAt && bookAt >= nextOpen ? bookAt : nextOpen;

  const options = opts as ChatOptions;
  const fileInput = useMemo(
    () => files.ready.map((f) => ({ fileId: f.uploaded!.id, ...(f.uploaded!.pageCount == null && f.pagesOverride ? { pagesOverride: f.pagesOverride } : {}) })),
    [files.ready],
  );
  const body = { shopId, files: fileInput, options };
  const quote = useQuery({
    queryKey: ['quote', body],
    queryFn: () => api.post<{ quote: Quote; rates: Rates }>('/requests/quote', body),
    enabled: at('review') && step !== 'sent' && Boolean(shopId) && fileInput.length > 0,
    staleTime: 10_000,
  });

  const send = useMutation({
    mutationFn: () => api.post<{ order: PrintRequest }>('/requests', { ...body, note: note || null, scheduledFor: shopOpen ? null : bookTime }),
    onSuccess: (r) => {
      setSentId(r.order.id);
      qc.setQueryData<PrintRequest[]>(['requests', user?.id], (old) => [r.order, ...(old ?? [])]);
      void qc.invalidateQueries({ queryKey: ['requests'] });
      go('sent');
    },
  });

  const mine = useMyRequests();
  const sent = mine.data?.find((o) => o.id === sentId) ?? (send.data?.order.id === sentId ? send.data?.order : undefined);

  const startOver = () => {
    files.reset();
    setOpts({});
    setNote(null);
    setNoteDraft('');
    setCustomCopies('');
    setSentId(null);
    send.reset();
    go('files');
  };

  const canContinueFiles = files.ready.length > 0 && !files.busy && files.needPages.length === 0;
  const copyLabel = (n: number) => `${n} cop${n === 1 ? 'y' : 'ies'}`;
  const edit = (s: Step) => (step === 'sent' ? undefined : () => go(s));

  return (
    <div className="space-y-6 pb-6">
      {mainShop.isError && <Alert tone="amber">The shop isn’t taking online requests yet. Please check back soon.</Alert>}
      {shop && !shopOpen && step !== 'sent' && (
        <Alert tone="amber">
          {nextOpen
            ? `${shop.name} is closed right now and opens ${when(nextOpen)}. You can still send your files and book a time.`
            : `${shop.name} is closed right now and hasn’t said when it opens again.`}
        </Alert>
      )}
      <Bot>
        <p>
          Hi! I’ll get your printing sorted. <span className="font-medium">Upload the files you want printed.</span>
        </p>
        <FileStep
          files={files.files}
          onAdd={files.add}
          onRemove={files.remove}
          onRetry={files.retry}
          onPages={files.setPages}
          signedIn={Boolean(user)}
          locked={step !== 'files'}
        />
        {!user && !authLoading && files.files.some((f) => f.status === 'waiting') && (
          <div className="space-y-3 rounded-card border border-line bg-raised p-4">
            <p>Before I upload them, what’s your mobile number? It lets the shop reach you and keeps your requests in one place.</p>
            <PhoneStep />
          </div>
        )}
        {step === 'files' && files.ready.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" disabled={!canContinueFiles} onClick={() => go('color')}>
              Continue with {files.ready.length} file{files.ready.length === 1 ? '' : 's'}
            </Button>
            {files.busy && <span className="text-[1rem] text-muted">Waiting for uploads to finish…</span>}
            {!files.busy && files.needPages.length > 0 && <span className="text-[1rem] text-muted">Enter the page count above to continue.</span>}
          </div>
        )}
      </Bot>

      {at('color') && shop && (
        <>
          <Me onEdit={edit('files')}>
            {files.ready.length} file{files.ready.length === 1 ? '' : 's'} ready
          </Me>
          <Bot>
            <p>Black & white or colour?</p>
            {step === 'color' && (
              <Chips
                label="Colour"
                value={opts.color}
                onPick={(color) => {
                  setOpts((o) => ({ ...o, color }));
                  go('sides');
                }}
                options={[
                  { value: 'BW' as const, label: 'Black & white', hint: queue.data?.prices ? `from ${rupees(queue.data.prices.bwDouble)}/page` : undefined },
                  { value: 'COLOR' as const, label: 'Colour', hint: queue.data?.prices ? `from ${rupees(queue.data.prices.colorDouble)}/page` : undefined },
                ]}
              />
            )}
          </Bot>
        </>
      )}

      {at('sides') && opts.color && (
        <>
          <Me onEdit={edit('color')}>{opts.color === 'COLOR' ? 'Colour' : 'Black & white'}</Me>
          <Bot>
            <p>Single-sided or double-sided?</p>
            {step === 'sides' && (
              <Chips
                label="Sides"
                value={opts.sides}
                onPick={(sides) => {
                  setOpts((o) => ({ ...o, sides }));
                  go('copies');
                }}
                options={(['SINGLE', 'DOUBLE'] as const).map((v) => {
                  const p = queue.data?.prices;
                  const rate = p && (opts.color === 'COLOR' ? (v === 'DOUBLE' ? p.colorDouble : p.colorSingle) : v === 'DOUBLE' ? p.bwDouble : p.bwSingle);
                  return { value: v, label: v === 'SINGLE' ? 'Single-sided' : 'Double-sided', hint: rate != null ? `${rupees(rate)} per page` : undefined };
                })}
              />
            )}
          </Bot>
        </>
      )}

      {at('copies') && opts.sides && (
        <>
          <Me onEdit={edit('sides')}>{opts.sides === 'DOUBLE' ? 'Double-sided' : 'Single-sided'}</Me>
          <Bot>
            <p>How many copies?</p>
            {step === 'copies' && (
              <div className="space-y-3">
                <Chips
                  label="Copies"
                  value={opts.copies}
                  onPick={(copies) => {
                    setOpts((o) => ({ ...o, copies }));
                    go('binding');
                  }}
                  options={COPY_CHIPS.map((n) => ({ value: n, label: String(n) }))}
                />
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const n = Number(customCopies);
                    if (Number.isInteger(n) && n >= 1 && n <= 100) {
                      setOpts((o) => ({ ...o, copies: n }));
                      go('binding');
                    }
                  }}
                >
                  <label htmlFor="copies-other" className="text-[1rem] text-muted">Other</label>
                  <input
                    id="copies-other"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    value={customCopies}
                    onChange={(e) => setCustomCopies(e.target.value)}
                    className="num h-11 w-24 rounded-control border border-control bg-surface px-3 text-[1.0625rem]"
                  />
                  <Button type="submit" size="lg" disabled={!customCopies || Number(customCopies) < 1 || Number(customCopies) > 100}>OK</Button>
                </form>
              </div>
            )}
          </Bot>
        </>
      )}

      {at('binding') && opts.copies && (
        <>
          <Me onEdit={edit('copies')}>{copyLabel(opts.copies)}</Me>
          <Bot>
            <p>Any binding?</p>
            {step === 'binding' && (
              <Chips
                label="Binding"
                value={opts.binding}
                onPick={(binding) => {
                  setOpts((o) => ({ ...o, binding }));
                  go('note');
                }}
                options={[
                  { value: 'NONE' as const, label: 'No binding' },
                  {
                    value: 'SPIRAL' as const,
                    label: 'Spiral binding',
                    hint: queue.data?.prices?.spiralBinding ? `${rupees(queue.data.prices.spiralBinding)} per copy` : 'not offered here',
                    disabled: queue.data?.prices ? queue.data.prices.spiralBinding <= 0 : false,
                  },
                ]}
              />
            )}
          </Bot>
        </>
      )}

      {at('note') && opts.binding && (
        <>
          <Me onEdit={edit('binding')}>{opts.binding === 'SPIRAL' ? 'Spiral binding (each copy)' : 'No binding'}</Me>
          <Bot>
            <p>Anything the shop should know? (optional)</p>
            {step === 'note' && (
              <div className="space-y-2">
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value.slice(0, 500))}
                  rows={2}
                  placeholder="e.g. Print pages 1–3 only in colour, staple each set"
                  className="w-full rounded-control border border-control bg-surface px-3 py-2 text-[1.0625rem] placeholder:text-muted focus:border-ink focus:outline-none"
                />
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" size="lg" disabled={!noteDraft.trim()} onClick={() => { setNote(noteDraft.trim()); go('review'); }}>Add note</Button>
                  <Button size="lg" onClick={() => { setNote(null); setNoteDraft(''); go('review'); }}>No note</Button>
                </div>
              </div>
            )}
          </Bot>
        </>
      )}

      {at('review') && (
        <>
          <Me onEdit={edit('note')}>{note ? `“${note}”` : 'No note'}</Me>
          <Bot>
            <p>Here’s your price at {shop?.name}:</p>
            {quote.isPending ? (
              <div className="h-40 rounded-card bg-active" role="status" aria-label="Working out the price" />
            ) : quote.error ? (
              <ErrorState error={quote.error} onRetry={() => void quote.refetch()} />
            ) : (
              <PriceSummary quote={quote.data.quote} options={options} />
            )}
            {step === 'review' && (
              <>
                {!shopOpen && nextOpen && bookTime && (
                  <div className="space-y-3 rounded-card border border-line bg-raised p-4">
                    <p>
                      <span className="font-medium">{shop?.name} is closed right now.</span> It opens {when(nextOpen)}. Book your order for that time or later.
                    </p>
                    <TimePicker
                      label="Book for"
                      value={bookTime}
                      min={nextOpen}
                      onChange={setBookAt}
                      quick={[
                        { label: 'When it opens', iso: nextOpen },
                        { label: '+1 hour', iso: inMinutes(60, new Date(nextOpen).getTime()) },
                        { label: '+2 hours', iso: inMinutes(120, new Date(nextOpen).getTime()) },
                      ]}
                    />
                  </div>
                )}
                {!shopOpen && !nextOpen && (
                  <Alert tone="red">{shop?.name ?? 'The shop'} is closed and hasn’t set a reopening time yet. Please check back later.</Alert>
                )}
                {send.error && <ErrorState error={send.error} />}
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="brass"
                    size="lg"
                    className="min-h-[52px] px-6 text-[1.125rem]"
                    loading={send.isPending}
                    disabled={!quote.data || !quote.data.quote.meetsMinimum || (!shopOpen && !bookTime)}
                    onClick={() => send.mutate()}
                  >
                    {shopOpen || !bookTime ? 'Send request to shop' : `Book for ${when(bookTime)}`}
                  </Button>
                </div>
                <p className="text-[0.9375rem] text-muted">
                  You pay only after the shop accepts. Your files are deleted after pickup, or 24 hours at most.
                </p>
              </>
            )}
          </Bot>
        </>
      )}

      {step === 'sent' && (
        <>
          <Me>Send it</Me>
          <Bot>
            <p>Sent! I’ll update this card as soon as the shop responds. You can leave this page; your request is saved under “My requests”.</p>
            {sent ? <StatusCard order={sent} /> : <div className="h-40 rounded-card bg-active" />}
            <Button size="lg" onClick={startOver}>Start a new request</Button>
          </Bot>
        </>
      )}
      <div ref={bottom} />
    </div>
  );
}
