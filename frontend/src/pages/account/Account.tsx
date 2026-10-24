import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime, rupees } from '@/lib/format';
import type { Refund, User } from '@/lib/types';
import { Alert, Button, ButtonLink, Card, EmptyState, ErrorState, Input, KpiStrip, Loading, PageTitle, Stat, Tabs } from '@/components/ui';

type Tab = 'refunds' | 'profile' | 'help';

export default function Account() {
  const [tab, setTab] = useState<Tab>('refunds');
  return (
    <div>
      <PageTitle title="My account" action={<ButtonLink variant="primary" to="/?view=mine">My requests</ButtonLink>} />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'refunds', label: 'Wallet & refunds' },
          { value: 'profile', label: 'Profile' },
          { value: 'help', label: 'Help' },
        ]}
      />
      <div className="mt-5">
        {tab === 'refunds' && <Refunds />}
        {tab === 'profile' && <Profile />}
        {tab === 'help' && <Help />}
      </div>
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
    ['Are my files safe?', 'Files are stored privately, only the shop you sent them to can open them, and they are deleted after pickup or 24 hours at most.'],
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
