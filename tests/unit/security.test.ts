import { describe, expect, it } from 'vitest';
import { hashPassword, isStrongEnough, verifyPassword } from '@/lib/auth/password';
import { hashToken, newLinkCode, newToken, safeEqual } from '@/lib/auth/tokens';
import { maskIp } from '@/lib/auth/current-user';
import { redact } from '@/lib/util/logger';
import { sanitize } from '@/lib/audit';
import {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  canManageRoom,
  hasPermission,
  highestRole,
  permissionsOf,
} from '@/lib/rbac/permissions';

describe('รหัสผ่าน', () => {
  it('hash แล้วตรวจกลับได้ และ hash ไม่ซ้ำกันแม้รหัสเดียวกัน', async () => {
    const hash1 = await hashPassword('TnnDemo2569!');
    const hash2 = await hashPassword('TnnDemo2569!');
    expect(hash1).not.toBe(hash2); // salt ต่างกัน
    expect(hash1.startsWith('scrypt$')).toBe(true);
    expect(hash1).not.toContain('TnnDemo2569!');
    await expect(verifyPassword('TnnDemo2569!', hash1)).resolves.toBe(true);
    await expect(verifyPassword('ผิด', hash1)).resolves.toBe(false);
  });

  it('รองรับรหัสผ่านภาษาไทยและปฏิเสธ hash ที่รูปแบบเสีย', async () => {
    const hash = await hashPassword('รหัสผ่านไทย1234');
    await expect(verifyPassword('รหัสผ่านไทย1234', hash)).resolves.toBe(true);
    await expect(verifyPassword('x', 'ไม่ใช่รูปแบบที่ถูกต้อง')).resolves.toBe(false);
  });

  it('ตรวจความแข็งแรงของรหัสผ่านตามนโยบาย', () => {
    expect(isStrongEnough('sh0rt')).toBe(false);
    expect(isStrongEnough('abcdefghijkl')).toBe(false); // ไม่มีตัวเลข
    expect(isStrongEnough('123456789012')).toBe(false); // ไม่มีตัวอักษร
    expect(isStrongEnough('TnnDemo2569!')).toBe(true);
    expect(isStrongEnough('รหัสผ่านยาวพอ1')).toBe(true);
  });
});

describe('โทเค็น', () => {
  it('สร้างโทเค็นสุ่มไม่ซ้ำ และเก็บเป็น hash', () => {
    const a = newToken();
    const b = newToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    const hashed = hashToken(a);
    expect(hashed).toHaveLength(64);
    expect(hashed).not.toBe(a);
    expect(hashToken(a)).toBe(hashed); // deterministic
  });

  it('เทียบค่าแบบ constant time', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('รหัสเชื่อม LINE ยาว 8 ตัว ไม่มีอักษรที่สับสน', () => {
    for (let i = 0; i < 50; i += 1) {
      const code = newLinkCode();
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    }
  });
});

describe('การปกปิดข้อมูลอ่อนไหว', () => {
  it('ปกปิด IP เหลือเฉพาะช่วงเครือข่าย', () => {
    expect(maskIp('203.0.113.45')).toBe('203.0.113.0/24');
    expect(maskIp('2001:db8:1234:5678::1')).toBe('2001:db8:1234::/48');
  });

  it('logger ไม่พิมพ์ค่า secret ออกมา', () => {
    const output = redact({
      email: 'user@example.com',
      password: 'ความลับ',
      token: 'abc123',
      nested: { channel_access_token: 'secret', ok: 1 },
    }) as Record<string, unknown>;
    expect(output.email).toBe('user@example.com');
    expect(output.password).toBe('[REDACTED]');
    expect(output.token).toBe('[REDACTED]');
    expect((output.nested as Record<string, unknown>).channel_access_token).toBe('[REDACTED]');
    expect((output.nested as Record<string, unknown>).ok).toBe(1);
  });

  it('audit log ตัดฟิลด์อ่อนไหวออกก่อนบันทึก', () => {
    const output = sanitize({ title: 'ประชุม', password_hash: 'xxx', link_code: 'ABCD1234' }) as Record<string, unknown>;
    expect(output.title).toBe('ประชุม');
    expect(output.password_hash).toBe('[REDACTED]');
    expect(output.link_code).toBe('[REDACTED]');
  });
});

describe('RBAC', () => {
  it('พนักงานทั่วไปจองได้ แต่ไม่มีสิทธิ์จัดการห้องหรือดู audit log', () => {
    const employee = [{ roleCode: 'employee' as const, scopeType: 'organization' as const, scopeId: null }];
    expect(hasPermission(employee, 'booking:create')).toBe(true);
    expect(hasPermission(employee, 'room:manage')).toBe(false);
    expect(hasPermission(employee, 'audit:read')).toBe(false);
    expect(hasPermission(employee, 'role:manage')).toBe(false);
  });

  it('Viewer ไม่มีสิทธิ์ใด ๆ นอกจากดูตาราง', () => {
    expect(ROLE_PERMISSIONS.viewer).toEqual([]);
    const viewer = [{ roleCode: 'viewer' as const, scopeType: 'organization' as const, scopeId: null }];
    expect(hasPermission(viewer, 'booking:create')).toBe(false);
  });

  it('Super Admin มีทุกสิทธิ์', () => {
    const admin = [{ roleCode: 'super_admin' as const, scopeType: 'organization' as const, scopeId: null }];
    expect(permissionsOf(admin).size).toBe(ALL_PERMISSIONS.length);
  });

  it('รวมสิทธิ์จากหลาย role และเลือก role ที่สูงสุดได้', () => {
    const mixed = [
      { roleCode: 'employee' as const, scopeType: 'organization' as const, scopeId: null },
      { roleCode: 'approver' as const, scopeType: 'organization' as const, scopeId: null },
    ];
    expect(hasPermission(mixed, 'booking:approve')).toBe(true);
    expect(highestRole(mixed)).toBe('approver');
    expect(highestRole([])).toBeNull();
  });

  it('ขอบเขตการจัดการห้องจำกัดตาม scope ที่ได้รับ', () => {
    const room = { id: 'room-1', buildingId: 'building-1' };
    const other = { id: 'room-2', buildingId: 'building-2' };

    const roomScoped = [{ roleCode: 'room_admin' as const, scopeType: 'room' as const, scopeId: 'room-1' }];
    expect(canManageRoom(roomScoped, room)).toBe(true);
    expect(canManageRoom(roomScoped, other)).toBe(false);

    const buildingScoped = [{ roleCode: 'room_admin' as const, scopeType: 'building' as const, scopeId: 'building-1' }];
    expect(canManageRoom(buildingScoped, room)).toBe(true);
    expect(canManageRoom(buildingScoped, other)).toBe(false);

    const orgScoped = [{ roleCode: 'room_admin' as const, scopeType: 'organization' as const, scopeId: null }];
    expect(canManageRoom(orgScoped, other)).toBe(true);

    // พนักงานทั่วไปไม่มีสิทธิ์ room:manage แม้ระบุ scope
    const employeeScoped = [{ roleCode: 'employee' as const, scopeType: 'room' as const, scopeId: 'room-1' }];
    expect(canManageRoom(employeeScoped, room)).toBe(false);
  });
});
