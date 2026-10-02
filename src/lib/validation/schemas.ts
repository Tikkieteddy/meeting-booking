import { z } from 'zod';
import { MAX_REMINDERS, MAX_REMINDER_MINUTES, normalizeReminderLeads } from '@/lib/domain/reminders';
import { joinFullName } from '@/lib/domain/person-name';

/**
 * Schema validation ที่ใช้ร่วมกันทั้งฝั่ง API และฟอร์ม (บรีฟข้อ 15)
 * ข้อความ error เป็นภาษาไทยทั้งหมด
 */

const emailSchema = z
  .string({ required_error: 'กรุณากรอกอีเมล' })
  .trim()
  .min(1, 'กรุณากรอกอีเมล')
  .email('รูปแบบอีเมลไม่ถูกต้อง')
  .max(254, 'อีเมลยาวเกินไป');

const passwordSchema = z
  .string({ required_error: 'กรุณากรอกรหัสผ่าน' })
  .min(10, 'รหัสผ่านต้องยาวอย่างน้อย 10 ตัวอักษร')
  .max(200, 'รหัสผ่านยาวเกินไป');

// ป้องกันข้อความที่มีแท็ก HTML หลุดเข้าฟิลด์ข้อความ (ชั้นเสริมจาก React ที่ escape ให้อยู่แล้ว)
const safeText = (max: number, label: string, min = 0, minMessage?: string) =>
  z
    .string()
    .trim()
    .min(min, minMessage ?? `กรุณากรอก${label}`)
    .max(max, `${label}ยาวเกิน ${max} ตัวอักษร`)
    .refine((v) => !/<\s*\/?\s*(script|iframe|object|embed|style)\b/i.test(v), `${label}มีอักขระที่ไม่อนุญาต`);

/**
 * ชื่อ/นามสกุลแยกช่อง (ผู้ใช้ขอ 2 ต.ค. 2569) — ชื่อต้นห้ามเว้นวรรค เพื่อให้แยกกลับจาก full_name ได้แน่นอน
 * (ชื่อกลางให้ใส่ช่องนามสกุล) ดู src/lib/domain/person-name.ts
 */
const nameFields = {
  firstName: safeText(60, 'ชื่อ', 1, 'กรุณากรอกชื่อ').refine((v) => !/\s/.test(v), 'ชื่อห้ามมีเว้นวรรค (ชื่อกลางให้ใส่ในช่องนามสกุล)'),
  lastName: safeText(60, 'นามสกุล', 1, 'กรุณากรอกนามสกุล'),
};
const withFullName = <T extends { firstName: string; lastName: string }>(v: T) => ({
  ...v,
  fullName: joinFullName(v.firstName, v.lastName),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
  // ติ๊ก "จำการเข้าสู่ระบบไว้" = ขอเซสชันอายุยาว (ค่าเริ่มต้นคือไม่ติ๊ก)
  remember: z.boolean().optional().default(false),
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  ...nameFields,
  department: safeText(120, 'แผนก').optional().nullable(),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9+\-\s()]*$/, 'เบอร์โทรศัพท์ควรมีเฉพาะตัวเลขและเครื่องหมาย + - ( )')
    .optional()
    .nullable(),
})
  .transform(withFullName);

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(10, 'ลิงก์ไม่ถูกต้อง'),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'กรุณากรอกรหัสผ่านปัจจุบัน'),
  newPassword: passwordSchema,
});

const timeHHmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'รูปแบบเวลาต้องเป็น HH:mm เช่น 13:30');
const dateISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD');

/** เวลาเตือนก่อนประชุม — ตัดค่าซ้ำและเรียงให้ ขอบเขตตรงกับ CHECK ในฐานข้อมูล */
const reminderLeadsSchema = z
  .array(z.coerce.number().int().min(0).max(MAX_REMINDER_MINUTES, 'เตือนล่วงหน้าได้ไม่เกิน 1 สัปดาห์'))
  .refine((leads) => new Set(leads).size <= MAX_REMINDERS, `ตั้งเตือนได้ไม่เกิน ${MAX_REMINDERS} ครั้ง`)
  .transform((leads) => normalizeReminderLeads(leads));

