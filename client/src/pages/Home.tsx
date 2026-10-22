import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { rupees, time12 } from '@/lib/format';
import type { Pricing, ShopDetail, ShopSummary } from '@/lib/types';
import { Mark, ThemeToggle } from '@/components/Layout';
import { cn } from '@/components/ui';

/*
  Direction: "The sentence is the layout" (seed 1497690328).
  Idea: the shop's 30-minute promise becomes the sentence itself. "Print it now / Collect 5:45 PM",
  with the time computed live, and a reel of the shop's world passing through the gap.
  Live thing: the pricing sentence is a working calculator on a real shop's price list.
*/

// Prices of the cheapest seeded shop, used until the API answers or if it is down.
const FALLBACK: Pricing = {
  bwSingle: 150, bwDouble: 100, colorSingle: 1000, colorDouble: 800, a3Multiplier: 2, legalMultiplier: 1.2, bondExtra: 50, glossyExtra: 500,
  spiralBinding: 3000, softBinding: 6000, hardBinding: 15000, laminationSingle: 1500, laminationDouble: 2500, deliveryFee: 3000, freeDeliveryAbove: 50000,
  minOrderAmount: 1000, taxPercent: 0,
};

/** Adds .in to every .rise element as it enters the viewport (content stays visible without script). */
function useRise() {
  useEffect(() => {
    document.documentElement.classList.add('js');
    const els = document.querySelectorAll('.rise');
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }),
      { rootMargin: '0px 0px -10% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  });
}

/** The ready time if you send it now: the shop's ready time, rounded up to the next five minutes. */
function useReadyTime(minutes = 30) {
  const calc = () => {
    const d = new Date(Date.now() + minutes * 60_000);
    d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase().replace(/\s/g, ' ');
  };
  const [t, setT] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => setT(calc()), 30_000);
    return () => clearInterval(id);
  });
  return t;
}

function Photo({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div className={cn('overflow-hidden bg-surface', className)}>
      <img src={src} alt={alt} loading="lazy" decoding="async" className="drift h-full w-full object-cover" />
    </div>
  );
}

/** Real interface fragment: one line of an order as the customer builds it. */
function OrderFragment() {
  return (
    <div data-ui className="flex h-full flex-col justify-between bg-surface p-[5%] font-sans text-[13px] text-ink">
      <div className="flex items-baseline justify-between text-[13px] text-muted">
        <span>Sri Murugan Xerox, Usman Road</span>
        <span>Ready by 5:45 PM</span>
      </div>
      <div>
        <p className="text-[16px] font-medium">Mini-Project-Report.pdf</p>
        <p className="mt-1 text-[13px] text-muted">12 pages · B/W · double-sided · A4 bond · spiral × 2</p>
      </div>
      <div className="space-y-1 text-[13px]">
        <div className="flex justify-between"><span className="text-muted">12 pages × 2 × ₹1.00</span><span className="num">₹24.00</span></div>
        <div className="flex justify-between"><span className="text-muted">Bond paper, 6 sheets × 2</span><span className="num">₹6.00</span></div>
        <div className="flex justify-between"><span className="text-muted">Spiral binding × 2</span><span className="num">₹60.00</span></div>
        <div className="flex justify-between bg-raised px-1 pt-1.5 text-[16px] font-semibold"><span>Total</span><span className="num">₹90.00</span></div>
      </div>
    </div>
  );
}

/** Real interface fragment: the pickup slip a customer shows at the counter. */
function PickupFragment() {
  return (
    <div data-ui className="flex h-full flex-col justify-between bg-field p-[5%] font-sans text-field-ink">
      <div className="flex items-baseline justify-between text-[13px] opacity-80">
        <span className="num">PP-2026-000124</span>
        <span>Ready for pickup</span>
      </div>
      <div>
        <p className="text-[13px] opacity-80">Pickup code, read it out at the counter</p>
        <p className="num mt-1 text-[clamp(28px,3.4vw,52px)] font-semibold tracking-[0.18em]">482 913</p>
      </div>
      <p className="text-[13px] opacity-80">Sri Murugan Xerox · 12, Usman Road, T. Nagar</p>
    </div>
  );
}

