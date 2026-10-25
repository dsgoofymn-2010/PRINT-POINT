import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SKIP_LOGIN, useAuth } from '@/lib/auth';
import type { Role } from '@/lib/types';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Loading, cn } from './ui';

/** The mark: a paper sheet with a brass copy offset behind it, as it leaves the machine. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-6 w-6 flex-none', className)} aria-hidden="true">
      <rect width="32" height="32" fill="rgb(var(--ink))" />
      <rect x="7" y="5" width="14" height="19" fill="rgb(var(--paper))" />
      <rect x="11" y="9" width="14" height="19" fill="rgb(var(--brass))" />
    </svg>
  );
}

export function Wordmark({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2" aria-label="PrintPoint home">
      <Mark />
      <span className="display pt-0.5 text-[1.625rem] leading-none tracking-[0.01em]">PrintPoint</span>
    </Link>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('pp_theme', dark ? 'dark' : 'light');
    } catch {
      /* storage blocked */
    }
  }, [dark]);
  return (
    <button onClick={() => setDark((d) => !d)} className={cn('rounded-control px-2 py-1.5 text-sm text-muted hover:bg-active hover:text-ink', className)} aria-pressed={dark}>
      {dark ? 'Light' : 'Dark'}
    </button>
  );
}

const topLink = ({ isActive }: { isActive: boolean }) =>
  cn('rounded-full px-4 py-2.5 text-sm transition-colors duration-200 md:py-2', isActive ? 'bg-ink/[0.07] text-ink' : 'text-muted hover:bg-ink/5 hover:text-ink');

/** Customer screens: a plain bar over a centred column. */
function CustomerShell() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname, location.search]);
  const onHome = location.pathname === '/';
  const mine = onHome && location.search.includes('view=mine');
  const reduce = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = (
    <>
      <NavLink to="/" className={() => topLink({ isActive: onHome && !mine })}>New request</NavLink>
      {user && user.role !== 'SHOP_OWNER' && <NavLink to="/?view=mine" className={() => topLink({ isActive: mine })}>My requests</NavLink>}
      {user && user.role !== 'CUSTOMER' && <NavLink to="/owner" className={topLink}>Shop desk</NavLink>}
      {user?.role === 'ADMIN' && <NavLink to="/admin" className={topLink}>Admin</NavLink>}
    </>
  );

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:bg-surface focus:p-2">Skip to content</a>
      <motion.header
        initial={reduce ? false : { y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-x-0 top-3 z-40 px-3 sm:top-4 sm:px-6"
      >
        <div
          className={cn(
            'mx-auto flex h-14 max-w-[1100px] items-center justify-between gap-4 rounded-full border pl-5 pr-2 backdrop-blur-xl backdrop-saturate-150 transition-[background-color,box-shadow,border-color] duration-300',
            scrolled || open
              ? 'border-white/60 bg-ground/75 shadow-[0_8px_30px_rgb(0_0_0/0.08)]'
              : 'border-white/40 bg-ground/40 shadow-[0_2px_12px_rgb(0_0_0/0.04)]',
          )}
        >
          <Wordmark />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {links}
            {!SKIP_LOGIN && (user ? (
              <button onClick={() => void signOut()} className="ml-1 h-10 cursor-pointer rounded-full px-4 text-sm text-muted transition-colors duration-200 hover:bg-ink/5 hover:text-ink">
                Sign out {user.name.split(' ')[0]}
              </button>
            ) : (
              <Link to="/login" className="ml-1 inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-on-primary">Sign in</Link>
            ))}
          </nav>
          <button onClick={() => setOpen((o) => !o)} className="h-11 cursor-pointer rounded-full px-4 text-sm font-medium transition-colors hover:bg-ink/5 md:hidden" aria-expanded={open} aria-controls="mobile-nav">
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
        <AnimatePresence>
          {open && (
            <motion.nav
              id="mobile-nav"
              initial={reduce ? false : { opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? undefined : { opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="mx-auto mt-2 flex max-w-[1100px] flex-col gap-1 rounded-3xl border border-white/60 bg-ground/85 p-3 shadow-[0_8px_30px_rgb(0_0_0/0.1)] backdrop-blur-xl md:hidden"
              aria-label="Mobile"
            >
              {links}
              {!SKIP_LOGIN && (user ? (
                <button onClick={() => void signOut()} className="rounded-full px-4 py-2.5 text-left text-sm text-muted hover:bg-ink/5">Sign out</button>
              ) : (
                <NavLink to="/login" className={topLink}>Sign in</NavLink>
              ))}
            </motion.nav>
          )}
        </AnimatePresence>
      </motion.header>
      <main id="main" className="mx-auto w-full max-w-[1152px] flex-1 px-4 pb-8 pt-24 sm:px-6">
        <Outlet />
      </main>
      <SmallFooter />
    </div>
  );
}

export function SmallFooter() {
  return (
    <footer className="border-t border-line text-[0.875rem] text-muted">
      <div className="mx-auto flex max-w-[1152px] flex-wrap gap-x-5 gap-y-2 px-4 py-5 sm:px-6">
        <span>PrintPoint, Chennai</span>
        <Link className="hover:text-ink" to="/about">About</Link>
        <Link className="hover:text-ink" to="/contact">Contact</Link>
        <Link className="hover:text-ink" to="/privacy">Privacy</Link>
        <Link className="hover:text-ink" to="/terms">Terms</Link>
        <Link className="hover:text-ink" to="/refund-policy">Refund policy</Link>
      </div>
    </footer>
  );
}

const sideLink = ({ isActive }: { isActive: boolean }) =>
  cn('flex h-8 items-center justify-between rounded-control px-3 text-sm transition-colors', isActive ? 'bg-active text-ink' : 'text-muted hover:text-ink');

/** Shop owner and admin: open-plane sidebar on the page ground; folds to a 48px bar on phones. */
function DeskShell() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname, location.search]);
  const isAdmin = location.pathname.startsWith('/admin');
  const shop = useQuery({
    queryKey: ['shop-dashboard'],
    queryFn: () => api.get<{ shop: { name: string; status: string }; stats: { pendingOrders: number } }>('/shop/dashboard'),
    refetchInterval: 30_000,
    enabled: !isAdmin && user?.role === 'SHOP_OWNER',
    retry: false,
  });
  const scope = isAdmin ? 'Admin' : shop.data?.shop.name ?? 'PrintPoint';
  const waiting = shop.data?.stats.pendingOrders ?? 0;

  const nav = isAdmin ? (
    <>
      <NavLink end to="/admin" className={sideLink}>Overview</NavLink>
      {(['orders', 'payments', 'refunds', 'users', 'fraud', 'audit'] as const).map((t) => (
        <NavLink key={t} to={`/admin?tab=${t}`} className={() => sideLink({ isActive: location.search === `?tab=${t}` })}>
          {{ orders: 'Orders', payments: 'Payments', refunds: 'Refunds', users: 'People', fraud: 'Fraud checks', audit: 'Audit log' }[t]}
        </NavLink>
      ))}
    </>
  ) : (
    <>
      <NavLink to="/owner" className={sideLink}>
        <span>Requests</span>
        {waiting > 0 && <span className="num text-[0.875rem] text-ink">{waiting}</span>}
      </NavLink>
      <NavLink to="/shop?tab=sales" className={() => sideLink({ isActive: location.pathname === '/shop' && (location.search === '?tab=sales' || !location.search) })}>Takings</NavLink>
      <NavLink to="/shop/pricing" className={sideLink}>Price list</NavLink>
      <NavLink to="/shop?tab=profile" className={() => sideLink({ isActive: location.search === '?tab=profile' })}>Shop details</NavLink>
    </>
  );

  const sidebar = (
    <div className="flex h-full flex-col gap-6 px-3 py-5">
      <div className="px-3">
        <Wordmark to={isAdmin ? '/admin' : '/owner'} />
        <p className="mt-3 truncate text-[0.875rem] text-muted">{scope}</p>
      </div>
      <nav className="flex flex-col gap-0.5" aria-label="Desk">{nav}</nav>
      <div className="mt-auto flex flex-col gap-0.5">
        {user?.role === 'ADMIN' && !isAdmin && <NavLink to="/admin" className={sideLink}>Admin</NavLink>}
        <NavLink to="/" className={sideLink}>Customer site</NavLink>
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-line px-3 pt-3 text-sm">
          <span className="truncate">{user?.name}</span>
          {!SKIP_LOGIN && <button onClick={() => void signOut()} className="text-muted hover:text-ink">Sign out</button>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-[100dvh] border-r border-line lg:block">{sidebar}</aside>
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-line bg-ground px-4 lg:hidden">
        <Wordmark to={isAdmin ? '/admin' : '/owner'} />
        <button onClick={() => setOpen(true)} className="h-9 rounded-control px-3 text-sm font-medium hover:bg-active" aria-expanded={open}>Menu</button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 bg-ground lg:hidden" role="dialog" aria-label="Menu">
          <button onClick={() => setOpen(false)} className="absolute right-4 top-2 h-9 rounded-control px-3 text-sm font-medium hover:bg-active">Close</button>
          {sidebar}
        </div>
      )}
      <main id="main" className="min-w-0 px-4 py-6 sm:px-8 lg:py-8">
        <div className="w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const owner = user && user.role !== 'CUSTOMER';
  let shell = <CustomerShell />;
  if (pathname === '/owner') shell = owner ? <DeskShell /> : <CustomerShell />;
  else if ((pathname.startsWith('/shop') && pathname !== '/shop/register') || pathname.startsWith('/admin')) shell = <DeskShell />;
  return (
    <>
      {shell}
      {SKIP_LOGIN && <TestModeBar />}
    </>
  );
}