export const recurrenceSchema = z
  .object({
    frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
    intervalCount: z.coerce.number().int().min(1, 'ต้องซ้ำอย่างน้อยทุก 1 ครั้ง').max(12, 'ซ้ำห่างได้ไม่เกิน 12').default(1),
    byWeekdays: z.array(z.coerce.number().int().min(0).max(6)).optional().nullable(),
    // รายเดือนแบบ "วันพุธที่ 2" (1–5) หรือ "วันพุธสุดท้าย" (-1)
    monthWeek: z.coerce.number().int().refine((n) => n === -1 || (n >= 1 && n <= 5)).optional().nullable(),
    untilDate: dateISO.optional().nullable(),
    occurrenceCount: z.coerce.number().int().min(1).max(104, 'จองซ้ำได้ไม่เกิน 104 ครั้ง').optional().nullable(),
  })
  .refine((r) => !r.monthWeek || r.frequency === 'monthly', { message: 'เลือกสัปดาห์ของเดือนได้เฉพาะการซ้ำรายเดือน', path: ['monthWeek'] })
  .refine((r) => r.frequency !== 'weekly' || r.byWeekdays === undefined || r.byWeekdays === null || r.byWeekdays.length > 0, {
    message: 'เลือกวันในสัปดาห์อย่างน้อย 1 วัน',
    path: ['byWeekdays'],
  })
  .refine((r) => Boolean(r.untilDate || r.occurrenceCount), { message: 'ต้องระบุวันสิ้นสุดหรือจำนวนครั้ง', path: ['untilDate'] });

export const createBookingSchema = z.object({
  roomId: z.string().uuid('กรุณาเลือกห้องประชุม'),
  title: safeText(200, 'หัวข้อประชุม', 1, 'กรุณากรอกหัวข้อประชุม'),
  purpose: safeText(500, 'วัตถุประสงค์').optional().nullable(),
  notes: safeText(2000, 'หมายเหตุ').optional().nullable(),
  dateISO,
  startTime: timeHHmm,
  endTime: timeHHmm,
  attendeeCount: z.coerce.number().int().min(1, 'จำนวนผู้เข้าร่วมต้องอย่างน้อย 1 คน').max(1000),
  attendees: z
    .array(
      z.object({
        email: emailSchema,
        displayName: z.string().trim().max(120).optional().nullable(),
        // คนในที่เลือกจากรายชื่อ — ระบบยังตรวจสอบซ้ำจากอีเมลอยู่ดี ค่านี้แค่ช่วยให้จับคู่แน่นอนขึ้น
        profileId: z.string().uuid().optional().nullable(),
      }),
    )
    .max(200, 'ผู้เข้าร่วมมากเกินไป')
    .optional(),
  resources: z
    .array(z.object({ amenityCode: z.string().max(40), quantity: z.coerce.number().int().min(1).max(50).optional(), note: z.string().max(200).optional().nullable() }))
    .optional(),
  privacy: z.enum(['public', 'busy_only', 'private']).optional(),
  recurrence: recurrenceSchema.optional().nullable(),
  idempotencyKey: z.string().max(120).optional().nullable(),
  overrideReason: safeText(300, 'เหตุผล').optional().nullable(),
  // เวลาเตือนก่อนประชุมของผู้จองสำหรับการจองนี้ (นาที, 0 = ตอนเริ่ม) — ไม่ส่งมา = ใช้ค่าตั้งส่วนตัว
  reminderLeads: reminderLeadsSchema.optional().nullable(),
  // ป้ายความสำคัญและหมวด (migration 012)
  priority: z.enum(['normal', 'urgent', 'vip', 'internal']).optional(),
  category: safeText(40, 'หมวด').optional().nullable(),
});

