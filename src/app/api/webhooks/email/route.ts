import { verifyEmailWebhookSignature } from '@/lib/notify/providers';
import { withServiceTx } from '@/lib/db/pool';
import { withApi, apiOk, apiError } from '@/lib/api/respond';
import { logger } from '@/lib/util/logger';

/**
 * Webhook แจ้ง bounce / complaint จากผู้ให้บริการอีเมล (บรีฟ 22.6)
 * ที่อยู่ที่ตีกลับหรือร้องเรียนจะถูกใส่รายการระงับการส่ง เพื่อรักษาชื่อเสียงโดเมน
 * เก็บเฉพาะข้อมูลที่จำเป็น ไม่เก็บเนื้อหาอีเมล
 */
export const dynamic = 'force-dynamic';

type EmailEvent = { type?: string; data?: { email?: string; to?: string[]; reason?: string } };

export const POST = withApi(async (request: Request) => {
  const raw = await request.text();
  const signature = request.headers.get('x-webhook-signature') ?? request.headers.get('svix-signature');

  if (!verifyEmailWebhookSignature(raw, signature)) {
    logger.warn('ปฏิเสธ webhook ของอีเมลเพราะลายเซ็นไม่ถูกต้อง');
    return apiError('invalid_signature', 'ลายเซ็นไม่ถูกต้อง', 401);
  }

  let event: EmailEvent;
  try {
    event = JSON.parse(raw) as EmailEvent;
  } catch {
    return apiError('invalid_payload', 'รูปแบบข้อมูลไม่ถูกต้อง', 400);
  }

  const address = (event.data?.email ?? event.data?.to?.[0] ?? '').toLowerCase();
  const kind = event.type ?? '';
  const isBounce = /bounce/i.test(kind);
  const isComplaint = /complain|spam/i.test(kind);

  if (address && (isBounce || isComplaint)) {
    await withServiceTx((sql) =>
      sql.query(
        `INSERT INTO email_suppressions (email, reason, detail)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET reason = excluded.reason, detail = excluded.detail`,
        [address, isComplaint ? 'complaint' : 'bounce', (event.data?.reason ?? kind).slice(0, 300)],
      ),
    );
  }

  return apiOk({ handled: Boolean(address) });
});