const TEST_ROLES: { role: Role; label: string; home: string }[] = [
  { role: 'CUSTOMER', label: 'Customer', home: '/' },
  { role: 'SHOP_OWNER', label: 'Shop owner', home: '/owner' },
  { role: 'ADMIN', label: 'Admin', home: '/admin' },
];

/** Demo site: one-click switch between roles, no password. */
function TestModeBar() {
  const { user, switchRole } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  return (
    <div className="fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 flex-wrap items-center gap-1 rounded-control border border-line bg-ground p-1 text-xs shadow-sm">
      <span className="px-2 font-medium text-muted">View as</span>
      {TEST_ROLES.map((r) => (
        <button
          key={r.role}
          onClick={() => {
            setError('');
            switchRole(r.role).then(() => navigate(r.home), (e: Error) => setError(e.message));
          }}
          className={`rounded-control px-2 py-1 ${user?.role === r.role ? 'bg-primary text-on-primary' : 'text-ink hover:bg-active'}`}
        >
          {r.label}
        </button>
      ))}
      {error && <span className="px-2 text-red-600">{error}</span>}
    </div>
  );
}

export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, loading, switchRole } = useAuth();
  const location = useLocation();
  // Demo site: opening a page signs you in as whoever that page is for.
  const need = SKIP_LOGIN && !loading && (!user || (roles && !roles.includes(user.role))) ? (roles?.[0] ?? 'CUSTOMER') : null;
  useEffect(() => {
    if (need) void switchRole(need).catch(() => undefined);
  }, [need, switchRole]);
  if (loading || need) return <Loading />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
