import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { dateTime, rupees, rupeesShort, STATUS_LABEL } from '@/lib/format';
import type { OrderStatus, Payment, Refund, Role } from '@/lib/types';
import { StatusBadge } from '@/components/StatusTimeline';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Input, KpiStrip, Loading, PageTitle, Select, Stat } from '@/components/ui';

type Tab = 'overview' | 'shops' | 'users' | 'orders' | 'payments' | 'refunds' | 'fraud' | 'settings' | 'audit';

const TITLES: Record<Tab, [string, string]> = {
  overview: ['Overview', 'Shops waiting for approval and money moving through the platform'],
  shops: ['Shops', 'Approve new shops; suspend ones that break the rules'],
  users: ['People', 'Customers, shop owners and admins'],
  orders: ['Orders', 'Every order on the platform, newest first'],
  payments: ['Payments', 'Razorpay payments and their status'],
  refunds: ['Refunds', 'Money returned to customers'],
  fraud: ['Fraud checks', 'Signals from the last 7 days, for review by hand'],
  settings: ['Commission', 'What PrintPoint keeps from each paid order'],
  audit: ['Audit log', 'Every admin action, newest first'],
};

export default function AdminDashboard() {
  const [params] = useSearchParams();
  const tab = (params.get('tab') as Tab) in TITLES ? (params.get('tab') as Tab) : 'overview';
  const [title, subtitle] = TITLES[tab];
  return (
    <div>
      <PageTitle title={title} subtitle={subtitle} />
      {tab === 'overview' && <Overview />}
      {tab === 'shops' && <Shops />}
      {tab === 'users' && <Users />}
      {tab === 'orders' && <Orders />}
      {tab === 'payments' && <Payments />}
      {tab === 'refunds' && <Refunds />}
      {tab === 'fraud' && <Fraud />}
      {tab === 'settings' && <Settings />}
      {tab === 'audit' && <Audit />}
    </div>
  );
}

