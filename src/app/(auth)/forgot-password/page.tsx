import { ForgotPasswordForm } from '@/components/auth/auth-forms';
import { t } from '@/lib/i18n';

export const metadata = { title: t('auth.forgotPassword') };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
