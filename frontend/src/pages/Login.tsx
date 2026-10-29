import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { User } from '@/lib/types';
import { Alert, Button, Card, Input, Segmented } from '@/components/ui';

type Mode = 'otp' | 'password' | 'register';
interface Session { accessToken: string; user: User }

const mobileSchema = z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number');
const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter your name'),
    email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
    mobile: mobileSchema.optional().or(z.literal('')),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    role: z.enum(['CUSTOMER', 'SHOP_OWNER']),
  })
  .refine((v) => v.email || v.mobile, { message: 'Enter an email or mobile number', path: ['email'] });

const homeFor = (u: User) => (u.role === 'ADMIN' ? '/admin' : u.role === 'SHOP_OWNER' ? '/owner' : '/?view=mine');

export default function Login() {
  const { user, signIn } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get('next');
  const [mode, setMode] = useState<Mode>('otp');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ identifier: '', password: '', mobile: '', otp: '', name: '', email: '', role: 'CUSTOMER' as 'CUSTOMER' | 'SHOP_OWNER' });
  const [otpSent, setOtpSent] = useState<string | null>(null);
  const [needsName, setNeedsName] = useState(false);

  if (user) return <Navigate to={next && next.startsWith('/') ? next : homeFor(user)} replace />;

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const done = (s: Session) => {
    signIn(s);
    navigate(next && next.startsWith('/') ? next : s.user.role === 'SHOP_OWNER' && form.role === 'SHOP_OWNER' && mode === 'register' ? '/shop/register' : homeFor(s.user), { replace: true });
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await fn();
    } catch (e) {
      if (e instanceof z.ZodError) setFieldErrors(Object.fromEntries(e.issues.map((i) => [String(i.path[0]), i.message])));
      else if (e instanceof ApiError && (e.details as { needsName?: boolean } | undefined)?.needsName) {
        setNeedsName(true);
        setError('New here? Enter your name to create an account.');
      } else setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (mode === 'password') {
        done(await api.post<Session>('/auth/login', { identifier: form.identifier, password: form.password }));
      } else if (mode === 'otp') {
        const mobile = mobileSchema.parse(form.mobile);
        if (!otpSent) {
          const r = await api.post<{ devHint?: string }>('/auth/otp/request', { mobile });
          setOtpSent(r.devHint ?? 'OTP sent to your mobile');
        } else {
          done(await api.post<Session>('/auth/otp/verify', { mobile, otp: form.otp, name: needsName ? form.name : undefined }));
        }
      } else {
        const v = registerSchema.parse(form);
        done(await api.post<Session>('/auth/register', { ...v, email: v.email || undefined, mobile: v.mobile || undefined }));
      }
    });
  };

  return (
    <div className="mx-auto max-w-md">
      <Card className="p-6">
        <h1 className="display misreg mb-2 text-[2.25rem]">{mode === 'register' ? 'Create account' : 'Sign in'}</h1>
        <p className="mb-5 text-sm text-muted">Follow your print requests live and collect with a code.</p>
        <Segmented
          label="Method"
          name="mode"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
            setFieldErrors({});
          }}
          options={[
            { value: 'otp', label: 'Mobile OTP' },
            { value: 'password', label: 'Password' },
            { value: 'register', label: 'Register' },
          ]}
        />
        <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
          {error && <Alert tone="red">{error}</Alert>}
          {mode === 'otp' && (
            <>
              <Input label="Mobile number" inputMode="numeric" autoComplete="tel" maxLength={10} value={form.mobile} onChange={set('mobile')} disabled={!!otpSent} error={fieldErrors.mobile ?? (fieldErrors[''] || undefined)} />
              {otpSent && (
                <>
                  <Alert tone="green">{otpSent}</Alert>
                  <Input label="6-digit OTP" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={form.otp} onChange={set('otp')} autoFocus />
                  {needsName && <Input label="Your name" value={form.name} onChange={set('name')} autoComplete="name" />}
                  <button type="button" className="text-sm text-ink underline" onClick={() => { setOtpSent(null); setForm((f) => ({ ...f, otp: '' })); }}>
                    Change number
                  </button>
                </>
              )}
            </>
          )}
          {mode === 'password' && (
            <>
              <Input label="Email or mobile" autoComplete="username" value={form.identifier} onChange={set('identifier')} />
              <Input label="Password" type="password" autoComplete="current-password" value={form.password} onChange={set('password')} />
            </>
          )}
          {mode === 'register' && (
            <>
              <Input label="Full name" autoComplete="name" value={form.name} onChange={set('name')} error={fieldErrors.name} />
              <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={fieldErrors.email} />
              <Input label="Mobile number" inputMode="numeric" autoComplete="tel" maxLength={10} value={form.mobile} onChange={set('mobile')} error={fieldErrors.mobile} />
              <Input label="Password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={fieldErrors.password} hint="At least 8 characters" />
            </>
          )}
          <Button variant="primary" type="submit" className="w-full" size="lg" loading={busy}>
            {mode === 'otp' ? (otpSent ? 'Verify & continue' : 'Send OTP') : mode === 'password' ? 'Sign in' : 'Create account'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
