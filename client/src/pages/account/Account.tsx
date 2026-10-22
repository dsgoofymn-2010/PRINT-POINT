import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime, fileSize, rupees } from '@/lib/format';
import type { Order, Refund, UploadedFile, User } from '@/lib/types';
import { StatusBadge } from '@/components/StatusTimeline';
import { Alert, Button, ButtonLink, Card, EmptyState, ErrorState, Input, KpiStrip, Loading, PageTitle, Stat, Tabs } from '@/components/ui';

type Tab = 'ACTIVE' | 'PAST' | 'DRAFT' | 'addresses' | 'files' | 'refunds' | 'profile' | 'help';

export default function Account() {
  const [tab, setTab] = useState<Tab>('ACTIVE');
  return (
    <div>
      <PageTitle title="My account" action={<ButtonLink variant="primary" to="/shops">New print order</ButtonLink>} />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'ACTIVE', label: 'Active orders' },
          { value: 'PAST', label: 'Past orders' },
          { value: 'DRAFT', label: 'Drafts' },
          { value: 'addresses', label: 'Addresses' },
          { value: 'files', label: 'Saved files' },
          { value: 'refunds', label: 'Wallet & refunds' },
          { value: 'profile', label: 'Profile' },
          { value: 'help', label: 'Help' },
        ]}
      />
      <div className="mt-5">
        {(tab === 'ACTIVE' || tab === 'PAST' || tab === 'DRAFT') && <OrdersList status={tab} />}
        {tab === 'addresses' && <Addresses />}
        {tab === 'files' && <Files />}
        {tab === 'refunds' && <Refunds />}
        {tab === 'profile' && <Profile />}
        {tab === 'help' && <Help />}
      </div>
    </div>
  );
}

function OrdersList({ status }: { status: 'ACTIVE' | 'PAST' | 'DRAFT' }) {
  const q = useQuery({ queryKey: ['orders', status], queryFn: () => api.get<{ orders: Order[] }>(`/orders?status=${status}`) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data?.orders.length) return <EmptyState title={status === 'DRAFT' ? 'No drafts' : 'No orders yet'} action={<ButtonLink variant="primary" to="/shops">Start printing</ButtonLink>} />;
  return (
    <ul className="space-y-3">
      {q.data.orders.map((o) => (
        <li key={o.id}>
          <Link to={`/orders/${o.id}`} className="block rounded-card border border-line bg-surface p-4 hover:border-control">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{o.orderNumber ?? (o.status === 'DRAFT' ? 'Draft' : 'Unpaid order')}</span>
              <StatusBadge status={o.status} />
            </div>
            <p className="mt-1 text-sm text-muted">
              {o.shop.name} · {o.items.length} file{o.items.length > 1 ? 's' : ''} · {dateTime(o.createdAt)}
            </p>
            <p className="mt-1 font-semibold tabular-nums">{rupees(o.total)}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

interface Address { id: string; label: string; name: string; mobile: string; line1: string; landmark: string | null; area: string; city: string; pincode: string; isDefault: boolean }
const blankAddress = { label: 'Home', name: '', mobile: '', line1: '', landmark: '', area: '', city: 'Chennai', pincode: '', isDefault: false };

function Addresses() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['addresses'], queryFn: () => api.get<{ addresses: Address[] }>('/me/addresses') });
  const [form, setForm] = useState(blankAddress);
  const [editing, setEditing] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const save = useMutation({
    mutationFn: () => (editing ? api.put(`/me/addresses/${editing}`, form) : api.post('/me/addresses', form)),
    onSuccess: () => {
      setShow(false);
      setEditing(null);
      setForm(blankAddress);
      void qc.invalidateQueries({ queryKey: ['addresses'] });
    },
  });
  const del = useMutation({ mutationFn: (id: string) => api.del(`/me/addresses/${id}`), onSuccess: () => void qc.invalidateQueries({ queryKey: ['addresses'] }) });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  if (q.isLoading) return <Loading />;
  return (
    <div className="space-y-3">
      {q.data?.addresses.map((a) => (
        <Card key={a.id} className="flex items-start justify-between gap-3">
          <div className="text-sm">
            <p className="font-medium">{a.label}{a.isDefault && ' · Default'}</p>
            <p>{a.name} · {a.mobile}</p>
            <p className="text-muted">{a.line1}, {a.area}, {a.city} – {a.pincode}</p>
          </div>
          <div className="flex gap-2 text-sm">
            <button className="text-ink underline" onClick={() => { setEditing(a.id); setForm({ ...a, landmark: a.landmark ?? '' }); setShow(true); }}>Edit</button>
            <button className="text-negative underline" onClick={() => del.mutate(a.id)}>Delete</button>
          </div>
        </Card>
      ))}
      {!q.data?.addresses.length && !show && <EmptyState title="No saved addresses" />}
      {show ? (
        <Card>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
            <Input label="Label" value={form.label} onChange={set('label')} />
            <Input label="Name" value={form.name} onChange={set('name')} />
            <Input label="Mobile" inputMode="numeric" maxLength={10} value={form.mobile} onChange={set('mobile')} />
            <Input label="Pincode" inputMode="numeric" maxLength={6} value={form.pincode} onChange={set('pincode')} />
            <div className="sm:col-span-2"><Input label="Address" value={form.line1} onChange={set('line1')} /></div>
            <Input label="Landmark" value={form.landmark} onChange={set('landmark')} />
            <Input label="Area" value={form.area} onChange={set('area')} />
            <Input label="City" value={form.city} onChange={set('city')} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))} /> Default address</label>
            {save.error && <div className="sm:col-span-2"><ErrorState error={save.error} /></div>}
            <div className="flex gap-2 sm:col-span-2">
              <Button variant="primary" type="submit" loading={save.isPending}>Save</Button>
              <Button type="button" variant="ghost" onClick={() => { setShow(false); setEditing(null); setForm(blankAddress); }}>Cancel</Button>
            </div>
          </form>
        </Card>
      ) : (
        <Button variant="secondary" onClick={() => setShow(true)}>Add address</Button>
      )}
    </div>
  );
}

