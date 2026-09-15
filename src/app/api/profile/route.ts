import { withTx } from '@/lib/db/pool';
import { requireUser, requestMeta } from '@/lib/auth/current-user';
import { profileSchema } from '@/lib/validation/schemas';
import { writeAudit } from '@/lib/audit';
import { apiOk, withApi } from '@/lib/api/respond';

export const PUT = withApi(async (request: Request) => {
  const user = await requireUser();
  const input = profileSchema.parse(await request.json());
  const meta = await requestMeta();

  await withTx({ userId: user.id, role: 'authenticated' }, async (sql) => {
    await sql.query(
      `UPDATE profiles
          SET full_name = $2, phone = $3, department = $4, job_title = $5, locale = $6, timezone = $7
        WHERE id = $1`,
      [user.id, input.fullName, input.phone ?? null, input.department ?? null, input.jobTitle ?? null, input.locale, input.timezone],
    );
    await writeAudit(sql, {
      actorProfileId: user.id,
      actorEmail: user.email,
      action: 'profile.update',
      resourceType: 'profile',
      resourceId: user.id,
      before: { fullName: user.fullName, department: user.department },
      after: input,
      ipHint: meta.ipHint,
      userAgent: meta.userAgent,
    });
  });

  return apiOk({ ok: true });
});
