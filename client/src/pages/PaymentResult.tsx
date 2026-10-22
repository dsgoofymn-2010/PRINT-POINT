import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { rupees } from '@/lib/format';
import { payForOrder } from '@/lib/razorpay';
import type { Order } from '@/lib/types';
import { Alert, Button, ButtonLink, Card, Loading } from '@/components/ui';

export default function PaymentResult() {
  const { result, orderId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => api.get<{ order: Order; notifyShopLink: string | null }>(`/orders/${orderId}`),
  });

  if (q.isLoading) return <Loading />;
  const order = q.data?.order;
  const success = result === 'success' && order && !['PENDING_PAYMENT', 'DRAFT'].includes(order.status);

  const retry = async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      const r = await payForOrder(orderId!);
      if (r.kind === 'success') navigate(`/payment/success/${orderId}`, { replace: true });
      else if (r.kind === 'failed') setRetryError(r.reason);
    } catch (e) {
      setRetryError(e instanceof Error ? e.message : 'Could not start payment');
    } finally {
      setRetrying(false);
      void q.refetch();
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <Card className="space-y-4 p-6 text-center">
        <div className="text-5xl" aria-hidden="true">{success ? '' : ''}</div>
        {success ? (
          <>
            <h1 className="text-2xl font-bold">Payment successful</h1>
            <p className="text-muted">
              Order <strong>{order.orderNumber}</strong> · {rupees(order.total)}
            </p>
            {order.fulfillment === 'PICKUP' && order.pickupOtp && (
              <div className="rounded-card bg-active p-4">
                <p className="text-sm">Your pickup OTP</p>
                <p className="text-3xl font-bold tracking-[0.3em]">{order.pickupOtp}</p>
                <p className="text-xs text-muted">Show this at the shop counter</p>
              </div>
            )}
            {q.data?.notifyShopLink && (
              <a href={q.data.notifyShopLink} target="_blank" rel="noreferrer noopener" className="block rounded-control bg-primary px-4 py-3 font-medium text-on-primary hover:opacity-90">
                Notify shop on WhatsApp
              </a>
            )}
            <ButtonLink variant="primary" to={`/orders/${order.id}`} className="w-full">Track order</ButtonLink>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold">Payment not completed</h1>
            <p className="text-muted">{params.get('reason') ?? 'The payment did not go through.'}</p>
            <Alert tone="blue">If money was deducted, it will be confirmed automatically within a few minutes or refunded by Razorpay.</Alert>
            {retryError && <Alert tone="red">{retryError}</Alert>}
            {order?.status === 'PENDING_PAYMENT' && (
              <Button variant="primary" className="w-full" size="lg" loading={retrying} onClick={() => void retry()}>
                Try again
              </Button>
            )}
            <ButtonLink to="/account" variant="secondary" className="w-full">Go to my orders</ButtonLink>
          </>
        )}
      </Card>
    </div>
  );
}
