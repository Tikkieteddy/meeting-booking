import { z } from 'zod';

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

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
  // ติ๊ก "จำการเข้าสู่ระบบไว้" = ขอเซสชันอายุยาว (ค่าเริ่มต้นคือไม่ติ๊ก)
  remember: z.boolean().optional().default(false),
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: safeText(120, 'ชื่อ-นามสกุล', 2, 'กรุณากรอกชื่อ-นามสกุล'),
  department: safeText(120, 'แผนก').optional().nullable(),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9+\-\s()]*$/, 'เบอร์โทรศัพท์ควรมีเฉพาะตัวเลขและเครื่องหมาย + - ( )')
    .optional()
    .nullable(),
});

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

export const recurrenceSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  intervalCount: z.coerce.number().int().min(1).max(12).default(1),
  byWeekdays: z.array(z.coerce.number().int().min(0).max(6)).optional().nullable(),
  untilDate: dateISO.optional().nullable(),
  occurrenceCount: z.coerce.number().int().min(1).max(104).optional().nullable(),
});

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
    .array(z.object({ email: emailSchema, displayName: z.string().trim().max(120).optional().nullable() }))
    .max(200, 'ผู้เข้าร่วมมากเกินไป')
    .optional(),
  resources: z
    .array(z.object({ amenityCode: z.string().max(40), quantity: z.coerce.number().int().min(1).max(50).optional(), note: z.string().max(200).optional().nullable() }))
    .optional(),
  privacy: z.enum(['public', 'busy_only', 'private']).optional(),
  recurrence: recurrenceSchema.optional().nullable(),
  idempotencyKey: z.string().max(120).optional().nullable(),
  overrideReason: safeText(300, 'เหตุผล').optional().nullable(),
});

export const updateBookingSchema = createBookingSchema
  .partial()
  .omit({ roomId: true, recurrence: true, idempotencyKey: true })
  .extend({ expectedVersion: z.coerce.number().int().min(1) });

export const cancelBookingSchema = z.object({
  reason: safeText(300, 'เหตุผล').optional().nullable(),
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
});

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
  reminderLeads: z.array(z.coerce.number().int().min(0).max(10080)).max(5),
});

export const profileSchema = z.object({
  fullName: safeText(120, 'ชื่อ-นามสกุล', 2, 'กรุณากรอกชื่อ-นามสกุล'),
  phone: z.string().trim().max(30).optional().nullable(),
  department: safeText(120, 'แผนก').optional().nullable(),
  jobTitle: safeText(120, 'ตำแหน่ง').optional().nullable(),
  locale: z.enum(['th', 'en']).default('th'),
  timezone: z.string().max(64).default('Asia/Bangkok'),
});

export const inviteUserSchema = z.object({
  email: emailSchema,
  fullName: safeText(120, 'ชื่อ-นามสกุล', 2, 'กรุณากรอกชื่อ-นามสกุล'),
  department: safeText(120, 'แผนก').optional().nullable(),
  roleCode: z.enum(['super_admin', 'room_admin', 'approver', 'employee', 'viewer']),
});

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
