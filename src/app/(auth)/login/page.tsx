import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/auth-forms';
import { getSessionUser } from '@/lib/auth/current-user';
import { t } from '@/lib/i18n';

export const metadata = { title: t('auth.login') };

export default async function LoginPage() {
  if (await getSessionUser()) redirect('/calendar');
  return <LoginForm />;
}