export const updateBookingSchema = createBookingSchema
  .partial()
  .omit({ recurrence: true, idempotencyKey: true, overrideReason: true })
  .extend({
    expectedVersion: z.coerce.number().int().min(1),
    // series = แก้ทุกครั้งที่ยังไม่ถึงในชุดเกิดซ้ำ (ADR-018)
    scope: z.enum(['this', 'series']).default('this'),
  });

export const cancelBookingSchema = z.object({
  // บังคับใส่เหตุผลการยกเลิก (ผู้ใช้ขอ 2 ต.ค. 2569)
  reason: z.preprocess((v) => v ?? '', safeText(300, 'เหตุผลการยกเลิก', 1, 'กรุณาระบุเหตุผลการยกเลิก')),
  scope: z.enum(['this', 'series']).default('this'),
});

export const approvalDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'info_requested']),
  comment: safeText(500, 'ความเห็น').optional().nullable(),
});

export const calendarQuerySchema = z.object({
  view: z.enum(['day', 'week', 'month']).default('day'),
  date: dateISO,
  roomId: z.string().uuid().optional().nullable(),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().max(200).default(''),
  mode: z.enum(['rooms', 'bookings', 'slots', 'auto']).default('auto'),
  date: dateISO.optional().nullable(),
  startTime: timeHHmm.optional().nullable(),
  endTime: timeHHmm.optional().nullable(),
  capacity: z.coerce.number().int().min(1).max(1000).optional().nullable(),
  buildingId: z.string().uuid().optional().nullable(),
  floor: z.string().max(20).optional().nullable(),
  amenities: z.array(z.string().max(40)).optional(),
});

/** ตำแหน่งบนแผนที่ — ใช้ร่วมกันทั้งห้องและอาคาร (ลิงก์ต้อง https เท่านั้น พิกัดต้องมาเป็นคู่) */
const mapLocationFields = {
  mapUrl: z
    .string()
    .trim()
    .max(2000, 'ลิงก์แผนที่ยาวเกินไป')
    .refine((v) => v === '' || /^https:\/\//i.test(v), 'ลิงก์แผนที่ต้องขึ้นต้นด้วย https://')
    .transform((v) => (v === '' ? null : v))
    .optional()
    .nullable(),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
};
const latLngPaired = (v: { latitude?: number | null; longitude?: number | null }) =>
  (v.latitude == null) === (v.longitude == null);
const LATLNG_PAIR_MESSAGE = { message: 'พิกัดต้องมีทั้งละติจูดและลองจิจูด', path: ['latitude'] };

/** อาคาร — ผู้ดูแลห้องเพิ่ม/แก้ได้จากหน้าจัดการห้อง */
export const buildingSchema = z.object({
  name: safeText(120, 'ชื่ออาคาร', 1, 'กรุณากรอกชื่ออาคาร'),
  code: z
    .string()
    .trim()
    .min(1, 'กรุณากรอกรหัสอาคาร')
    .max(40)
    .regex(/^[A-Za-z0-9._-]+$/, 'รหัสอาคารใช้ได้เฉพาะ A-Z 0-9 . _ -'),
  address: safeText(300, 'ที่อยู่').optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(100),
  isActive: z.coerce.boolean().default(true),
  ...mapLocationFields,
}).refine(latLngPaired, LATLNG_PAIR_MESSAGE);

export const roomSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'กรุณากรอกรหัสห้อง')
    .max(40)
    .regex(/^[A-Za-z0-9._-]+$/, 'รหัสห้องใช้ได้เฉพาะ A-Z 0-9 . _ -'),
  name: safeText(120, 'ชื่อห้อง', 1, 'กรุณากรอกชื่อห้อง'),
  description: safeText(500, 'คำอธิบาย').optional().nullable(),
  floor: z.string().trim().max(20).optional().nullable(),
  locationHint: safeText(200, 'ตำแหน่ง').optional().nullable(),
  capacity: z.coerce.number().int().min(1, 'ความจุต้องมากกว่า 0').max(1000),
  roomType: z.enum(['meeting', 'board', 'training', 'studio', 'huddle']).default('meeting'),
  buildingId: z.string().uuid().optional().nullable(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'สีต้องเป็นรหัส HEX เช่น #EC5F27').default('#EC5F27'),
  photos: z.array(z.string().url()).max(10).optional(),
  amenityCodes: z.array(z.string().max(40)).optional(),
  approverProfileIds: z.array(z.string().uuid()).optional(),
  openTime: timeHHmm.default('08:00'),
  closeTime: timeHHmm.default('20:00'),
  openDays: z.array(z.coerce.number().int().min(0).max(6)).min(1, 'ต้องเลือกวันทำการอย่างน้อย 1 วัน'),
  slotStepMinutes: z.coerce.number().int().refine((v) => [5, 10, 15, 20, 30, 60].includes(v), 'ช่วงเวลาต้องเป็น 5, 10, 15, 20, 30 หรือ 60 นาที'),
  minDurationMinutes: z.coerce.number().int().min(5).max(1440),
  maxDurationMinutes: z.coerce.number().int().min(5).max(1440),
  bufferBeforeMinutes: z.coerce.number().int().min(0).max(240),
  bufferAfterMinutes: z.coerce.number().int().min(0).max(240),
  bookingHorizonDays: z.coerce.number().int().min(1).max(730),
  cancelWindowMinutes: z.coerce.number().int().min(0).max(10080),
  requiresApproval: z.coerce.boolean().default(false),
  checkInRequired: z.coerce.boolean().default(false),
  checkInGraceMinutes: z.coerce.number().int().min(0).max(240).default(15),
  waitlistEnabled: z.coerce.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
  isActive: z.coerce.boolean().default(true),
  ...mapLocationFields,
}).refine(latLngPaired, LATLNG_PAIR_MESSAGE);

