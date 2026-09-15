import { t } from '@/lib/i18n';
import {
  DEFAULT_TZ,
  hhmmToMinutes,
  partsInZone,
  toDateISO,
  formatDuration,
  minutesToHhmm,
} from '@/lib/util/time';

/**
 * กฎธุรกิจการจอง (บรีฟข้อ 6)
 * ฟังก์ชันในไฟล์นี้เป็น pure function ทั้งหมด ไม่แตะฐานข้อมูล
 * จึงทดสอบได้ตรง ๆ และถูกเรียกซ้ำอีกครั้งฝั่ง server ก่อนบันทึกเสมอ
 */

export type RoomPolicy = {
  id: string;
  name: string;
  capacity: number;
  openTime: string; // 'HH:mm'
  closeTime: string; // 'HH:mm'
  openDays: number[]; // 0 = อาทิตย์
  slotStepMinutes: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  bookingHorizonDays: number;
  cancelWindowMinutes: number;
  requiresApproval: boolean;
  checkInRequired: boolean;
  checkInGraceMinutes: number;
  waitlistEnabled: boolean;
  isActive: boolean;
};

export type RuleViolation = {
  code: string;
  field: 'startsAt' | 'endsAt' | 'attendeeCount' | 'room' | 'general';
  message: string;
};

export type ValidateInput = {
  policy: RoomPolicy;
  startsAt: Date;
  endsAt: Date;
  now?: Date;
  timezone?: string;
  attendeeCount?: number;
  /** ผู้ดูแลระบบข้ามข้อจำกัดบางข้อได้ แต่ต้องระบุเหตุผลและถูกบันทึกลง audit log */
  override?: { pastTime?: boolean; capacity?: boolean; openHours?: boolean; reason?: string };
  /** วันหยุดที่ปิดการจอง (รูปแบบ 'YYYY-MM-DD') */
  blockedDates?: readonly string[];
};

export function validateBookingRequest(input: ValidateInput): RuleViolation[] {
  const {
    policy,
    startsAt,
    endsAt,
    now = new Date(),
    timezone = DEFAULT_TZ,
    attendeeCount = 1,
    override = {},
    blockedDates = [],
  } = input;
  const errors: RuleViolation[] = [];

  if (!policy.isActive) {
    errors.push({ code: 'room_inactive', field: 'room', message: t('error.roomInactive') });
  }

  if (endsAt.getTime() <= startsAt.getTime()) {
    errors.push({ code: 'start_after_end', field: 'endsAt', message: t('error.startAfterEnd') });
    return errors; // ตรวจข้ออื่นต่อไม่ได้ถ้าช่วงเวลาไม่สมเหตุสมผล
  }

  const durationMinutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60000);

  if (!override.pastTime && startsAt.getTime() < now.getTime()) {
    errors.push({ code: 'in_the_past', field: 'startsAt', message: t('error.inThePast') });
  }

  const horizonMs = policy.bookingHorizonDays * 24 * 3600_000;
  if (startsAt.getTime() - now.getTime() > horizonMs) {
    errors.push({
      code: 'too_far_ahead',
      field: 'startsAt',
      message: t('error.tooFarAhead', { days: policy.bookingHorizonDays }),
    });
  }

  if (durationMinutes < policy.minDurationMinutes) {
    errors.push({
      code: 'duration_too_short',
      field: 'endsAt',
      message: t('error.durationTooShort', { minutes: policy.minDurationMinutes }),
    });
  }
  if (durationMinutes > policy.maxDurationMinutes) {
    errors.push({
      code: 'duration_too_long',
      field: 'endsAt',
      message: t('error.durationTooLong', { minutes: policy.maxDurationMinutes }),
    });
  }

  const startParts = partsInZone(startsAt, timezone);
  const endParts = partsInZone(endsAt, timezone);
  const startMinutes = startParts.hour * 60 + startParts.minute;
  const endMinutes = endParts.hour * 60 + endParts.minute;

  if (startMinutes % policy.slotStepMinutes !== 0 || endMinutes % policy.slotStepMinutes !== 0) {
    errors.push({
      code: 'not_aligned_to_step',
      field: 'startsAt',
      message: t('error.notAlignedToStep', { step: policy.slotStepMinutes }),
    });
  }

  if (!override.openHours) {
    const openMinutes = hhmmToMinutes(policy.openTime);
    const closeMinutes = hhmmToMinutes(policy.closeTime);
    const startDate = toDateISO(startsAt, timezone);
    const endDate = toDateISO(endsAt, timezone);
    // เวลาสิ้นสุดที่ตรงเที่ยงคืนพอดีถือว่าปิดท้ายของวันเดิม
    const crossesDay = startDate !== endDate && !(endMinutes === 0 && endParts.hour === 0);
    const effectiveEndMinutes = crossesDay ? 24 * 60 + endMinutes : endMinutes === 0 ? 24 * 60 : endMinutes;

    if (crossesDay || startMinutes < openMinutes || effectiveEndMinutes > closeMinutes) {
      errors.push({
        code: 'outside_open_hours',
        field: 'startsAt',
        message: t('error.outsideOpenHours', {
          open: minutesToHhmm(openMinutes),
          close: minutesToHhmm(closeMinutes),
        }),
      });
    }

    if (!policy.openDays.includes(startParts.weekday)) {
      errors.push({ code: 'closed_day', field: 'startsAt', message: t('calendar.closedDay') });
    }

    if (blockedDates.includes(startDate)) {
      errors.push({
        code: 'holiday',
        field: 'startsAt',
        message: t('error.roomClosed', { reason: t('calendar.holiday') }),
      });
    }
  }

  if (!override.capacity && attendeeCount > policy.capacity) {
    errors.push({
      code: 'over_capacity',
      field: 'attendeeCount',
      message: t('error.overCapacity', { capacity: policy.capacity }),
    });
  }

  return errors;
}