const REEL: { key: string; node: ReactNode; caption: string; photo?: boolean }[] = [
  { key: 'sign', node: <Photo src="/assets/burkit-road-t-nagar-chennai.jpg" alt="Hand-painted yellow Burkit Road sign in Tamil and English, T. Nagar" className="h-full" />, caption: 'Burkit Road, T. Nagar', photo: true },
  { key: 'order', node: <OrderFragment />, caption: 'Your order, priced to the paisa' },
  { key: 'notes', node: <Photo src="/assets/highlighter-pen-photocopied-text-9mar2009.jpg" alt="A photocopied page of notes marked with a yellow highlighter" className="h-full" />, caption: 'Photocopied notes, highlighted', photo: true },
  { key: 'slip', node: <PickupFragment />, caption: 'The pickup code' },
  { key: 'spiral', node: <Photo src="/assets/spiralbinderucken-2022-9739-bw.jpg" alt="Close-up of a metal spiral binding" className="h-full" />, caption: 'Spiral binding', photo: true },
  {
    key: 'copier',
    node: (
      <video className="h-full w-full object-cover" src="/assets/konica-minolta-photocopier-with-an-automatic-document.webm" poster="/assets/konica-minolta-photocopier-with-an-automatic-document-poster.jpg" autoPlay muted loop playsInline preload="metadata" aria-label="A photocopier feeding a stack of pages" />
    ),
    caption: 'Pages through the feeder',
    photo: true,
  },
];

function Hero() {
  const ready = useReadyTime(30);
  const stage = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  const [time, meridiem] = ready.split(' ');

  // Pinned story: the reel advances while the sentence holds its place.
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const onScroll = () => {
      const el = stage.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const span = el.offsetHeight - innerHeight;
      if (span <= 0) return;
      setP(Math.min(1, Math.max(0, -r.top / span)) * (REEL.length - 1));
    };
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    return () => {
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
    };
  }, []);

  const current = REEL[Math.round(p)];

  return (
    <section ref={stage} aria-labelledby="hero-title" className="relative md:h-[240vh]">
      <div className="flex flex-col md:sticky md:top-0 md:h-[100svh]">
        <nav className="page-gutter flex h-16 flex-none items-center justify-between gap-4" aria-label="Main">
          <Link to="/" className="flex items-center gap-2">
            <Mark />
            <span className="display pt-0.5 text-[26px] leading-none tracking-[0.01em]">PrintPoint</span>
          </Link>
          <div className="flex items-center gap-1 text-[16px]">
            <a href="#prices" className="hidden rounded-control px-3 py-1.5 hover:bg-surface sm:block">Prices</a>
            <a href="#shops" className="hidden rounded-control px-3 py-1.5 hover:bg-surface sm:block">Shops</a>
            <Link to="/shop/register" className="hidden rounded-control px-3 py-1.5 hover:bg-surface md:block">For shop owners</Link>
            <Link to="/login" className="rounded-control px-3 py-1.5 hover:bg-surface">Sign in</Link>
            <Link to="/shops" className="ml-1 inline-flex h-9 items-center bg-brass px-4 font-medium text-brass-ink transition hover:brightness-95 active:translate-y-px">
              Upload &amp; print
            </Link>
          </div>
        </nav>

        <div className="page-gutter relative flex flex-1 flex-col justify-center gap-6">
          <h1 id="hero-title" className="display grid text-[clamp(44px,14.6vw,64px)] md:grid-cols-[1fr_35vw_1fr] md:items-center md:gap-[2vw] md:text-[clamp(64px,8.6vw,150px)]">
            <span className="block whitespace-nowrap">
              Print it
              <br className="hidden md:block" /> now.
            </span>
            {/* Desktop: the reel sits in the gap of the sentence. */}
            <span className="relative hidden h-[calc(19.6875vw+168px)] overflow-hidden md:block" aria-hidden="true">
              <span
                className="absolute inset-x-0 top-0 flex flex-col gap-6 will-change-transform"
                style={{ transform: `translateY(calc(84px - ${p} * (19.6875vw + 24px)))` }}
              >
                {REEL.map((f) => (
                  <span key={f.key} className="block aspect-video w-full overflow-hidden rounded-[4px]">
                    {f.node}
                  </span>
                ))}
              </span>
            </span>
            <span className="block whitespace-nowrap text-right">
              Collect
              <br className="hidden md:block" /> <span className="num">{time}</span> {meridiem}
            </span>
          </h1>
          {/* Phone: the pictures of the reel as one 2 x 2 block under the sentence. */}
          <div className="grid grid-cols-2 gap-2 md:hidden">
            {REEL.filter((f) => f.photo).map((f) => (
              <div key={f.key} className="aspect-square overflow-hidden rounded-[4px]">
                {f.node}
              </div>
            ))}
          </div>
        </div>

        <div className="page-gutter flex flex-none flex-col gap-4 pb-8 pt-2 md:flex-row md:items-end md:justify-between">
          <p className="max-w-[34ch] font-serif text-[19px] leading-[1.45]">
            PrintPoint sends your PDFs, Word files and photos to a xerox shop near you in Chennai. See the exact price, pay by UPI, and collect with a six-digit code.
          </p>
          <p className="hidden text-right text-[16px] text-muted md:block" aria-live="polite">
            {current.caption}
          </p>
        </div>
      </div>
    </section>
  );
}

