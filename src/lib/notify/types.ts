/** ชนิดเหตุการณ์แจ้งเตือนทั้งหมดของระบบ (บรีฟข้อ 10) */
export const NOTIFICATION_EVENTS = {
  'auth.verify_email': 'ยืนยันอีเมล',
  'auth.password_reset': 'ตั้งรหัสผ่านใหม่',
  'auth.invite': 'คำเชิญเข้าใช้งานระบบ',
  'booking.created': 'สร้างการจอง',
  'booking.confirmed': 'ยืนยันการจอง',
  'booking.pending_approval': 'รออนุมัติ',
  'booking.approved': 'อนุมัติการจอง',
  'booking.rejected': 'ปฏิเสธการจอง',
  'booking.updated': 'แก้ไขการจอง',
  'booking.cancelled': 'ยกเลิกการจอง',
  'booking.reminder': 'เตือนก่อนประชุม',
  'booking.no_show': 'ปล่อยห้องเพราะไม่เช็กอิน',
  'room.closed': 'ห้องปิดฉุกเฉิน',
  'waitlist.offer': 'มีห้องว่างสำหรับคิวรอ',
} as const;

export type NotificationEvent = keyof typeof NOTIFICATION_EVENTS;
export type NotificationChannel = 'email' | 'line' | 'in_app';

export type NotificationPayload = {
  /** หัวข้อที่ใช้กับอีเมล/LINE/in-app */
  subject: string;
  /** เนื้อหาแบบข้อความล้วน */
  text: string;
  /** ลิงก์ที่เกี่ยวข้อง (relative หรือ absolute) */
  link?: string;
  /** ข้อมูลประกอบสำหรับ template เช่น ชื่อห้อง เวลา */
  data?: Record<string, string | number | null>;
  /** แนบไฟล์ปฏิทิน .ics กับอีเมลหรือไม่ */
  attachIcs?: boolean;
};

export type SendResult =
  | { ok: true; providerMessageId?: string; provider: string }
  | { ok: false; error: string; provider: string; retryable: boolean };
