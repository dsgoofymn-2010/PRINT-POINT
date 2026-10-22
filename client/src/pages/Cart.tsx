import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '@/lib/cart';
import { useQuote } from '@/lib/useQuote';
import { PriceBreakdown } from '@/components/PriceBreakdown';
import { Button, ButtonLink, Card, EmptyState, ErrorState, Input, Loading, PageTitle } from '@/components/ui';

/** Price summary step: review files and options, apply a coupon. */
export default function CartPage() {
  const { cart, update, clear } = useCart();
  const navigate = useNavigate();
  const [coupon, setCoupon] = useState(cart?.couponCode ?? '');
  const quote = useQuote(cart);

  if (!cart || cart.items.length === 0) {
    return <EmptyState title="Your cart is empty" body="Pick a shop and upload a document to get started." action={<ButtonLink variant="primary" to="/shops">Find a shop</ButtonLink>} />;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Price summary" subtitle={`${cart.shopName} · ${cart.items.length} file${cart.items.length > 1 ? 's' : ''}`} />
      <Card className="space-y-4">
        {quote.isLoading ? <Loading label="Calculating…" /> : quote.error ? <ErrorState error={quote.error} /> : quote.data && <PriceBreakdown quote={quote.data} />}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            update((c) => (c ? { ...c, couponCode: coupon.trim().toUpperCase() } : c));
          }}
        >
          <div className="flex-1">
            <Input label="Coupon code" placeholder="e.g. STUDENT10" value={coupon} onChange={(e) => setCoupon(e.target.value)} />
          </div>
          <Button type="submit" variant="secondary">Apply</Button>
        </form>
        {cart.couponCode && quote.data && quote.data.discount === 0 && !quote.error && (
          <p className="text-sm text-[#92400e]">Coupon {cart.couponCode} needs a higher order value to apply.</p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button variant="primary" size="lg" className="sm:flex-1" disabled={!quote.data?.meetsMinimum || !!quote.error} onClick={() => navigate('/checkout')}>
            Continue to checkout
          </Button>
          <Link to={`/print/${cart.shopId}`} className="rounded-control border border-line px-4 py-3 text-center text-sm font-medium">
            Edit files & options
          </Link>
        </div>
        <button className="text-sm text-negative underline" onClick={clear}>Clear cart</button>
      </Card>
    </div>
  );
}
