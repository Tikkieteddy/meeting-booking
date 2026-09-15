import { RegisterForm } from '@/components/auth/auth-forms';
import { env } from '@/lib/env';
import { t } from '@/lib/i18n';

export const metadata = { title: t('auth.register') };

export default function RegisterPage() {
  if (!env().AUTH_ALLOW_SELF_REGISTER) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold text-ink-900">{t('auth.register')}</h1>
        <p className="text-sm text-ink-600">{t('auth.selfRegisterDisabled')}</p>
      </div>
    );
  }
  return <RegisterForm />;
}