export const closureSchema = z.object({
  roomId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  reason: safeText(200, 'เหตุผล', 1, 'กรุณาระบุเหตุผล'),
});

export const notificationPreferenceSchema = z.object({
  emailEnabled: z.coerce.boolean(),
  lineEnabled: z.coerce.boolean(),
  inAppEnabled: z.coerce.boolean(),
  reminderLeads: reminderLeadsSchema,
});

/**
 * แก้โปรไฟล์ตัวเอง — แก้ชื่อได้ทุกคน แต่ "แผนก" ให้ผู้ดูแลระบบแก้เท่านั้น (ผู้ใช้ขอ 2 ต.ค. 2569)
 * และไม่มีช่องอีเมลโดยเจตนา (อีเมลห้ามแก้เด็ดขาด — ฐานข้อมูลก็กันซ้ำ ดู migration 013)
 */
export const profileSchema = z
  .object({
    ...nameFields,
    phone: z.string().trim().max(30).optional().nullable(),
    jobTitle: safeText(120, 'ตำแหน่ง').optional().nullable(),
    locale: z.enum(['th', 'en']).default('th'),
    timezone: z.string().max(64).default('Asia/Bangkok'),
  })
  .transform(withFullName);

export const inviteUserSchema = z
  .object({
    email: emailSchema,
    ...nameFields,
    department: safeText(120, 'แผนก').optional().nullable(),
    roleCode: z.enum(['super_admin', 'room_admin', 'approver', 'employee', 'viewer']),
  })
  .transform(withFullName);

/** เปิด/ปิดการใช้งานบทบาท (หน้าผู้ดูแลระบบ) */
export const roleToggleSchema = z.object({
  code: z.enum(['super_admin', 'room_admin', 'approver', 'employee', 'viewer']),
  enabled: z.boolean(),
});

export const waitlistSchema = z.object({
  roomId: z.string().uuid(),
  dateISO,
  startTime: timeHHmm,
  endTime: timeHHmm,
  title: safeText(200, 'หัวข้อประชุม', 1, 'กรุณากรอกหัวข้อประชุม'),
  attendeeCount: z.coerce.number().int().min(1).max(1000).default(1),
});
