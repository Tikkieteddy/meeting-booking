'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Button, Field, Input } from '@/components/ui/primitives';
import { ApiClientError, apiFetch } from '@/lib/client/api';
import { t } from '@/lib/i18n';

function useFormSubmit<T>(submit: (values: T) => Promise<void>) {
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const run = async (values: T) => {
    setLoading(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await submit(values);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setFieldErrors(error.fieldErrors());
        setFormError(error.message);
      } else {
        setFormError(t('common.unknownError'));
      }
    } finally {
      setLoading(false);
    }
  };

  return { loading, formError, fieldErrors, run, setFormError };
}

function FormBanner({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={
        tone === 'error'
          ? 'rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800'
          : 'rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800'
      }
    >
      {children}
    </div>
  );
}

export function LoginForm() {
  const router = useRouter();
  const { loading, formError, fieldErrors, run } = useFormSubmit<{ email: string; password: string }>(async (values) => {
    await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify(values) });
    router.replace('/calendar');
    router.refresh();
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run({ email: String(form.get('email') ?? ''), password: String(form.get('password') ?? '') });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold text-ink-900">{t('auth.login')}</h1>
        <p className="mt-1 text-sm text-ink-500">{t('app.tagline')}</p>
      </div>
      {formError && <FormBanner tone="error">{formError}</FormBanner>}
      <Field label={t('auth.email')} htmlFor="email" required error={fieldErrors.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          aria-invalid={Boolean(fieldErrors.email)}
          placeholder="name@example.com"
        />
      </Field>
      <Field label={t('auth.password')} htmlFor="password" required error={fieldErrors.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={Boolean(fieldErrors.password)} />
      </Field>
      <Button type="submit" loading={loading} size="lg">
        {t('auth.login')}
      </Button>
      <div className="flex items-center justify-between text-sm">
        <Link href="/forgot-password" className="text-brand-700 underline-offset-2 hover:underline">
          {t('auth.forgotPassword')}
        </Link>
        <Link href="/register" className="text-brand-700 underline-offset-2 hover:underline">
          {t('auth.register')}
        </Link>
      </div>
    </form>
  );
}

export function RegisterForm() {
  const [done, setDone] = useState(false);
  const { loading, formError, fieldErrors, run } = useFormSubmit<Record<string, string>>(async (values) => {
    await apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(values) });
    setDone(true);
  });

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <FormBanner tone="success">{t('auth.verifyEmailSent')}</FormBanner>
        <Link href="/login" className="text-sm text-brand-700 underline-offset-2 hover:underline">
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    );
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run({
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
      fullName: String(form.get('fullName') ?? ''),
      department: String(form.get('department') ?? ''),
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold text-ink-900">{t('auth.register')}</h1>
        <p className="mt-1 text-sm text-ink-500">ใช้อีเมลองค์กรเพื่อสร้างบัญชี</p>
      </div>
      {formError && <FormBanner tone="error">{formError}</FormBanner>}
      <Field label={t('auth.fullName')} htmlFor="fullName" required error={fieldErrors.fullName}>
        <Input id="fullName" name="fullName" required autoComplete="name" />
      </Field>
      <Field label={t('auth.email')} htmlFor="email" required error={fieldErrors.email}>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>
      <Field label={t('auth.department')} htmlFor="department" error={fieldErrors.department}>
        <Input id="department" name="department" autoComplete="organization" />
      </Field>
      <Field label={t('auth.password')} htmlFor="password" required error={fieldErrors.password} hint={t('auth.passwordRule')}>
        <Input id="password" name="password" type="password" required autoComplete="new-password" />
      </Field>
      <Button type="submit" loading={loading} size="lg">
        {t('auth.register')}
      </Button>
      <Link href="/login" className="text-sm text-brand-700 underline-offset-2 hover:underline">
        มีบัญชีอยู่แล้ว เข้าสู่ระบบ
      </Link>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const { loading, formError, fieldErrors, run } = useFormSubmit<{ email: string }>(async (values) => {
    await apiFetch('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify(values) });
    setSent(true);
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void run({ email: String(form.get('email') ?? '') });
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <h1 className="text-xl font-semibold text-ink-900">{t('auth.forgotPassword')}</h1>
      {sent && <FormBanner tone="success">{t('auth.resetLinkSent')}</FormBanner>}
      {formError && <FormBanner tone="error">{formError}</FormBanner>}
      <Field label={t('auth.email')} htmlFor="email" required error={fieldErrors.email}>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>
      <Button type="submit" loading={loading} size="lg">
        {t('auth.sendResetLink')}
      </Button>
      <Link href="/login" className="text-sm text-brand-700 underline-offset-2 hover:underline">
        กลับไปหน้าเข้าสู่ระบบ
      </Link>
    </form>
  );
}

export function ResetPasswordForm({ token, mode = 'reset' }: { token: string; mode?: 'reset' | 'invite' }) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const endpoint = mode === 'invite' ? '/api/auth/accept-invite' : '/api/auth/reset-password';
  const { loading, formError, fieldErrors, run } = useFormSubmit<{ password: string; confirm: string }>(async (values) => {
    if (values.password !== values.confirm) {
      throw new ApiClientError('รหัสผ่านทั้งสองช่องไม่ตรงกัน', 'mismatch', 400, [
        { code: 'mismatch', field: 'confirm', message: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน' },
      ]);
    }
    await apiFetch(endpoint, { method: 'POST', body: JSON.stringify({ token, password: values.password }) });
    setDone(true);
    window.setTimeout(() => router.replace('/login'), 1500);
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void run({ password: String(form.get('password') ?? ''), confirm: String(form.get('confirm') ?? '') });
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <h1 className="text-xl font-semibold text-ink-900">
        {mode === 'invite' ? 'ตั้งรหัสผ่านเพื่อเริ่มใช้งาน' : t('auth.resetPassword')}
      </h1>
      {done && <FormBanner tone="success">ตั้งรหัสผ่านใหม่สำเร็จ กำลังพาไปหน้าเข้าสู่ระบบ</FormBanner>}
      {formError && <FormBanner tone="error">{formError}</FormBanner>}
      <Field label={t('auth.password')} htmlFor="password" required error={fieldErrors.password} hint={t('auth.passwordRule')}>
        <Input id="password" name="password" type="password" required autoComplete="new-password" />
      </Field>
      <Field label={t('auth.passwordConfirm')} htmlFor="confirm" required error={fieldErrors.confirm}>
        <Input id="confirm" name="confirm" type="password" required autoComplete="new-password" />
      </Field>
      <Button type="submit" loading={loading} size="lg">
        {t('common.save')}
      </Button>
    </form>
  );
}
