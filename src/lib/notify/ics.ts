/**
 * สร้างไฟล์ปฏิทิน .ics (RFC 5545)
 *  - buildIcs: นัดเดียว แนบไปกับอีเมลและให้ดาวน์โหลดได้ (บรีฟข้อ 10)
 *  - buildIcsFeed: หลายนัดในไฟล์เดียว สำหรับลิงก์ปฏิทินส่วนตัวที่เพิ่มใน Outlook/Teams (ADR-020)
 * ใช้เวลา UTC ทั้งหมด จึงถูกต้องในทุกโซนเวลาของผู้รับ
 */
export type IcsEvent = {
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: Date;
  endsAt: Date;
  organizerEmail?: string | null;
  organizerName?: string | null;
  attendeeEmails?: string[];
  status?: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
  sequence?: number;
  url?: string | null;
  /** พิกัดห้อง — แอปปฏิทินจะแสดงปุ่มนำทางให้เอง (RFC 5545 GEO) */
  geo?: { latitude: number; longitude: number } | null;
};

function toIcsDate(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/** escape ตามสเปก: ต้องหนี backslash, semicolon, comma และขึ้นบรรทัดใหม่ */
export function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/**
 * พับบรรทัดที่ยาวเกิน 75 octet ตามสเปก — นับเป็นไบต์ UTF-8 ไม่ใช่จำนวนตัวอักษร
 * (ตัวอักษรไทย 1 ตัว = 3 ไบต์ เดิมนับเป็นตัวอักษร บรรทัดภาษาไทยจึงยาวเกินสเปกได้ 3 เท่า)
 * และไม่ตัดกลางตัวอักษร เพราะจะทำให้ข้อความเพี้ยน
 */
export function fold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let currentBytes = 0;
  let limit = 75; // บรรทัดต่อ ๆ ไปขึ้นต้นด้วยช่องว่าง 1 ไบต์
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (currentBytes + size > limit) {
      parts.push(current);
      current = '';
      currentBytes = 0;
      limit = 74;
    }
    current += char;
    currentBytes += size;
  }
  parts.push(current);
  return parts.map((part, i) => (i === 0 ? part : ` ${part}`)).join('\r\n');
}

/** บรรทัดของ VEVENT หนึ่งรายการ — ใช้ร่วมกันทั้งไฟล์นัดเดียวและลิงก์ปฏิทิน */
function veventLines(event: IcsEvent, now: Date, opts: { withPeople: boolean }): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${toIcsDate(now)}`,
    `DTSTART:${toIcsDate(event.startsAt)}`,
    `DTEND:${toIcsDate(event.endsAt)}`,
    `SUMMARY:${escapeText(event.title)}`,
    `SEQUENCE:${event.sequence ?? 0}`,
    `STATUS:${event.status ?? 'CONFIRMED'}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.url) lines.push(`URL:${event.url}`);
  if (event.geo) lines.push(`GEO:${event.geo.latitude.toFixed(6)};${event.geo.longitude.toFixed(6)}`);
  if (opts.withPeople) {
    if (event.organizerEmail) {
      const cn = event.organizerName ? `;CN=${escapeText(event.organizerName)}` : '';
      lines.push(`ORGANIZER${cn}:mailto:${event.organizerEmail}`);
    }
    for (const email of event.attendeeEmails ?? []) {
      lines.push(`ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${email}`);
    }
  }
  lines.push('END:VEVENT');
  return lines;
}

export function buildIcs(event: IcsEvent, now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TNN Meeting//TH//',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    ...veventLines(event, now, { withPeople: true }),
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n');
}

/**
 * ปฏิทินแบบสมัครรับ (subscription) — METHOD:PUBLISH และไม่ใส่ผู้จัด/ผู้เข้าร่วม
 * เพราะถ้าใส่ Outlook จะมองเป็นคำเชิญให้ตอบรับ ซึ่งไม่ใช่สิ่งที่ลิงก์นี้ทำ
 * นัดที่ถูกยกเลิกไม่ต้องใส่มา — ครั้งถัดไปที่ Outlook ดึง นัดนั้นจะหายไปเอง
 */
export function buildIcsFeed(events: IcsEvent[], opts: { name: string }, now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TNN Meeting//TH//',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(opts.name)}`,
    'X-WR-TIMEZONE:Asia/Bangkok',
    // ขอให้แอปปฏิทินดึงใหม่ทุกชั่วโมง (Outlook อาจดึงห่างกว่านี้ตามที่มันกำหนดเอง)
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...events.flatMap((event) => veventLines(event, now, { withPeople: false })),
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n');
}