const STAGES = [
  { minutes: 2, length: 'Two minutes', text: 'First, upload the file and pick paper, sides, copies and binding.', tone: 'bg-[#dcdcd6] text-[#181715]' },
  { minutes: 1, length: 'Under a minute', text: 'Then pay by UPI or card; the price is fixed before you pay.', tone: 'bg-brass text-brass-ink' },
  { minutes: 25, length: 'About twenty-five minutes', text: 'Meanwhile the shop prints, trims and binds while you finish class.', tone: 'bg-field text-field-ink' },
  { minutes: 2, length: 'Two minutes', text: 'Last, walk in and read out your code. No queue, no change to count.', tone: 'bg-[#9d9c95] text-[#181715]' },
];

function HowItWorks() {
  const total = STAGES.reduce((s, x) => s + x.minutes, 0);
  return (
    <section aria-labelledby="how-title" className="page-gutter pt-[clamp(120px,14vw,200px)]">
      <h2 id="how-title" className="rise display text-[clamp(48px,6.4vw,104px)]">Thirty minutes, desk to desk</h2>
      <div data-ui className="mt-16 flex flex-col gap-1.5 md:flex-row" role="list">
        {STAGES.map((s, i) => (
          <div key={s.text} role="listitem" className="rise flex flex-col md:min-w-[12%]" style={{ flexGrow: s.minutes / total, flexBasis: 0, ['--d' as string]: `${i * 80}ms` }}>
            <div className={cn('flex min-h-[88px] items-start p-5 md:h-[22vh]', s.tone)}>
              <p className="text-[19px] font-medium leading-tight">{s.length}</p>
            </div>
            <p className="mt-3 max-w-[24ch] font-serif text-[16px] leading-snug">{s.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function PriceSentence() {
  const shops = useQuery({ queryKey: ['shops', 'home'], queryFn: () => api.get<{ shops: ShopSummary[] }>('/shops?city=Chennai') });
  const cheapest = useMemo(() => [...(shops.data?.shops ?? [])].sort((a, b) => (a.startingPrice ?? 1e9) - (b.startingPrice ?? 1e9))[0], [shops.data]);
  const detail = useQuery({
    queryKey: ['shop', cheapest?.slug],
    queryFn: () => api.get<{ shop: ShopDetail }>(`/shops/${cheapest!.slug}`),
    enabled: !!cheapest,
  });
  const rule = detail.data?.shop.pricing ?? FALLBACK;
  const shopName = detail.data ? `${detail.data.shop.name}, ${detail.data.shop.area}` : 'Sri Murugan Xerox, T. Nagar';

  const [pages, setPages] = useState(40);
  const [colour, setColour] = useState(false);
  const [double, setDouble] = useState(false);
  const [spiral, setSpiral] = useState(false);
  const rate = colour ? (double ? rule.colorDouble : rule.colorSingle) : double ? rule.bwDouble : rule.bwSingle;
  const total = pages * rate + (spiral ? rule.spiralBinding : 0);

  const toggle = (on: boolean, set: (v: boolean) => void, label: string) => (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => set(!on)}
      className={cn('h-11 px-4 text-[16px] font-medium transition active:translate-y-px', on ? 'bg-field-ink text-field' : 'bg-transparent text-field-ink ring-1 ring-inset ring-[#63625c]')}
    >
      {label}
    </button>
  );

  return (
    <section id="prices" aria-labelledby="price-title" className="mt-[clamp(120px,14vw,200px)] flex flex-col lg:min-h-[80svh] justify-center bg-field py-24 text-field-ink">
      <div className="page-gutter">
        <h2 id="price-title" className="display text-[clamp(56px,8.6vw,150px)]" aria-live="polite">
          <span className="num">{pages}</span> {colour ? 'colour' : 'B/W'} pages
          <br />
          <span className="num inline-block bg-brass px-[0.15em] text-brass-ink">{rupees(total)}</span> {spiral ? 'bound' : 'total'}
        </h2>

        <div className="mt-12 grid gap-8 md:grid-cols-12 md:items-end">
          <div className="md:col-span-6">
            <label htmlFor="pages" className="text-[16px]">
              Pages: <span className="num">{pages}</span>
            </label>
            <input
              id="pages"
              type="range"
              min={1}
              max={300}
              value={pages}
              onChange={(e) => setPages(Number(e.target.value))}
              className="mt-3 block h-11 w-full cursor-pointer accent-[rgb(var(--brass))]"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {toggle(colour, setColour, 'Colour')}
              {toggle(double, setDouble, 'Double-sided')}
              {toggle(spiral, setSpiral, 'Spiral bound')}
            </div>
            <p className="mt-6 max-w-[46ch] font-serif text-[19px] leading-[1.45]">
              Priced from {shopName}: B/W {rupees(rule.bwSingle)} a page, colour {rupees(rule.colorSingle)}, spiral binding {rupees(rule.spiralBinding)}. Every shop sets its own list, and the total you see is the total you pay.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 md:col-span-3 md:col-start-10 md:items-end">
            <Link to={cheapest ? `/print/${cheapest.id}` : '/shops'} className="inline-flex h-12 items-center bg-brass px-6 text-[16px] font-medium text-brass-ink transition hover:brightness-95 active:translate-y-px">
              Print this now
            </Link>
            <Link to="/shops" className="text-[16px] underline underline-offset-4 hover:no-underline">Compare all price lists</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function ShopsTable() {
  const q = useQuery({ queryKey: ['shops', 'home'], queryFn: () => api.get<{ shops: ShopSummary[] }>('/shops?city=Chennai') });
  const rows = q.data?.shops ?? [];
  return (
    <section id="shops" aria-labelledby="shops-title" className="page-gutter pt-[clamp(120px,14vw,200px)]">
      <h2 id="shops-title" className="rise display text-[clamp(48px,6.4vw,104px)] md:indent-[3vw]">
        Shops on streets
        <br />
        you already walk
      </h2>
      <div className="mt-24 grid gap-10 md:grid-cols-12">
        <figure className="rise md:col-span-4 md:self-end">
          <Photo src="/assets/venkatanarayana-road-t-nagar-chennai.jpg" alt="Blue Venkata Narayana Road sign in Tamil and English, T. Nagar" className="aspect-[4/5]" />
          <figcaption className="mt-2 text-[13px] text-muted">Venkata Narayana Road, T. Nagar</figcaption>
        </figure>
        <div className="md:col-span-7 md:col-start-6">
          <div className="grid gap-2 md:grid-cols-[1fr_5fr]">
            <p className="hidden pt-1 text-[13px] text-muted md:block">Shops</p>
            <ul className="rise" aria-busy={q.isLoading}>
              {q.isLoading && <li className="py-3 text-[16px] text-muted">Finding shops…</li>}
              {q.error && <li className="py-3 text-[16px]">Shops could not load. <Link className="underline" to="/shops">Open the shop list</Link></li>}
              {rows.map((s) => (
                <li key={s.id}>
                  <Link to={`/shops/${s.slug}`} className="group grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 py-3 text-[16px] md:grid-cols-[28%_1fr_auto]">
                    <span className="text-muted">{s.area}</span>
                    <span className="col-start-1 font-medium group-hover:underline md:col-start-2">{s.name}</span>
                    <span className="num col-start-2 row-start-1 text-right md:col-start-3">
                      {s.startingPrice != null ? `${rupees(s.startingPrice)} a page` : '—'} <span aria-hidden="true">→</span>
                    </span>
                    <span className="col-span-2 text-[13px] text-muted md:col-span-1 md:col-start-2">
                      {s.isOpen ? `Open till ${time12(s.closeTime)}` : `Opens ${time12(s.openTime)}`} · ready in about {s.estimatedPickupMins} min{s.deliveryAvailable ? ' · delivers' : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <Photo src="/assets/diwali-urban-shopping-thiyagaraja-nagar-chennai.jpg" alt="A crowded T. Nagar shopping street before Diwali" className="rise mt-12 aspect-[16/9]" />
          <p className="mt-2 text-[13px] text-muted">T. Nagar before Diwali, when the queue at the counter is longest.</p>
        </div>
      </div>
    </section>
  );
}

const FIELDS = [
  {
    phrase: 'Pay before you queue',
    text: 'UPI, cards and net banking through Razorpay. The shop sees a paid order with your files attached, so nobody asks for change.',
    tone: 'bg-[#dcdcd6] text-[#181715]',
  },
  {
    phrase: 'Your code, your prints',
    text: 'Every pickup gets a six-digit code that only you can see. The shop hands over the prints when you read it out.',
    tone: 'bg-brass text-brass-ink',
  },
  {
    phrase: 'Files gone in a day',
    text: 'Documents are stored privately and deleted 24 hours after you collect. Only the shop you chose can open them.',
    tone: 'bg-field text-field-ink',
  },
];

function Fields() {
  return (
    <section aria-labelledby="field-0" className="mt-[clamp(120px,14vw,200px)]">
      {FIELDS.map((f, i) => {
        const mirror = i % 2 === 1;
        return (
          <div key={f.phrase} className={cn('relative flex flex-col justify-between gap-16 p-7 py-12 lg:min-h-[76svh]', f.tone)}>
            <p className={cn('rise max-w-[30ch] font-serif text-[19px] leading-[1.45]', mirror ? 'md:ml-[8%] max-md:self-end max-md:text-right' : 'md:ml-[58%]')}>{f.text}</p>
            <h2 id={`field-${i}`} className={cn('rise display text-[clamp(56px,8.6vw,150px)]', mirror && 'md:text-right')}>
              {f.phrase}
            </h2>
          </div>
        );
      })}
    </section>
  );
}

function Choice() {
  return (
    <section aria-labelledby="choice-title" className="flex flex-col justify-between gap-16 bg-field px-4 py-16 lg:min-h-[100svh] lg:py-8 text-center text-field-ink">
      <h2 id="choice-title" className="contents">
        <span className="display mx-auto block max-w-[16ch] text-[clamp(56px,8.6vw,150px)]">Printing tonight</span>
        <span className="flex flex-col items-center gap-4">
          <span className="flex flex-col items-center gap-3 md:flex-row md:gap-[120px]">
            <Link to="/shops" className="inline-flex h-14 w-[72vw] items-center justify-center bg-brass text-[16px] font-medium text-brass-ink transition hover:brightness-95 active:translate-y-px md:w-[200px]">
              Find a shop
            </Link>
            <span className="text-[16px] text-field-ink/75">or</span>
            <Link to="/shop/register" className="inline-flex h-14 w-[72vw] items-center justify-center bg-field-ink text-[16px] font-medium text-field transition hover:opacity-90 active:translate-y-px md:w-[200px]">
              List your shop
            </Link>
          </span>
          <span className="max-w-[48ch] text-[16px] text-field-ink/75">Customers pay the shop's own per-page price. Shops get paid orders with the files attached and pay a small commission on each.</span>
        </span>
        <span className="display mx-auto block max-w-[16ch] text-[clamp(56px,8.6vw,150px)]">or running a shop?</span>
      </h2>
    </section>
  );
}

function Footer() {
  return (
    <footer className="relative flex flex-col overflow-hidden bg-surface lg:min-h-[100svh] text-ink">
      <div className="page-gutter grid flex-1 gap-10 pt-16 md:grid-cols-12">
        <div className="md:col-span-7">
          <h2 className="display text-[clamp(48px,6.4vw,104px)]">
            Your notes are waiting
            <br />
            to be printed
          </h2>
          <Link to="/shops" className="mt-8 inline-flex h-12 items-center bg-brass px-6 text-[16px] font-medium text-brass-ink transition hover:brightness-95 active:translate-y-px">
            Upload &amp; print
          </Link>
        </div>
        <ul className="flex flex-col gap-2 text-[16px] md:col-span-3 md:col-start-10">
          <li><Link className="hover:underline" to="/about">About</Link></li>
          <li><Link className="hover:underline" to="/contact">Contact</Link></li>
          <li><Link className="hover:underline" to="/refund-policy">Refund policy</Link></li>
          <li><Link className="hover:underline" to="/shop/register">List your shop</Link></li>
          <li><ThemeToggle className="-ml-2 text-[16px] text-ink" /></li>
        </ul>
      </div>
      <div className="page-gutter flex flex-wrap justify-between gap-x-6 gap-y-2 pb-4 text-[13px] text-muted">
        <span>© {new Date().getFullYear()} PrintPoint · <Link className="underline" to="/privacy">Privacy</Link> · <Link className="underline" to="/terms">Terms</Link></span>
        <span className="max-w-[60ch]">
          Photos and footage from Wikimedia Commons, CC BY / BY-SA. <Link className="underline" to="/about#credits">Credits</Link>
        </span>
      </div>
      <p aria-hidden="true" className="display -mb-[0.22em] translate-y-[8%] whitespace-nowrap pl-[clamp(16px,2.4vw,32px)] text-[34vw] leading-[0.8] md:text-[27vw]">
        PrintPoint
      </p>
    </footer>
  );
}

export default function Home() {
  useRise();
  return (
    <div className="bg-paper font-serif text-ink">
      <Hero />
      <HowItWorks />
      <PriceSentence />
      <ShopsTable />
      <Fields />
      <Choice />
      <Footer />
    </div>
  );
}