/** ช่วงเวลาที่ห้องถูก "กันไว้" จริง = เวลาประชุม + buffer หน้า/หลัง */
export function blockedRange(policy: Pick<RoomPolicy, 'bufferBeforeMinutes' | 'bufferAfterMinutes'>, startsAt: Date, endsAt: Date) {
  return {
    start: new Date(startsAt.getTime() - policy.bufferBeforeMinutes * 60_000),
    end: new Date(endsAt.getTime() + policy.bufferAfterMinutes * 60_000),
  };
}

/** ยกเลิกได้หรือยัง ตามนโยบายระยะเวลายกเลิกของห้อง */
export function canCancel(policy: RoomPolicy, startsAt: Date, now = new Date()): RuleViolation | null {
  if (policy.cancelWindowMinutes <= 0) return null;
  const deadline = startsAt.getTime() - policy.cancelWindowMinutes * 60_000;
  if (now.getTime() > deadline) {
    return {
      code: 'cancel_too_late',
      field: 'general',
      message: t('error.cancelTooLate', { minutes: policy.cancelWindowMinutes }),
    };
  }
  return null;
}

/** ช่วงเวลาที่เช็กอินได้: ตั้งแต่ 15 นาทีก่อนเริ่ม จนถึงหมดเวลาผ่อนผัน */
export function checkInWindow(policy: RoomPolicy, startsAt: Date) {
  return {
    from: new Date(startsAt.getTime() - 15 * 60_000),
    to: new Date(startsAt.getTime() + policy.checkInGraceMinutes * 60_000),
  };
}

export function isWithinCheckInWindow(policy: RoomPolicy, startsAt: Date, now = new Date()): boolean {
  const w = checkInWindow(policy, startsAt);
  return now.getTime() >= w.from.getTime() && now.getTime() <= w.to.getTime();
}

/** สร้างรายการช่วงเวลาที่เลือกได้ในหนึ่งวันตาม step ของห้อง */
export function timeSlots(policy: RoomPolicy): string[] {
  const open = hhmmToMinutes(policy.openTime);
  const close = hhmmToMinutes(policy.closeTime);
  const out: string[] = [];
  for (let m = open; m <= close - policy.slotStepMinutes; m += policy.slotStepMinutes) {
    out.push(minutesToHhmm(m));
  }
  return out;
}

/** ข้อความสรุประยะเวลา ใช้ในฟอร์มและอีเมล */
export function durationLabel(startsAt: Date, endsAt: Date): string {
  return formatDuration(Math.round((endsAt.getTime() - startsAt.getTime()) / 60000));
}

export type OccupancyLevel = 'free' | 'partial' | 'almost' | 'full';

/**
 * ระดับความหนาแน่นของวัน ใช้แสดงจุดสี 4 ระดับใน Month View (บรีฟข้อ 3.3)
 * คิดจากสัดส่วนนาทีที่ถูกจองเทียบกับนาทีเปิดทำการทั้งหมด
 */
export function occupancyLevel(bookedMinutes: number, availableMinutes: number): OccupancyLevel {
  if (availableMinutes <= 0 || bookedMinutes <= 0) return 'free';
  const ratio = bookedMinutes / availableMinutes;
  if (ratio >= 0.95) return 'full';
  if (ratio >= 0.7) return 'almost';
  return 'partial';
}

export const OCCUPANCY_META: Record<OccupancyLevel, { labelKey: Parameters<typeof t>[0]; color: string; symbol: string }> = {
  // ใช้ทั้งสี ข้อความ และสัญลักษณ์ ห้ามสื่อด้วยสีอย่างเดียว (บรีฟข้อ 12)
  free: { labelKey: 'calendar.occupancyFree', color: 'var(--color-status-free)', symbol: '○' },
  partial: { labelKey: 'calendar.occupancyPartial', color: 'var(--color-status-partial)', symbol: '◔' },
  almost: { labelKey: 'calendar.occupancyAlmost', color: 'var(--color-status-almost)', symbol: '◕' },
  full: { labelKey: 'calendar.occupancyFull', color: 'var(--color-status-full)', symbol: '●' },
};
