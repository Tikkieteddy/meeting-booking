'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Field, Input, Select, cx } from '@/components/ui/primitives';
import { Overlay } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/client/api';
import { ALL_ROLES, ROLES, type RoleCode } from '@/lib/rbac/permissions';
import { t } from '@/lib/i18n';
import { formatThaiDateShort } from '@/lib/util/time';

export type AdminUser = {
  id: string;
  email: string;
  fullName: string;
  department: string | null;
  status: string;
  lastLoginAt: string | null;
  roles: string[];
};

const STATUS_LABEL: Record<string, string> = {
  invited: 'รอตั้งรหัสผ่าน',
  active: 'ใช้งานได้',
  suspended: 'ถูกระงับ',
  deactivated: 'ปิดบัญชี',
};

/** จัดการผู้ใช้และสิทธิ์ (บรีฟข้อ 8) */
export function UserManager({
  users,
  canManageRoles,
  enabledRoles,
}: {
  users: AdminUser[];
  canManageRoles: boolean;
  /** บทบาทที่ยังเปิดใช้งาน — บทบาทที่ปิดไว้จะไม่โผล่ในรายการให้เลือก */
  enabledRoles: RoleCode[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [roles, setRoles] = useState<RoleCode[]>([]);
  const [status, setStatus] = useState('active');
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');

  const filtered = users.filter((u) =>
    query.trim()
      ? [u.fullName, u.email, u.department ?? ''].some((v) => v.toLowerCase().includes(query.trim().toLowerCase()))
      : true,
  );

  const openEditor = (user: AdminUser) => {
    setEditing(user);
    setRoles(user.roles.filter((r): r is RoleCode => ALL_ROLES.includes(r as RoleCode)));
    setStatus(user.status);
  };

  const saveRoles = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await apiFetch(`/api/admin/users/${editing.id}/roles`, {
        method: 'PUT',
        body: JSON.stringify({
          roles: roles.map((roleCode) => ({ roleCode, scopeType: 'organization', scopeId: null })),
          status,
        }),
      });
      toast.show('บันทึกสิทธิ์แล้ว', 'success');
      setEditing(null);
      router.refresh();
    } catch (error) {
      toast.show(error instanceof ApiClientError ? error.message : t('common.unknownError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-ink-900">{t('nav.users')}</h1>
        <div className="flex gap-2">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาชื่อ อีเมล หรือแผนก"
            aria-label="ค้นหาผู้ใช้"
            className="w-56"
          />
          <Button onClick={() => setInviteOpen(true)}>เชิญผู้ใช้</Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-ink-200 bg-white">
        <table className="w-full min-w-[40rem] text-sm">
          <caption className="sr-only">รายชื่อผู้ใช้และสิทธิ์ในระบบ</caption>
          <thead className="bg-ink-50 text-start text-xs text-ink-500">
            <tr>
              <th scope="col" className="px-3 py-2 text-start">ชื่อ</th>
              <th scope="col" className="px-3 py-2 text-start">อีเมล</th>
              <th scope="col" className="px-3 py-2 text-start">แผนก</th>
              <th scope="col" className="px-3 py-2 text-start">สิทธิ์</th>
              <th scope="col" className="px-3 py-2 text-start">สถานะ</th>
              <th scope="col" className="px-3 py-2 text-start">เข้าใช้ล่าสุด</th>
              <th scope="col" className="px-3 py-2 text-end">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => (
              <tr key={user.id} className="border-t border-ink-100">
                <td className="px-3 py-2 font-medium text-ink-800">{user.fullName}</td>
                <td className="px-3 py-2 text-ink-600">{user.email}</td>
                <td className="px-3 py-2 text-ink-600">{user.department ?? '-'}</td>
                <td className="px-3 py-2">
                  <span className="flex flex-wrap gap-1">
                    {user.roles.length === 0 ? (
                      <span className="text-xs text-ink-400">ไม่มีสิทธิ์</span>
                    ) : (
                      user.roles.map((role) => (
                        <Badge key={role} tone={role === 'super_admin' ? 'warn' : 'neutral'}>
                          {ROLES[role as RoleCode]?.nameTh ?? role}
                        </Badge>
                      ))
                    )}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className={cx('text-xs', user.status === 'active' ? 'text-emerald-700' : 'text-amber-700')}>
                    {STATUS_LABEL[user.status] ?? user.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-ink-500">
                  {user.lastLoginAt ? formatThaiDateShort(user.lastLoginAt.slice(0, 10)) : 'ยังไม่เคย'}
                </td>
                <td className="px-3 py-2 text-end">
                  {canManageRoles && (
                    <Button size="sm" variant="secondary" onClick={() => openEditor(user)}>
                      แก้สิทธิ์
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Overlay
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="เชิญผู้ใช้เข้าระบบ"
        description="ระบบจะส่งอีเมลคำเชิญให้ผู้ใช้ตั้งรหัสผ่านเอง (ลิงก์มีอายุ 7 วัน)"
        size="sm"
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setBusy(true);
            setFieldErrors({});
            void apiFetch('/api/admin/users', {
              method: 'POST',
              body: JSON.stringify({
                email: String(form.get('email') ?? ''),
                fullName: String(form.get('fullName') ?? ''),
                department: String(form.get('department') ?? '') || null,
                roleCode: String(form.get('roleCode') ?? 'employee'),
              }),
            })
              .then(() => {
                toast.show('ส่งคำเชิญแล้ว', 'success');
                setInviteOpen(false);
                router.refresh();
              })
              .catch((error) => {
                if (error instanceof ApiClientError) {
                  setFieldErrors(error.fieldErrors());
                  toast.show(error.message, 'error');
                } else toast.show(t('common.unknownError'), 'error');
              })
              .finally(() => setBusy(false));
          }}
          noValidate
        >
          <Field label={t('auth.fullName')} htmlFor="i-name" required error={fieldErrors.fullName}>
            <Input id="i-name" name="fullName" required />
          </Field>
          <Field label={t('auth.email')} htmlFor="i-email" required error={fieldErrors.email}>
            <Input id="i-email" name="email" type="email" required />
          </Field>
          <Field label={t('auth.department')} htmlFor="i-dept" error={fieldErrors.department}>
            <Input id="i-dept" name="department" />
          </Field>
          <Field label="สิทธิ์เริ่มต้น" htmlFor="i-role">
            <Select id="i-role" name="roleCode" defaultValue="employee">
              {enabledRoles.map((role) => (
                <option key={role} value={role}>
                  {ROLES[role].nameTh}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" loading={busy}>
            ส่งคำเชิญ
          </Button>
        </form>
      </Overlay>

      {editing && (
        <Overlay
          open
          onClose={() => setEditing(null)}
          title={`สิทธิ์ของ ${editing.fullName}`}
          size="sm"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button onClick={saveRoles} loading={busy}>
                {t('common.save')}
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-ink-700">เลือกสิทธิ์ (เลือกได้หลายอย่าง)</legend>
              {/*
                แสดงบทบาทที่เปิดใช้งาน บวกกับบทบาทที่คนนี้ถืออยู่แล้วแม้จะถูกปิดไว้
                ถ้าไม่แสดงตัวที่ถืออยู่ การกดบันทึกจะเป็นการถอดสิทธิ์เขาโดยไม่ตั้งใจ
              */}
              {ALL_ROLES.filter((role) => enabledRoles.includes(role) || roles.includes(role)).map((role) => (
                <label key={role} className="flex items-start gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-5 rounded border-ink-300 text-brand-500"
                    checked={roles.includes(role)}
                    onChange={(event) =>
                      setRoles((prev) => (event.target.checked ? [...prev, role] : prev.filter((r) => r !== role)))
                    }
                  />
                  <span>
                    <span className="font-medium text-ink-800">{ROLES[role].nameTh}</span>
                    {!enabledRoles.includes(role) && (
                      <span className="ms-1.5 align-middle">
                        <Badge tone="warn">{t('role.disabledNow')}</Badge>
                      </span>
                    )}
                    <span className="block text-xs text-ink-500">{t(`role.desc.${role}` as 'role.desc.employee')}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <Field label="สถานะบัญชี" htmlFor="u-status">
              <Select id="u-status" value={status} onChange={(event) => setStatus(event.target.value)}>
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Overlay>
      )}
    </>
  );
}
