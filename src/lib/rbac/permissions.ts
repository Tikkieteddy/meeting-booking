/**
 * RBAC — โครงสร้างสิทธิ์แบบ resource + action (บรีฟข้อ 8)
 * ค่าในไฟล์นี้เป็นแหล่งความจริงเดียว ใช้ทั้งใน seed, API guard และหน้าเว็บ
 * รองรับ custom role ในอนาคตโดยเพิ่มแถวในตาราง roles/role_permissions ได้เลย
 */

export const PERMISSIONS = {
  'booking:create': { resource: 'booking', action: 'create', description: 'สร้างการจองของตนเอง' },
  'booking:read_all': { resource: 'booking', action: 'read_all', description: 'ดูรายละเอียดการจองของผู้อื่น' },
  'booking:manage_all': { resource: 'booking', action: 'manage_all', description: 'แก้ไขหรือยกเลิกการจองของผู้อื่น' },
  'booking:approve': { resource: 'booking', action: 'approve', description: 'อนุมัติหรือปฏิเสธคำขอจอง' },
  'booking:check_in_any': { resource: 'booking', action: 'check_in_any', description: 'เช็กอินแทนผู้จองได้' },
  'room:manage': { resource: 'room', action: 'manage', description: 'เพิ่ม แก้ไข ปิด และเก็บห้องเข้าคลัง' },
  'user:read': { resource: 'user', action: 'read', description: 'ดูรายชื่อผู้ใช้ในองค์กร' },
  'user:manage': { resource: 'user', action: 'manage', description: 'เชิญ แก้ไข ระงับผู้ใช้' },
  'role:manage': { resource: 'role', action: 'manage', description: 'กำหนด Role และสิทธิ์' },
  'report:read': { resource: 'report', action: 'read', description: 'ดูรายงานและ Export CSV' },
  'audit:read': { resource: 'audit', action: 'read', description: 'ดูบันทึกการใช้งาน (Audit Log)' },
  'settings:manage': { resource: 'settings', action: 'manage', description: 'ตั้งค่าระดับองค์กรและระบบ' },
  'system:manage': { resource: 'system', action: 'manage', description: 'ดูสถานะระบบ คิวงาน และสั่งส่งซ้ำ' },
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionCode[];

export const ROLES = {
  super_admin: { rank: 100, nameTh: 'ผู้ดูแลระบบสูงสุด', nameEn: 'Super Admin' },
  room_admin: { rank: 80, nameTh: 'ผู้ดูแลห้อง', nameEn: 'Room Admin' },
  approver: { rank: 60, nameTh: 'ผู้อนุมัติ', nameEn: 'Approver' },
  employee: { rank: 40, nameTh: 'พนักงาน', nameEn: 'Employee' },
  viewer: { rank: 20, nameTh: 'ผู้ชม / ประชาสัมพันธ์', nameEn: 'Viewer' },
} as const;

export type RoleCode = keyof typeof ROLES;
export const ALL_ROLES = Object.keys(ROLES) as RoleCode[];

export const ROLE_PERMISSIONS: Record<RoleCode, PermissionCode[]> = {
  super_admin: [...ALL_PERMISSIONS],
  room_admin: [
    'booking:create',
    'booking:read_all',
    'booking:manage_all',
    'booking:approve',
    'booking:check_in_any',
    'room:manage',
    'user:read',
    'report:read',
  ],
  approver: ['booking:create', 'booking:read_all', 'booking:approve', 'user:read'],
  employee: ['booking:create'],
  // Viewer/ประชาสัมพันธ์: ดูตารางและสถานะว่าไม่ว่างเท่านั้น จองไม่ได้ แก้ไม่ได้
  viewer: [],
};

export type ScopeType = 'organization' | 'building' | 'room' | 'department';

export type RoleAssignment = {
  roleCode: RoleCode;
  scopeType: ScopeType;
  scopeId: string | null;
};

/** สิทธิ์ทั้งหมดที่ผู้ใช้มี จากรายการ role ที่ได้รับ */
export function permissionsOf(assignments: readonly RoleAssignment[]): Set<PermissionCode> {
  const out = new Set<PermissionCode>();
  for (const a of assignments) {
    for (const p of ROLE_PERMISSIONS[a.roleCode] ?? []) out.add(p);
  }
  return out;
}

export function hasPermission(assignments: readonly RoleAssignment[], code: PermissionCode): boolean {
  return permissionsOf(assignments).has(code);
}

/** role ที่มีลำดับสูงสุด ใช้แสดงป้ายตำแหน่งในหน้าโปรไฟล์ */
export function highestRole(assignments: readonly RoleAssignment[]): RoleCode | null {
  let best: RoleCode | null = null;
  for (const a of assignments) {
    if (!best || ROLES[a.roleCode].rank > ROLES[best].rank) best = a.roleCode;
  }
  return best;
}

/** ตรวจสิทธิ์จัดการห้องตามขอบเขต (organization / building / room) */
export function canManageRoom(
  assignments: readonly RoleAssignment[],
  room: { id: string; buildingId: string | null },
): boolean {
  return assignments.some((a) => {
    if (!ROLE_PERMISSIONS[a.roleCode]?.includes('room:manage')) return false;
    if (a.scopeType === 'organization') return true;
    if (a.scopeType === 'room') return a.scopeId === room.id;
    if (a.scopeType === 'building') return a.scopeId === room.buildingId;
    return false;
  });
}
