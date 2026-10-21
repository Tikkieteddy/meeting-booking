import { describe, expect, it } from 'vitest';
import { buildIcs, buildIcsFeed, escapeText, fold } from '@/lib/notify/ics';

const event = {
  uid: 'b1\\tnn-meeting',
  title: 'ประชุมวางแผน; สรุป, งาน',
  startsAt: new Date('2026-10-20T02:00:00Z'),
  endsAt: new Date('2026-10-20T03:00:00Z'),
  organizerEmail: 'boss@example.com',
  attendeeEmails: ['a@example.com'],
};

describe('ไฟล์ปฏิทิน .ics', () => {
  it('หนี ; , และขึ้นบรรทัดใหม่ตามสเปก (เดิม ; ไม่ถูกหนี)', () => {
    expect(escapeText('a;b,c\\\\d\ne')).toBe('a\\;b\\,c\\\\\\\\d\\ne');
  });

  it('พับบรรทัดตามจำนวนไบต์ — ภาษาไทยไม่เกิน 75 ไบต์ต่อบรรทัด และไม่ตัดกลางตัวอักษร', () => {
    const line = `SUMMARY:${'ประชุมใหญ่ประจำเดือน'.repeat(10)}`;
    const parts = fold(line).split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    // ต่อกลับได้ข้อความเดิม (บรรทัดต่อขึ้นต้นด้วยช่องว่าง 1 ตัว)
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(line);
  });

  it('นัดเดียว (ดาวน์โหลด/แนบอีเมล) ยังเป็นคำเชิญพร้อมผู้จัดและผู้เข้าร่วม', () => {
    const ics = buildIcs(event);
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('ORGANIZER:mailto:boss@example.com');
    expect(ics).toContain('ATTENDEE');
  });

  it('ลิงก์ปฏิทิน: หลายนัด METHOD:PUBLISH ไม่มีผู้จัด/ผู้เข้าร่วม (ไม่ให้ Outlook มองเป็นคำเชิญ)', () => {
    const ics = buildIcsFeed([event, { ...event, uid: 'b2\\tnn-meeting', title: 'นัดที่สอง' }], { name: 'TNN จองห้องประชุม' })
      .replace(/\r\n /g, '');
    expect(ics).toContain('METHOD:PUBLISH');
    expect(ics).toContain('X-WR-CALNAME:TNN จองห้องประชุม');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).not.toContain('ORGANIZER');
    expect(ics).not.toContain('ATTENDEE');
    expect(ics).toContain('SUMMARY:ประชุมวางแผน\\; สรุป\\, งาน');
  });

  it('ไม่มีนัดเลยก็ยังเป็นปฏิทินที่ถูกต้อง', () => {
    const ics = buildIcsFeed([], { name: 'x' });
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).not.toContain('BEGIN:VEVENT');
  });
});
