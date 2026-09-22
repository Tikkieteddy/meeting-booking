/**
 * สร้างไฟล์ปฏิทิน .ics (RFC 5545) แนบไปกับอีเมลและให้ดาวน์โหลดได้ (บรีฟข้อ 10)
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
function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** พับบรรทัดที่ยาวเกิน 75 octet ตามสเปก */
function fold(line: string): string {
  if (line.length <= 73) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 73));
  rest = rest.slice(73);
  while (rest.length > 0) {
    chunks.push(` ${rest.slice(0, 72)}`);
    rest = rest.slice(72);
  }
  return chunks.join('\r\n');
}

export function buildIcs(event: IcsEvent, now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TNN Meeting//TH//',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
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
  if (event.organizerEmail) {
    const cn = event.organizerName ? `;CN=${escapeText(event.organizerName)}` : '';
    lines.push(`ORGANIZER${cn}:mailto:${event.organizerEmail}`);
  }
  for (const email of event.attendeeEmails ?? []) {
    lines.push(`ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${email}`);
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join('\r\n');
}