function Files() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['uploads'], queryFn: () => api.get<{ files: UploadedFile[] }>('/uploads') });
  const del = useMutation({ mutationFn: (id: string) => api.del(`/uploads/${id}`), onSuccess: () => void qc.invalidateQueries({ queryKey: ['uploads'] }) });
  if (q.isLoading) return <Loading />;
  if (!q.data?.files.length) return <EmptyState title="No saved files" body="Files are deleted automatically after your order is completed, for your privacy." />;
  return (
    <div className="space-y-2">
      {del.error && <ErrorState error={del.error} />}
      <Alert tone="blue">Files are deleted automatically 24 hours after an order is completed.</Alert>
      {q.data.files.map((f) => (
        <Card key={f.id} className="flex items-center justify-between gap-3 p-3">
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{f.originalName}</p>
            <p className="text-muted">{fileSize(f.sizeBytes)} · {f.pageCount ?? '?'} pages · {dateTime(f.createdAt)}</p>
          </div>
          <div className="flex shrink-0 gap-3 text-sm">
            <button className="text-ink underline" onClick={() => void api.download(`/uploads/${f.id}/download`, f.originalName)}>Download</button>
            <button className="text-negative underline" onClick={() => del.mutate(f.id)}>Delete</button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Refunds() {
  const q = useQuery({ queryKey: ['refunds'], queryFn: () => api.get<{ refunds: Refund[]; totals: { processed: number; pending: number } }>('/me/refunds') });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const { refunds, totals } = q.data!;
  return (
    <div className="space-y-4">
      <KpiStrip cols={2}>
        <Stat label="Refunded" value={rupees(totals.processed)} hint="Returned to your original payment method" />
        <Stat label="In progress" value={rupees(totals.pending)} hint="Usually 5–7 working days" />
      </KpiStrip>
      {refunds.length === 0 ? (
        <EmptyState title="No refunds" />
      ) : (
        refunds.map((r) => (
          <Card key={r.id} className="flex justify-between p-3 text-sm">
            <div>
              <p className="font-medium">{r.order?.orderNumber}</p>
              <p className="text-muted">{r.reason} · {dateTime(r.createdAt)}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold tabular-nums">{rupees(r.amount)}</p>
              <p className="text-xs">{r.status.toLowerCase()}</p>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function Profile() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({ name: user?.name ?? '', email: user?.email ?? '', currentPassword: '', newPassword: '' });
  const save = useMutation({
    mutationFn: () =>
      api.put<{ user: User }>('/me/profile', {
        name: form.name,
        email: form.email || null,
        ...(form.newPassword ? { currentPassword: form.currentPassword, newPassword: form.newPassword } : {}),
      }),
    onSuccess: (r) => setUser(r.user),
  });
  return (
    <Card className="max-w-lg">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input label="Mobile" value={user?.mobile ?? ''} disabled hint="Contact support to change your mobile number" />
        <Input label="Current password" type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
        <Input label="New password" type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} hint="Leave blank to keep your password" />
        {save.error && <ErrorState error={save.error} />}
        {save.isSuccess && <Alert tone="green">Profile updated</Alert>}
        <Button variant="primary" type="submit" loading={save.isPending}>Save changes</Button>
      </form>
    </Card>
  );
}

function Help() {
  const faqs = [
    ['How do I collect my prints?', 'Show the 6-digit pickup OTP from your order page at the shop counter.'],
    ['What if payment failed but money was deducted?', 'Razorpay confirms the payment automatically within minutes. If it cannot be matched, it is refunded to your source in 5–7 working days.'],
    ['Can I cancel an order?', 'Yes, until the shop starts printing. You get a full refund.'],
    ['Are my files safe?', 'Files are stored privately, only the shop you ordered from can download them, and they are deleted 24 hours after completion.'],
  ];
  return (
    <div className="space-y-3">
      {faqs.map(([q, a]) => (
        <details key={q} className="rounded-card border border-line bg-surface p-4">
          <summary className="cursor-pointer font-medium">{q}</summary>
          <p className="mt-2 text-sm text-muted">{a}</p>
        </details>
      ))}
      <p className="text-sm">Still need help? <Link to="/contact" className="text-ink underline">Contact support</Link>.</p>
    </div>
  );
}
