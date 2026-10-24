import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { User } from '@/lib/types';
import { Alert, Button, Input } from '../ui';

/** Phone + OTP sign-in inside the chat. New numbers are asked for a name. */
export function PhoneStep() {
  const { signIn } = useAuth();
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [sent, setSent] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [needsName, setNeedsName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && (e.details as { needsName?: boolean } | undefined)?.needsName) {
        setNeedsName(true);
        setError(null);
      } else setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const sendCode = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (!/^[6-9]\d{9}$/.test(mobile.trim())) throw new Error('Enter a valid 10-digit mobile number');
      const r = await api.post<{ devHint?: string }>('/auth/otp/request', { mobile: mobile.trim() });
      setSent(true);
      setHint(r.devHint ?? null);
    });
  };

  const verify = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const s = await api.post<{ accessToken: string; user: User }>('/auth/otp/verify', { mobile: mobile.trim(), otp: otp.trim(), name: needsName ? name.trim() : undefined });
      signIn(s);
    });
  };

  return (
    <div className="space-y-3">
      {!sent ? (
        <form onSubmit={sendCode} className="flex flex-wrap items-end gap-2">
          <div className="w-full max-w-[16rem]">
            <Input label="Mobile number" inputMode="numeric" autoComplete="tel-national" maxLength={10} placeholder="98765 43210" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} className="h-11 text-[17px]" />
          </div>
          <Button type="submit" variant="primary" size="lg" loading={busy}>Send code</Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <p className="text-[17px]">
            We sent a 6-digit code to <span className="num font-medium">{mobile}</span>.{' '}
            <button type="button" className="underline underline-offset-2" onClick={() => { setSent(false); setOtp(''); setNeedsName(false); }}>Change number</button>
          </p>
          {hint && <Alert tone="amber">{hint}</Alert>}
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-full max-w-[10rem]">
              <Input label="Code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} className="num h-11 text-[17px] tracking-[0.3em]" />
            </div>
            {needsName && (
              <div className="w-full max-w-[16rem]">
                <Input label="Your name (first time here)" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="h-11 text-[17px]" />
              </div>
            )}
            <Button type="submit" variant="primary" size="lg" loading={busy} disabled={otp.length !== 6 || (needsName && name.trim().length < 2)}>
              Verify
            </Button>
          </div>
        </form>
      )}
      {error && <Alert tone="red">{error}</Alert>}
    </div>
  );
}