function Overview() {
  const q = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: () => api.get<{ users: number; shops: number; pendingShops: number; paidOrders: number; gmv: number; commission: number; refunded: number; byStatus: { status: OrderStatus; count: number }[] }>('/admin/analytics'),
  });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const a = q.data!;
  return (
    <div className="space-y-4">
      {a.pendingShops > 0 && (
        <Alert tone="amber">
          {a.pendingShops} {a.pendingShops === 1 ? 'shop is' : 'shops are'} waiting for approval. <a className="font-medium underline" href="/admin?tab=shops">Review shops</a>
        </Alert>
      )}
      <KpiStrip cols={3}>
        <Stat label="Paid order value" value={rupeesShort(a.gmv)} hint={`${a.paidOrders} paid orders, all time`} />
        <Stat label="Commission earned" value={rupeesShort(a.commission)} />
        <Stat label="Refunded" value={rupeesShort(a.refunded)} />
      </KpiStrip>
      <KpiStrip cols={3}>
        <Stat label="Live shops" value={a.shops} />
        <Stat label="Waiting for approval" value={a.pendingShops} />
        <Stat label="People" value={a.users} />
      </KpiStrip>
      <Card title="Orders by status">
        <ul className="grid gap-x-8 text-sm sm:grid-cols-3">
          {a.byStatus.map((b) => (
            <li key={b.status} className="flex justify-between border-t border-rule py-2.5"><span className="text-muted">{STATUS_LABEL[b.status]}</span><span className="num">{b.count}</span></li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

interface AdminShop { id: string; name: string; area: string; city: string; status: string; createdAt: string; owner: { name: string; email: string | null; mobile: string | null }; _count: { orders: number } }

function Shops() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('PENDING');
  const q = useQuery({ queryKey: ['admin-shops', status], queryFn: () => api.get<{ shops: AdminShop[]; total: number }>(`/admin/shops${status ? `?status=${status}` : ''}`) });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' | 'suspend' }) => {
      const reason = action === 'approve' ? undefined : prompt(`Reason to ${action}?`) ?? undefined;
      return api.patch(`/admin/shops/${id}/${action}`, { reason });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-shops'] }),
  });
  return (
    <Card>
      <div className="mb-3 w-48">
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: '', label: 'All' }, { value: 'PENDING', label: 'Pending' }, { value: 'APPROVED', label: 'Approved' }, { value: 'SUSPENDED', label: 'Suspended' }, { value: 'REJECTED', label: 'Rejected' }]} />
      </div>
      {act.error && <ErrorState error={act.error} />}
      {q.isLoading ? <Loading /> : !q.data?.shops.length ? <EmptyState title="No shops" /> : (
        <ul className="divide-y divide-line">
          {q.data.shops.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <p className="font-medium">{s.name} <Badge tone={s.status === 'APPROVED' ? 'green' : s.status === 'PENDING' ? 'amber' : 'red'}>{s.status}</Badge></p>
                <p className="text-sm text-muted">{s.area}, {s.city} · {s.owner.name} ({s.owner.mobile ?? s.owner.email}) · {s._count.orders} orders · joined {dateTime(s.createdAt)}</p>
              </div>
              <div className="flex gap-2">
                {s.status !== 'APPROVED' && <Button variant="primary" size="sm" onClick={() => act.mutate({ id: s.id, action: 'approve' })}>Approve</Button>}
                {s.status === 'PENDING' && <Button size="sm" variant="secondary" onClick={() => act.mutate({ id: s.id, action: 'reject' })}>Reject</Button>}
                {s.status === 'APPROVED' && <Button size="sm" variant="danger" onClick={() => act.mutate({ id: s.id, action: 'suspend' })}>Suspend</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Users() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const q = useQuery({
    queryKey: ['admin-users', search],
    queryFn: () => api.get<{ users: { id: string; name: string; email: string | null; mobile: string | null; role: Role; isActive: boolean; createdAt: string; _count: { orders: number } }[] }>(`/admin/users?q=${encodeURIComponent(search)}`),
  });
  const toggle = useMutation({ mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/admin/users/${id}/active`, { isActive }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-users'] }) });
  return (
    <Card>
      <div className="mb-3 max-w-xs"><Input label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email or mobile" /></div>
      {toggle.error && <ErrorState error={toggle.error} />}
      {q.isLoading ? <Loading /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted"><tr><th className="py-2">Name</th><th>Contact</th><th>Role</th><th>Orders</th><th /></tr></thead>
            <tbody>
              {q.data?.users.map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <td className="py-2">{u.name}</td>
                  <td>{u.email ?? u.mobile}</td>
                  <td><Badge>{u.role}</Badge></td>
                  <td>{u._count.orders}</td>
                  <td className="text-right">
                    <Button size="sm" variant={u.isActive ? 'secondary' : 'primary'} onClick={() => toggle.mutate({ id: u.id, isActive: !u.isActive })}>{u.isActive ? 'Disable' : 'Enable'}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Orders() {
  const [search, setSearch] = useState('');
  const q = useQuery({
    queryKey: ['admin-orders', search],
    queryFn: () => api.get<{ orders: { id: string; orderNumber: string | null; status: OrderStatus; total: number; createdAt: string; shop: { name: string }; customer: { name: string } }[]; total: number }>(`/admin/orders?q=${encodeURIComponent(search)}`),
  });
  const qc = useQueryClient();
  const refund = useMutation({
    mutationFn: (orderId: string) => {
      const reason = prompt('Refund reason?');
      if (!reason) throw new Error('Refund cancelled');
      return api.post('/admin/refunds', { orderId, reason });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-orders'] }),
  });
  return (
    <Card>
      <div className="mb-3 max-w-xs"><Input label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order no. or customer" /></div>
      {refund.error && <ErrorState error={refund.error} />}
      {refund.isSuccess && <Alert tone="green">Refund started</Alert>}
      {q.isLoading ? <Loading /> : (
        <ul className="divide-y divide-line">
          {q.data?.orders.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                <p className="font-medium">{o.orderNumber ?? 'Unpaid'} · {o.shop.name}</p>
                <p className="text-muted">{o.customer.name} · {dateTime(o.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular-nums">{rupees(o.total)}</span>
                <StatusBadge status={o.status} />
                {['PAID', 'PRINTING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED'].includes(o.status) && <Button size="sm" variant="secondary" onClick={() => refund.mutate(o.id)}>Refund</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Payments() {
  const q = useQuery({ queryKey: ['admin-payments'], queryFn: () => api.get<{ payments: (Payment & { order: { orderNumber: string | null; shop: { name: string }; customer: { name: string } } })[] }>('/admin/payments') });
  if (q.isLoading) return <Loading />;
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-muted"><tr><th className="py-2">Razorpay order</th><th>Order</th><th>Amount</th><th>Status</th><th>When</th></tr></thead>
        <tbody>
          {q.data?.payments.map((p) => (
            <tr key={p.id} className="border-t border-line">
              <td className="py-2 font-mono text-xs">{p.razorpayOrderId}<br />{p.razorpayPaymentId}</td>
              <td>{p.order.orderNumber ?? '—'}<br /><span className="text-muted">{p.order.customer.name}</span></td>
              <td className="tabular-nums">{rupees(p.amount)}</td>
              <td><Badge tone={p.status === 'PAID' ? 'green' : p.status === 'FAILED' ? 'red' : p.status === 'REFUNDED' ? 'amber' : 'gray'}>{p.status}</Badge>{p.failureReason && <p className="text-xs text-muted">{p.failureReason}</p>}</td>
              <td>{dateTime(p.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Refunds() {
  const q = useQuery({ queryKey: ['admin-refunds'], queryFn: () => api.get<{ refunds: (Refund & { initiatedBy: { name: string; role: Role } | null })[] }>('/admin/refunds') });
  if (q.isLoading) return <Loading />;
  if (!q.data?.refunds.length) return <EmptyState title="No refunds yet" />;
  return (
    <Card>
      <ul className="divide-y divide-line text-sm">
        {q.data.refunds.map((r) => (
          <li key={r.id} className="flex justify-between gap-2 py-2">
            <div>
              <p className="font-medium">{r.order?.orderNumber} · {r.reason}</p>
              <p className="text-muted">by {r.initiatedBy ? `${r.initiatedBy.name} (${r.initiatedBy.role})` : 'system'} · {dateTime(r.createdAt)}</p>
            </div>
            <div className="text-right"><p className="tabular-nums">{rupees(r.amount)}</p><Badge tone={r.status === 'PROCESSED' ? 'green' : r.status === 'FAILED' ? 'red' : 'amber'}>{r.status}</Badge></div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Fraud() {
  const q = useQuery({
    queryKey: ['admin-fraud'],
    queryFn: () =>
      api.get<{
        multipleFailedPayments: { id: string; name: string; mobile: string | null; email: string | null; failedCount: number }[];
        unusualOrders: { threshold: number; orders: { id: string; orderNumber: string | null; total: number; status: OrderStatus; customer: { name: string }; shop: { name: string } }[] };
        duplicateAccounts: { mobile: string; accounts: number }[];
      }>('/admin/fraud'),
  });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const f = q.data!;
  return (
    <div className="grid gap-5 md:grid-cols-3">
      <Card>
        <h3 className="mb-2 font-semibold">3+ failed payments (7 days)</h3>
        {f.multipleFailedPayments.length ? f.multipleFailedPayments.map((u) => <p key={u.id} className="text-sm">{u.name} ({u.mobile ?? u.email}) — {u.failedCount} failures</p>) : <p className="text-sm text-muted">None</p>}
      </Card>
      <Card>
        <h3 className="mb-2 font-semibold">Unusual order value (≥ {rupees(f.unusualOrders.threshold)})</h3>
        {f.unusualOrders.orders.length ? f.unusualOrders.orders.map((o) => <p key={o.id} className="text-sm">{o.orderNumber ?? 'Unpaid'} · {o.customer.name} @ {o.shop.name} — {rupees(o.total)}</p>) : <p className="text-sm text-muted">None</p>}
      </Card>
      <Card>
        <h3 className="mb-2 font-semibold">Possible duplicate accounts</h3>
        {f.duplicateAccounts.length ? f.duplicateAccounts.map((d) => <p key={d.mobile} className="text-sm">Delivery mobile {d.mobile} used by {d.accounts} accounts</p>) : <p className="text-sm text-muted">None</p>}
      </Card>
    </div>
  );
}

function Settings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-settings'], queryFn: () => api.get<{ commissionPercent: number }>('/admin/settings') });
  const [value, setValue] = useState<string>('');
  const save = useMutation({ mutationFn: () => api.put('/admin/settings/commission', { commissionPercent: Number(value) }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-settings'] }) });
  if (q.isLoading) return <Loading />;
  return (
    <Card className="max-w-sm space-y-3">
      <p className="text-sm">Current commission: <strong>{q.data?.commissionPercent}%</strong> of order subtotal (applied to newly paid orders).</p>
      <Input label="New commission %" type="number" min={0} max={50} step="0.5" value={value} onChange={(e) => setValue(e.target.value)} />
      {save.error && <ErrorState error={save.error} />}
      {save.isSuccess && <Alert tone="green">Saved</Alert>}
      <Button variant="primary" disabled={value === ''} loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
    </Card>
  );
}

function Audit() {
  const q = useQuery({ queryKey: ['admin-audit'], queryFn: () => api.get<{ logs: { id: string; action: string; entityType: string; entityId: string | null; metadata: unknown; createdAt: string; ip: string | null; actor: { name: string } | null }[] }>('/admin/audit-logs') });
  if (q.isLoading) return <Loading />;
  return (
    <Card>
      <ul className="divide-y divide-line text-sm">
        {q.data?.logs.map((l) => (
          <li key={l.id} className="py-2">
            <p><strong>{l.action}</strong> on {l.entityType} {l.entityId?.slice(0, 8)} by {l.actor?.name ?? 'system'}</p>
            <p className="text-xs text-muted">{dateTime(l.createdAt)} · {l.ip} · {l.metadata ? JSON.stringify(l.metadata) : ''}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
