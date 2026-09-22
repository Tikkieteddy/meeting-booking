'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, cx } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/client/api';
import { t } from '@/lib/i18n';
import type { RoleCode } from '@/lib/rbac/permissions';

export type RoleSetting = {
  code: RoleCode;
  nameTh: string;
  nameEn: string;
  rank: number;
  enabled: boolean;
  assignedCount: number;
  canDisable: boolean;
};

/**
 * เปิด/ปิดการใช้งานบทบาท (สำหรับผู้ดูแลระบบสูงสุด)
 *
 * ปุ่มแต่ละแถวมีข้อความที่ตาเห็น ("ซ่อน" / "เปิดใช้งาน") จึงห้ามเขียน aria-label ทับ
 * ชื่อที่ screen reader อ่านต้องเริ่มด้วยข้อความนั้นแล้วต่อด้วยชื่อบทบาทจาก sr-only
 * เพื่อให้ปุ่มแต่ละแถวไม่ชื่อซ้ำกัน และคนที่สั่งงานด้วยเสียงยังเรียกได้ (WCAG 2.5.3)
 */
export function RoleManager({ roles: initial }: { roles: RoleSetting[] }) {
  const router = useRouter();
  const toast = useToast();
  const [roles, setRoles] = useState(initial);
  const [busy, setBusy] = useState<RoleCode | null>(null);

  const toggle = async (role: RoleSetting) => {
    setBusy(role.code);
    try {
      const res = await apiFetch<{ roles: RoleSetting[] }>('/api/admin/roles', {
        method: 'PATCH',
        body: JSON.stringify({ code: role.code, enabled: !role.enabled }),
      });
      setRoles(res.roles);
      toast.show(role.enabled ? t('role.hidden', { name: role.nameTh }) : t('role.shown', { name: role.nameTh }), 'success');
      router.refresh();
    } catch (error) {
      toast.show(error instanceof ApiClientError ? error.message : t('common.unknownError'), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card divide-y divide-ink-100">
      {roles.map((role) => (
        <div key={role.code} className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-48 flex-1">
            <p className="flex items-center gap-2 text-sm font-medium text-ink-900">
              {role.nameTh}
              {role.enabled ? (
                <Badge tone="brand">{t('role.inUse')}</Badge>
              ) : (
                <Badge tone="warn">{t('role.hiddenState')}</Badge>
              )}
            </p>
            <p className="mt-0.5 text-xs text-ink-500">{t(`role.desc.${role.code}` as 'role.desc.employee')}</p>
            <p className="mt-0.5 text-xs text-ink-500">
              {t('role.assignedCount', { count: role.assignedCount })}
            </p>
          </div>

          {role.canDisable ? (
            <Button
              variant={role.enabled ? 'secondary' : 'primary'}
              size="sm"
              loading={busy === role.code}
              onClick={() => void toggle(role)}
              className={cx('shrink-0')}
            >
              {role.enabled ? t('role.hideAction') : t('role.showAction')}
              <span className="sr-only"> {role.nameTh}</span>
            </Button>
          ) : (
            <p className="max-w-56 shrink-0 text-xs text-ink-500">{t('role.coreRoleNote')}</p>
          )}
        </div>
      ))}
      <p className="p-4 text-xs text-ink-500">{t('role.footnote')}</p>
    </div>
  );
}
