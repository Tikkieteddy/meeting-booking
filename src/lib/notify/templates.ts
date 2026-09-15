import type { NotificationEvent, NotificationPayload } from './types';

/**
 * Template อีเมลภาษาไทยแบบ responsive (บรีฟข้อ 10)
 * เขียนเป็น HTML ตารางแบบเรียบง่าย เพื่อให้แสดงผลได้ถูกต้องใน Outlook และ Gmail
 * ห้ามใส่ข้อมูลลับเกินจำเป็น โดยเฉพาะการประชุมแบบ Private
 */

const BRAND = '#EC5F27';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function absoluteUrl(link: string | undefined, appUrl: string): string | null {
  if (!link) return null;
  return link.startsWith('http') ? link : `${appUrl.replace(/\/$/, '')}${link}`;
}

const EVENT_HEADLINE: Partial<Record<NotificationEvent, string>> = {
  'auth.verify_email': 'ยืนยันอีเมลของคุณ',
  'auth.password_reset': 'ตั้งรหัสผ่านใหม่',
  'auth.invite': 'คำเชิญเข้าใช้งานระบบ',
  'booking.confirmed': 'ยืนยันการจองห้องประชุมแล้ว',
  'booking.pending_approval': 'ส่งคำขอจองแล้ว รออนุมัติ',
  'booking.approved': 'คำขอจองได้รับการอนุมัติ',
  'booking.rejected': 'คำขอจองถูกปฏิเสธ',
  'booking.updated': 'มีการแก้ไขการจอง',
  'booking.cancelled': 'การจองถูกยกเลิก',
  'booking.reminder': 'เตือนการประชุมที่กำลังจะถึง',
  'booking.no_show': 'ห้องถูกปล่อยเพราะไม่มีการเช็กอิน',
  'room.closed': 'ห้องประชุมปิดให้บริการกะทันหัน',
  'waitlist.offer': 'มีห้องว่างสำหรับคิวที่คุณรออยู่',
};

const CTA_LABEL: Partial<Record<NotificationEvent, string>> = {
  'auth.verify_email': 'ยืนยันอีเมล',
  'auth.password_reset': 'ตั้งรหัสผ่านใหม่',
  'auth.invite': 'เริ่มใช้งาน',
  'waitlist.offer': 'ยืนยันการจอง',
};

export function renderEmail(
  event: NotificationEvent,
  payload: NotificationPayload,
  appUrl: string,
): { subject: string; html: string; text: string } {
  const headline = EVENT_HEADLINE[event] ?? payload.subject;
  const link = absoluteUrl(payload.link, appUrl);
  const cta = CTA_LABEL[event] ?? 'เปิดดูรายละเอียด';

  const rows = Object.entries(payload.data ?? {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(
      ([key, value]) => `
        <tr>
          <td style="padding:6px 0;color:#7d786f;font-size:13px;white-space:nowrap;vertical-align:top">${escapeHtml(labelOf(key))}</td>
          <td style="padding:6px 0 6px 16px;color:#2b2925;font-size:14px;font-weight:600">${escapeHtml(String(value))}</td>
        </tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(payload.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f8f8f7;font-family:'IBM Plex Sans Thai','Noto Sans Thai',system-ui,-apple-system,'Segoe UI',sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f7;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e2df">
        <tr>
          <td style="background:${BRAND};padding:18px 24px;color:#ffffff;font-size:16px;font-weight:700">
            ระบบจองห้องประชุม TNN
          </td>
        </tr>
        <tr>
          <td style="padding:24px">
            <h1 style="margin:0 0 12px;font-size:20px;line-height:1.4;color:#1a1917">${escapeHtml(headline)}</h1>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#42403a;white-space:pre-line">${escapeHtml(payload.text)}</p>
            ${rows ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #e4e2df;border-bottom:1px solid #e4e2df;margin:8px 0 20px">${rows}</table>` : ''}
            ${
              link
                ? `<a href="${escapeHtml(link)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:12px;font-size:14px;font-weight:600">${escapeHtml(cta)}</a>
                   <p style="margin:16px 0 0;font-size:12px;color:#7d786f;word-break:break-all">ถ้าปุ่มกดไม่ได้ ให้คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์:<br>${escapeHtml(link)}</p>`
                : ''
            }
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;background:#f8f8f7;color:#7d786f;font-size:12px;line-height:1.6">
            อีเมลฉบับนี้ส่งจากระบบอัตโนมัติ · ปรับการรับแจ้งเตือนได้ที่หน้าโปรไฟล์ในระบบ
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [payload.text, link ? `\n${cta}: ${link}` : ''].filter(Boolean).join('\n');
  return { subject: payload.subject, html, text };
}

const FIELD_LABELS: Record<string, string> = {
  room: 'ห้องประชุม',
  when: 'วันและเวลา',
  title: 'หัวข้อ',
  fullName: 'ชื่อ',
  lead: 'เตือนล่วงหน้า (นาที)',
};

function labelOf(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

/** ข้อความ LINE แบบสั้น อ่านง่ายบนมือถือ (ไม่มี HTML) */
export function renderLineMessage(event: NotificationEvent, payload: NotificationPayload, appUrl: string): string {
  const headline = EVENT_HEADLINE[event] ?? payload.subject;
  const link = absoluteUrl(payload.link, appUrl);
  return [`[${headline}]`, payload.text, link ? `ดูรายละเอียด: ${link}` : null].filter(Boolean).join('\n');
}
