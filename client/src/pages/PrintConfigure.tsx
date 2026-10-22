import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { api, uploadWithProgress } from '@/lib/api';
import { DEFAULT_SETTINGS, toOrderPayload, useCart, type CartItem } from '@/lib/cart';
import { fileSize, rupees } from '@/lib/format';
import type { Order, ShopDetail, UploadedFile } from '@/lib/types';
import { useQuote } from '@/lib/useQuote';
import { ItemSettings, pageRangeError } from '@/components/ItemSettings';
import { PriceBreakdown } from '@/components/PriceBreakdown';
import { Alert, Button, Card, ErrorState, Loading, PageTitle, Spinner, Textarea } from '@/components/ui';

const MAX_MB = 25;
const ACCEPT = '.pdf,.docx,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const OK_EXT = /\.(pdf|docx|jpe?g|png)$/i;

// Local previews for files picked in this session (not persisted).
const previews = new Map<string, string>();

export default function PrintConfigure() {
  const { shopId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { cart, update } = useCart();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const shopQ = useQuery({ queryKey: ['shop', shopId], queryFn: () => api.get<{ shop: ShopDetail }>(`/shops/${shopId}`) });
  const savedQ = useQuery({ queryKey: ['uploads'], queryFn: () => api.get<{ files: UploadedFile[] }>('/uploads'), enabled: showSaved });
  const shop = shopQ.data?.shop;

  // Start a fresh cart when the customer switches to another shop.
  useEffect(() => {
    if (!shop) return;
    update((c) =>
      c && c.shopId === shop.id
        ? c
        : { shopId: shop.id, shopName: shop.name, items: c?.items ?? [], fulfillment: 'PICKUP', couponCode: '', specialInstructions: '', delivery: c?.delivery ?? null },
    );
  }, [shop, update]);

  const quote = useQuote(cart?.shopId === shop?.id ? cart : null);

  const addFiles = (files: UploadedFile[]) =>
    update((c) => {
      if (!c) return c;
      const fresh = files.filter((f) => !c.items.some((i) => i.fileId === f.id));
      const items: CartItem[] = fresh.map((f) => ({
        fileId: f.id,
        fileName: f.originalName,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
        pageCount: f.pageCount,
        pagesOverride: f.pageCount ? undefined : 1,
        settings: { ...DEFAULT_SETTINGS },
      }));
      if (items[0]) setExpanded(items[0].fileId);
      return { ...c, items: [...c.items, ...items] };
    });

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = '';
    setUploadError(null);
    const bad = list.find((f) => !OK_EXT.test(f.name));
    if (bad) return setUploadError(`${bad.name}: only PDF, DOCX, JPG and PNG files are allowed`);
    const big = list.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (big) return setUploadError(`${big.name} is larger than ${MAX_MB} MB`);
    if (!list.length) return;
    const form = new FormData();
    list.forEach((f) => form.append('files', f));
    setProgress(0);
    try {
      const res = await uploadWithProgress<{ files: UploadedFile[] }>('/uploads', form, setProgress);
      res.files.forEach((f, idx) => {
        const local = list[idx];
        if (local && (local.type.startsWith('image/') || local.type === 'application/pdf')) previews.set(f.id, URL.createObjectURL(local));
      });
      addFiles(res.files);
      void qc.invalidateQueries({ queryKey: ['uploads'] });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setProgress(null);
    }
  };

  const draft = useMutation({
    mutationFn: async () => {
      const payload = toOrderPayload(cart!, true);
      return cart!.draftId
        ? api.put<{ order: Order }>(`/orders/${cart!.draftId}`, payload)
        : api.post<{ order: Order }>('/orders', payload);
    },
    onSuccess: ({ order }) => {
      update((c) => (c ? { ...c, draftId: order.id } : c));
      setNotice('Draft saved. Find it later under My orders → Drafts.');
    },
  });

  if (shopQ.isLoading) return <Loading />;
  if (shopQ.error || !shop) return <ErrorState error={shopQ.error ?? new Error('Shop not found')} />;
  const services = new Set<string>(shop.services.map((s) => s.type));
  const items = cart?.shopId === shop.id ? cart.items : [];
  const hasRangeErrors = items.some((i) => pageRangeError(i.settings.pageRange, i.pageCount ?? i.pagesOverride ?? null));

  return (
    <div className="pb-28 lg:pb-0">
      <PageTitle title="Upload & configure" subtitle={`Printing at ${shop.name}, ${shop.area}`} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <input ref={inputRef} type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => void onPick(e)} id="file-input" />
            <label
              htmlFor="file-input"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-line p-6 text-center hover:border-control"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (inputRef.current && e.dataTransfer.files.length) {
                  const dt = new DataTransfer();
                  Array.from(e.dataTransfer.files).forEach((f) => dt.items.add(f));
                  inputRef.current.files = dt.files;
                  inputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }}
            >
              <span className="text-3xl" aria-hidden="true"></span>
              <span className="font-medium">Tap to choose files</span>
              <span className="text-xs text-muted">PDF, DOCX, JPG, PNG · up to {MAX_MB} MB each</span>
            </label>
            {progress !== null && (
              <div className="mt-3" role="status">
                <div className="flex items-center gap-2 text-sm"><Spinner className="h-4 w-4" /> Uploading… {progress}%</div>
                <div className="mt-1 h-2 overflow-hidden rounded bg-raised">
                  <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
            {uploadError && <div className="mt-3"><Alert tone="red">{uploadError}</Alert></div>}
            <button type="button" className="mt-3 text-sm text-ink underline" onClick={() => setShowSaved((s) => !s)}>
              {showSaved ? 'Hide saved files' : 'Use a previously uploaded file'}
            </button>
            {showSaved && (
              <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                {savedQ.isLoading && <Loading />}
                {savedQ.data?.files.length === 0 && <p className="text-sm text-muted">No saved files.</p>}
                {savedQ.data?.files.map((f) => (
                  <button key={f.id} type="button" onClick={() => addFiles([f])} className="flex w-full justify-between rounded-control px-2 py-1.5 text-left text-sm hover:bg-active">
                    <span className="truncate">{f.originalName}</span>
                    <span className="shrink-0 text-muted">{f.pageCount ?? '?'} pages</span>
                  </button>
                ))}
              </div>
            )}
          </Card>

          {items.map((item, idx) => {
            const open = expanded === item.fileId;
            const preview = previews.get(item.fileId);
            return (
              <Card key={item.fileId}>
                <div className="flex items-start gap-3">
                  <div className="flex h-14 w-11 shrink-0 items-center justify-center overflow-hidden rounded border border-line bg-raised text-xs font-semibold text-muted">
                    {preview && item.mimeType.startsWith('image/') ? <img src={preview} alt="" className="h-full w-full object-cover" /> : item.mimeType.includes('pdf') ? 'PDF' : item.mimeType.startsWith('image/') ? 'IMG' : 'DOC'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium" title={item.fileName}>{idx + 1}. {item.fileName}</p>
                    <p className="text-xs text-muted">
                      {fileSize(item.sizeBytes)} · {item.pageCount ? `${item.pageCount} pages` : 'page count unknown'} · {item.settings.color === 'COLOR' ? 'Colour' : 'B/W'}, {item.settings.paperSize}, {item.settings.copies}×
                    </p>
                    <div className="mt-1 flex gap-3 text-sm">
                      <button type="button" className="text-ink underline" aria-expanded={open} onClick={() => setExpanded(open ? null : item.fileId)}>
                        {open ? 'Done' : 'Print options'}
                      </button>
                      {preview && <a href={preview} target="_blank" rel="noreferrer" className="text-ink underline">Preview</a>}
                      <button type="button" className="text-negative underline" onClick={() => update((c) => (c ? { ...c, items: c.items.filter((i) => i.fileId !== item.fileId) } : c))}>
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
                {open && (
                  <div className="mt-4 border-t border-line pt-4">
                    <ItemSettings
                      item={item}
                      services={services}
                      onChange={(patch, pagesOverride) =>
                        update((c) =>
                          c ? { ...c, items: c.items.map((i) => (i.fileId === item.fileId ? { ...i, settings: { ...i.settings, ...patch }, pagesOverride: pagesOverride ?? i.pagesOverride } : i)) } : c,
                        )
                      }
                    />
                  </div>
                )}
              </Card>
            );
          })}

          {items.length > 0 && (
            <Card>
              <Textarea
                label="Special instructions (optional)"
                placeholder="e.g. Print pages 3–5 in colour, use blue spiral"
                maxLength={1000}
                value={cart?.specialInstructions ?? ''}
                onChange={(e) => update((c) => (c ? { ...c, specialInstructions: e.target.value } : c))}
              />
            </Card>
          )}
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card>
            <h2 className="mb-3 font-semibold">Price estimate</h2>
            {items.length === 0 ? (
              <div className="text-sm">
                <p className="text-muted">Upload a file to see your exact total. This shop charges:</p>
                {shop.pricing && (
                  <dl className="mt-3">
                    {([
                      ['B/W, a page', shop.pricing.bwSingle],
                      ['B/W double-sided, a page', shop.pricing.bwDouble],
                      ['Colour, a page', shop.pricing.colorSingle],
                      ['Spiral binding, a copy', shop.pricing.spiralBinding],
                      ['Minimum order', shop.pricing.minOrderAmount],
                    ] as const).map(([k, v]) => (
                      <div key={k} className="flex justify-between border-t border-rule py-2">
                        <dt className="text-muted">{k}</dt>
                        <dd className="num">{rupees(v)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            ) : quote.error ? (
              <ErrorState error={quote.error} />
            ) : quote.data ? (
              <div className={quote.isFetching ? 'opacity-60' : ''} aria-live="polite">
                <PriceBreakdown quote={quote.data} />
              </div>
            ) : (
              <Loading label="Calculating…" />
            )}
            {notice && <div className="mt-3"><Alert tone="green">{notice}</Alert></div>}
            {draft.error && <div className="mt-3"><ErrorState error={draft.error} /></div>}
            <div className="mt-4 hidden flex-col gap-2 lg:flex">
              <Button variant="primary" size="lg" disabled={!quote.data?.meetsMinimum || hasRangeErrors || !items.length} onClick={() => navigate('/cart')}>
                Review order
              </Button>
              <Button variant="secondary" disabled={!items.length} loading={draft.isPending} onClick={() => draft.mutate()}>
                Save as draft
              </Button>
            </div>
          </Card>
        </aside>
      </div>

      {/* Sticky action bar for phones */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t border-line bg-surface px-4 py-3 lg:hidden">
        <div className="flex-1 text-sm">
          <p className="text-xs text-muted">Total</p>
          <p className="num text-lg font-semibold">{quote.data ? rupees(quote.data.total) : '—'}</p>
        </div>
        <Button variant="secondary" disabled={!items.length} loading={draft.isPending} onClick={() => draft.mutate()}>Draft</Button>
        <Button variant="primary" disabled={!quote.data?.meetsMinimum || hasRangeErrors || !items.length} onClick={() => navigate('/cart')}>Review</Button>
      </div>
    </div>
  );
}
