import Link from 'next/link';
import { ResetPasswordForm } from '@/components/auth/auth-forms';

export const metadata = { title: 'ตั้งรหัสผ่านเพื่อเริ่มใช้งาน' };

export default async function AcceptInvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold text-ink-900">คำเชิญไม่ถูกต้อง</h1>
        <p className="text-sm text-ink-600">ลิงก์คำเชิญหมดอายุหรือถูกใช้ไปแล้ว กรุณาติดต่อผู้ดูแลระบบ</p>
        <Link href="/login" className="text-sm text-brand-700 underline-offset-2 hover:underline">
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    );
  }
  return <ResetPasswordForm token={token} mode="invite" />;
}
