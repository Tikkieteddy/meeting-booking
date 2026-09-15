'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Checkbox, Field, Input, Select, cx } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/client/api';
import { t } from '@/lib/i18n';

type Props = {
  profile: {
    fullName: string;
    email: string;
    phone: string | null;
    department: string | null;
    jobTitle: string | null;
    locale: 'th' | 'en';
    timezone: string;
    roleLabel: string;
  };
  preferences: { emailEnabled: boolean; lineEnabled: boolean; inAppEnabled: boolean; reminderLeads: number[] };
  lineLink: { status: string; linkedAt: string | null } | null;
};

const REMINDER_OPTIONS = [
  { minutes: 1440, label: '24 ชั่วโมงก่อน' },
  { minutes: 120, label: '2 ชั่วโมงก่อน' },
  { minutes: 60, label: '1 ชั่วโมงก่อน' },
  { minutes: 15, label: '15 นาทีก่อน' },
  { minutes: 5, label: '5 นาทีก่อน' },
];

/** หน้าโปรไฟล์: ข้อมูลส่วนตัว รหัสผ่าน การแจ้งเตือน และการเชื่อม LINE */
export function ProfileForm({ profile, preferences, lineLink }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<'profile' | 'password' | 'notify'>('profile');
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [prefs, setPrefs] = useState(preferences);
  const [linkCode, setLinkCode] = useState<{ code: string; expiresInMinutes: number } | null>(null);

  const run = async (fn: () => Promise<void>, success: string) => {
    setBusy(true);
    setFieldErrors({});
    try {
      await fn();
      toast.show(success, 'success');
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setFieldErrors(error.fieldErrors());
        toast.show(error.message, 'error');
      } else {
        toast.show(t('common.unknownError'), 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label="ส่วนของโปรไฟล์" className="flex gap-1 border-b border-ink-200">
        {(
          [
            ['profile', t('nav.profile')],
            ['password', t('auth.password')],
            ['notify', t('notify.preferences')],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cx(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
              tab === value ? 'border-brand-500 text-brand-700' : 'border-transparent text-ink-500',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void run(async () => {
              await apiFetch('/api/profile', {
                method: 'PUT',
                body: JSON.stringify({
                  fullName: String(form.get('fullName') ?? ''),
                  phone: String(form.get('phone') ?? '') || null,
                  department: String(form.get('department') ?? '') || null,
                  jobTitle: String(form.get('jobTitle') ?? '') || null,
                  locale: String(form.get('locale') ?? 'th'),
                  timezone: String(form.get('timezone') ?? 'Asia/Bangkok'),
                }),
              });
            }, 'บันทึกโปรไฟล์แล้ว');
          }}
          noValidate
        >
          <Field label={t('auth.email')} htmlFor="p-email" hint="อีเมลเปลี่ยนไม่ได้ ติดต่อผู้ดูแลระบบหากต้องแก้">
            <Input id="p-email" value={profile.email} disabled />
          </Field>
          <Field label="สิทธิ์ในระบบ" htmlFor="p-role">
            <Input id="p-role" value={profile.roleLabel} disabled />
          </Field>
          <Field label={t('auth.fullName')} htmlFor="p-name" required error={fieldErrors.fullName}>
            <Input id="p-name" name="fullName" defaultValue={profile.fullName} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('auth.department')} htmlFor="p-dept" error={fieldErrors.department}>
              <Input id="p-dept" name="department" defaultValue={profile.department ?? ''} />
            </Field>
            <Field label="ตำแหน่ง" htmlFor="p-job" error={fieldErrors.jobTitle}>
              <Input id="p-job" name="jobTitle" defaultValue={profile.jobTitle ?? ''} />
            </Field>
            <Field label={t('auth.phone')} htmlFor="p-phone" error={fieldErrors.phone}>
              <Input id="p-phone" name="phone" defaultValue={profile.phone ?? ''} inputMode="tel" />
            </Field>
            <Field label="ภาษา" htmlFor="p-locale">
              <Select id="p-locale" name="locale" defaultValue={profile.locale}>
                <option value="th">ไทย</option>
                <option value="en">English</option>
              </Select>
            </Field>
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={busy}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      )}

      {tab === 'password' && (
        <div className="flex flex-col gap-5">
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const target = event.currentTarget;
              void run(async () => {
                await apiFetch('/api/auth/change-password', {
                  method: 'POST',
                  body: JSON.stringify({
                    currentPassword: String(form.get('currentPassword') ?? ''),
                    newPassword: String(form.get('newPassword') ?? ''),
                  }),
                });
                target.reset();
              }, 'เปลี่ยนรหัสผ่านแล้ว');
            }}
            noValidate
          >
            <Field label="รหัสผ่านปัจจุบัน" htmlFor="p-current" required error={fieldErrors.currentPassword}>
              <Input id="p-current" name="currentPassword" type="password" autoComplete="current-password" required />
            </Field>
            <Field label="รหัสผ่านใหม่" htmlFor="p-new" required error={fieldErrors.newPassword} hint={t('auth.passwordRule')}>
              <Input id="p-new" name="newPassword" type="password" autoComplete="new-password" required />
            </Field>
            <Button type="submit" loading={busy}>
              {t('common.save')}
            </Button>
          </form>

          <div className="rounded-xl border border-ink-200 p-4">
            <h3 className="text-sm font-semibold text-ink-800">{t('auth.logoutAllDevices')}</h3>
            <p className="mt-1 text-xs text-ink-500">
              ใช้เมื่อสงสัยว่ามีผู้อื่นเข้าถึงบัญชีของคุณ ทุกอุปกรณ์จะต้องเข้าสู่ระบบใหม่
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() =>
                void run(async () => {
                  await apiFetch('/api/auth/logout-all', { method: 'POST' });
                  window.location.href = '/login';
                }, 'ออกจากระบบทุกอุปกรณ์แล้ว')
              }
            >
              {t('auth.logoutAllDevices')}
            </Button>
          </div>
        </div>
      )}

      {tab === 'notify' && (
        <div className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium text-ink-700">ช่องทางที่ต้องการรับแจ้งเตือน</legend>
            <Checkbox
              label={t('notify.channelEmail')}
              checked={prefs.emailEnabled}
              onChange={(event) => setPrefs({ ...prefs, emailEnabled: event.target.checked })}
            />
            <Checkbox
              label={t('notify.channelLine')}
              description={lineLink?.status === 'linked' ? 'เชื่อมบัญชี LINE แล้ว' : 'ต้องเชื่อมบัญชี LINE ก่อนจึงจะได้รับแจ้งเตือน'}
              checked={prefs.lineEnabled}
              onChange={(event) => setPrefs({ ...prefs, lineEnabled: event.target.checked })}
            />
            <Checkbox
              label={t('notify.channelInApp')}
              checked={prefs.inAppEnabled}
              onChange={(event) => setPrefs({ ...prefs, inAppEnabled: event.target.checked })}
            />
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-ink-700">{t('notify.reminderLead')}</legend>
            {REMINDER_OPTIONS.map((option) => (
              <Checkbox
                key={option.minutes}
                label={option.label}
                checked={prefs.reminderLeads.includes(option.minutes)}
                onChange={(event) =>
                  setPrefs({
                    ...prefs,
                    reminderLeads: event.target.checked
                      ? [...prefs.reminderLeads, option.minutes].sort((a, b) => b - a)
                      : prefs.reminderLeads.filter((m) => m !== option.minutes),
                  })
                }
              />
            ))}
          </fieldset>

          <Button
            loading={busy}
            onClick={() =>
              void run(async () => {
                await apiFetch('/api/notifications/preferences', { method: 'PUT', body: JSON.stringify(prefs) });
              }, 'บันทึกการตั้งค่าแจ้งเตือนแล้ว')
            }
          >
            {t('common.save')}
          </Button>

          <div className="rounded-xl border border-ink-200 p-4">
            <h3 className="text-sm font-semibold text-ink-800">{t('notify.linkLine')}</h3>
            {lineLink?.status === 'linked' ? (
              <>
                <p className="mt-1 text-xs text-emerald-700">{t('notify.lineLinked')}</p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() =>
                    void run(async () => {
                      await apiFetch('/api/notifications/line/unlink', { method: 'POST' });
                    }, 'ยกเลิกการเชื่อม LINE แล้ว')
                  }
                >
                  {t('notify.unlinkLine')}
                </Button>
              </>
            ) : (
              <>
                <p className="mt-1 text-xs text-ink-500">
                  กดขอรหัส แล้วส่งรหัสนั้นในแชตบัญชีทางการของระบบ เพื่อยืนยันว่าเป็นคุณเอง
                </p>
                {linkCode && (
                  <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-lg font-bold tracking-widest text-brand-700">
                    {linkCode.code}
                    <span className="ms-2 align-middle text-xs font-normal text-ink-500">
                      {t('notify.lineLinkCode', { minutes: linkCode.expiresInMinutes })}
                    </span>
                  </p>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() =>
                    void run(async () => {
                      const result = await apiFetch<{ code: string; expiresInMinutes: number }>(
                        '/api/notifications/line/link',
                        { method: 'POST' },
                      );
                      setLinkCode(result);
                    }, 'สร้างรหัสเชื่อมบัญชีแล้ว')
                  }
                >
                  ขอรหัสเชื่อมบัญชี
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
