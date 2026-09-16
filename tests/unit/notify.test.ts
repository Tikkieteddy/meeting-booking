import { describe, expect, it } from 'vitest';
import { buildIcs } from '@/lib/notify/ics';
import { renderEmail, renderLineMessage } from '@/lib/notify/templates';
import { buildDedupeKey } from '@/lib/notify/queue';
import { toCsv } from '@/lib/domain/reports';

describe('ไฟล์ปฏิทิน ICS', () => {
  const event = {
    uid: 'booking-1@tnn-meeting',
    title: 'ประชุมวางแผนข่าว; ครั้งที่ 1',
    description: 'บรรทัดแรก\nบรรทัดสอง',
    location: 'ห้องประชุมใหญ่ (TNN-A-301)',
    startsAt: new Date('2026-09-15T06:00:00Z'),
    endsAt: new Date('2026-09-15T07:30:00Z'),
    organizerEmail: 'booker@example.com',
    organizerName: 'ผู้จอง',
    attendeeEmails: ['a@example.com', 'b@example.com'],
  };

  it('สร้างโครงสร้างตามสเปกและใช้เวลา UTC', () => {
    const ics = buildIcs(event, new Date('2026-09-14T00:00:00Z'));
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('DTSTART:20260915T060000Z');
    expect(ics).toContain('DTEND:20260915T073000Z');
    expect(ics).toContain('UID:booking-1@tnn-meeting');
    expect(ics).toContain('ORGANIZER;CN=ผู้จอง:mailto:booker@example.com');
    expect(ics.split('ATTENDEE').length - 1).toBe(2);
    expect(ics).toContain('\r\n'); // ต้องขึ้นบรรทัดแบบ CRLF
  });

  it('escape อักขระพิเศษตามสเปก', () => {
    const ics = buildIcs(event);
    expect(ics).toContain('SUMMARY:ประชุมวางแผนข่าว\; ครั้งที่ 1');
    expect(ics).toContain('บรรทัดแรก\\nบรรทัดสอง');
  });

  it('สถานะยกเลิกใช้ STATUS:CANCELLED', () => {
    expect(buildIcs({ ...event, status: 'CANCELLED' })).toContain('STATUS:CANCELLED');
  });
});

describe('Template อีเมลและ LINE', () => {
  const payload = {
    subject: 'ยืนยันการจองแล้ว: ประชุมทีม',
    text: 'ห้อง ห้องประชุมย่อย 2\n15 กันยายน 2569 13:00 – 14:00 น.',
    link: '/bookings/abc',
    data: { room: 'ห้องประชุมย่อย 2', when: '15 ก.ย. 13:00' },
  };

  it('อีเมลเป็น HTML ภาษาไทย มีลิงก์เต็มและหัวข้อถูกต้อง', () => {
    const mail = renderEmail('booking.confirmed', payload, 'https://meeting.example.com');
    expect(mail.subject).toBe(payload.subject);
    expect(mail.html).toContain('<html lang="th">');
    expect(mail.html).toContain('https://meeting.example.com/bookings/abc');
    expect(mail.html).toContain('ยืนยันการจองห้องประชุมแล้ว');
    expect(mail.html).toContain('ห้องประชุมย่อย 2');
    expect(mail.text).toContain('https://meeting.example.com/bookings/abc');
  });

  it('escape HTML กัน XSS จากข้อมูลผู้ใช้', () => {
    const mail = renderEmail(
      'booking.confirmed',
      { subject: 'x', text: '<script>alert(1)</script>', data: { room: '<img onerror=1>' } },
      'https://meeting.example.com',
    );
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).not.toContain('<img onerror');
  });

  it('ข้อความ LINE เป็นข้อความล้วนและมีลิงก์', () => {
    const text = renderLineMessage('booking.reminder', payload, 'https://meeting.example.com');
    expect(text).toContain('[เตือนการประชุมที่กำลังจะถึง]');
    expect(text).toContain('https://meeting.example.com/bookings/abc');
    expect(text).not.toContain('<');
  });
});

describe('กันส่งแจ้งเตือนซ้ำ', () => {
  it('dedupe key เหมือนกันเมื่อเหตุการณ์ ผู้รับ และเวลาเดียวกัน', () => {
    const base = {
      eventType: 'booking.reminder' as const,
      channel: 'email' as const,
      bookingId: 'b1',
      recipientProfileId: 'p1',
      payload: { subject: 's', text: 't' },
      scheduledFor: new Date('2026-09-15T06:00:00Z'),
    };
    expect(buildDedupeKey(base)).toBe(buildDedupeKey({ ...base }));
    expect(buildDedupeKey(base)).not.toBe(buildDedupeKey({ ...base, channel: 'line' }));
    expect(buildDedupeKey(base)).not.toBe(
      buildDedupeKey({ ...base, scheduledFor: new Date('2026-09-15T07:00:00Z') }),
    );
  });
});

describe('Export CSV', () => {
  it('ใส่ BOM ให้ Excel อ่านไทยได้ และ escape เครื่องหมายคำพูด', () => {
    const csv = toCsv(
      [
        { name: 'ห้อง "ใหญ่"', note: 'มี, จุลภาค', count: 3 },
        { name: 'บรรทัด\nใหม่', note: null, count: 0 },
      ],
      [
        { key: 'name', label: 'ชื่อ' },
        { key: 'note', label: 'หมายเหตุ' },
        { key: 'count', label: 'จำนวน' },
      ],
    );
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"ห้อง ""ใหญ่"""');
    expect(csv).toContain('"มี, จุลภาค"');
    expect(csv).toContain('ชื่อ,หมายเหตุ,จำนวน');
  });
});
