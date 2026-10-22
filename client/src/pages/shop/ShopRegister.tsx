import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Alert, Card, PageTitle } from '@/components/ui';
import { emptyProfile, ShopProfileForm, type ShopProfile } from './ShopProfileForm';

export default function ShopRegister() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (p: ShopProfile) => api.post('/shop/register', { ...p, email: p.email || null, mapsUrl: p.mapsUrl || null }),
    onSuccess: () => {
      void qc.invalidateQueries();
      navigate('/shop');
    },
  });
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="Register your shop" subtitle="Start receiving paid print orders online." />
      <div className="mb-4"><Alert tone="blue">After you submit, our team reviews your shop. It appears to customers once approved. Default prices are added — edit them anytime under Pricing.</Alert></div>
      <Card>
        <ShopProfileForm
          initial={{ ...emptyProfile, ownerName: user?.name ?? '', mobile: user?.mobile ?? '', email: user?.email ?? '' }}
          submitLabel="Submit for approval"
          busy={m.isPending}
          error={m.error}
          onSubmit={(p) => m.mutate(p)}
        />
      </Card>
    </div>
  );
}
