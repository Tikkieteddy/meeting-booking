import { addDaysISO, toDateISO, minutesToHhmm } from '@/lib/util/time';

/**
 * ตีความคำค้นแบบผสมเป็นภาษาไทย (บรีฟข้อ 4)
 * ตัวอย่าง: "ห้อง 12 คน พรุ่งนี้ 13:00 ถึง 15:00"
 *           "ห้องประชุมใหญ่ วันนี้ บ่าย 2"
 * เป็น pure function จึงทดสอบได้ตรง ๆ
 */
export type ParsedQuery = {
  /** ข้อความที่เหลือหลังตัดเงื่อนไขที่ตีความได้ออกแล้ว */
  text: string;
  capacity: number | null;
  dateISO: string | null;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  amenityCodes: string[];
};

const AMENITY_KEYWORDS: Record<string, string> = {
  ทีวี: 'tv',
  tv: 'tv',
  จอ: 'tv',
  โปรเจกเตอร์: 'projector',
  โปรเจคเตอร์: 'projector',
  projector: 'projector',
  ประชุมทางไกล: 'video_conference',
  วิดีโอคอล: 'video_conference',
  zoom: 'video_conference',
  ไวท์บอร์ด: 'whiteboard',
  กระดาน: 'whiteboard',
  whiteboard: 'whiteboard',
  ไมค์: 'microphone',
  ไมโครโฟน: 'microphone',
  ลำโพง: 'speaker',
  รถเข็น: 'accessible',
};

function normalizeTime(hour: number, minute: number, meridiem?: 'am' | 'pm'): string | null {
  let h = hour;
  if (meridiem === 'pm' && h < 12) h += 12;
  if (meridiem === 'am' && h === 12) h = 0;
  if (h < 0 || h > 23 || minute < 0 || minute > 59) return null;
  return minutesToHhmm(h * 60 + minute);
}

export function parseSearchQuery(raw: string, now = new Date()): ParsedQuery {
  let text = ` ${raw} `;
  const today = toDateISO(now);

  const cut = (pattern: RegExp) => {
    const match = text.match(pattern);
    if (match) text = text.replace(match[0], ' ');
    return match;
  };

  // ---------- วันที่ ----------
  let dateISO: string | null = null;
  if (/วันนี้/.test(text)) {
    dateISO = today;
    cut(/วันนี้/);
  } else if (/พรุ่งนี้|พรุงนี้/.test(text)) {
    dateISO = addDaysISO(today, 1);
    cut(/พรุ่งนี้|พรุงนี้/);
  } else if (/มะรืน/.test(text)) {
    dateISO = addDaysISO(today, 2);
    cut(/มะรืน/);
  } else {
    const iso = cut(/(\d{4}-\d{2}-\d{2})/);
    if (iso?.[1]) dateISO = iso[1];
    else {
      // รูปแบบ 15/9 หรือ 15/09/2569
      const thai = cut(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
      if (thai) {
        const day = Number(thai[1]);
        const month = Number(thai[2]);
        let year = thai[3] ? Number(thai[3]) : Number(today.slice(0, 4));
        if (year > 2400) year -= 543; // พ.ศ. -> ค.ศ.
        if (year < 100) year += 2500 - 543;
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          dateISO = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }
    }
  }

  // ---------- ช่วงเวลา ----------
  let startTime: string | null = null;
  let endTime: string | null = null;
  const range = cut(/(\d{1,2})(?::(\d{2}))?\s*(?:-|–|ถึง|to)\s*(\d{1,2})(?::(\d{2}))?\s*(?:น\.?)?/);
  if (range) {
    startTime = normalizeTime(Number(range[1]), Number(range[2] ?? 0));
    endTime = normalizeTime(Number(range[3]), Number(range[4] ?? 0));
  } else {
    const single = cut(/(?:เวลา\s*)?(\d{1,2}):(\d{2})\s*(?:น\.?)?/);
    if (single) startTime = normalizeTime(Number(single[1]), Number(single[2]));
    else {
      const afternoon = cut(/บ่าย\s*(\d{1,2})/);
      if (afternoon) startTime = normalizeTime(Number(afternoon[1]), 0, 'pm');
      const morning = cut(/เช้า\s*(\d{1,2})\s*โมง/);
      if (morning) startTime = normalizeTime(Number(morning[1]), 0, 'am');
    }
  }

  // ---------- ระยะเวลา ----------
  let durationMinutes: number | null = null;
  const hours = cut(/(\d+(?:\.\d+)?)\s*(?:ชม\.?|ชั่วโมง|hr|hour)/);
  if (hours?.[1]) durationMinutes = Math.round(Number(hours[1]) * 60);
  const mins = cut(/(\d+)\s*(?:นาที|min)/);
  if (mins?.[1]) durationMinutes = (durationMinutes ?? 0) + Number(mins[1]);

  // ---------- จำนวนคน ----------
  let capacity: number | null = null;
  const people = cut(/(\d+)\s*(?:คน|ที่นั่ง|pax|people)/);
  if (people?.[1]) capacity = Number(people[1]);

  // ---------- อุปกรณ์ ----------
  const amenityCodes = new Set<string>();
  for (const [keyword, code] of Object.entries(AMENITY_KEYWORDS)) {
    const re = new RegExp(keyword, 'i');
    if (re.test(text)) {
      amenityCodes.add(code);
      text = text.replace(re, ' ');
    }
  }

  // คำเชื่อมที่ไม่ได้ช่วยในการค้นหา
  text = text.replace(/\b(ห้อง|ห้องประชุม|จอง|ขอ|หา)\b/g, ' ');

  return {
    text: text.replace(/\s+/g, ' ').trim(),
    capacity,
    dateISO,
    startTime,
    endTime,
    durationMinutes,
    amenityCodes: [...amenityCodes],
  };
}

/** เดาว่าผู้ใช้กำลังค้นหาแบบไหน เพื่อเลือกแท็บผลลัพธ์เริ่มต้น */
export function guessSearchMode(parsed: ParsedQuery): 'rooms' | 'bookings' | 'slots' {
  if (parsed.dateISO && (parsed.startTime || parsed.durationMinutes)) return 'slots';
  if (/@/.test(parsed.text)) return 'bookings';
  return 'rooms';
}
