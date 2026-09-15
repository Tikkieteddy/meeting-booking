import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { DomainError } from '@/lib/domain/errors';
import { AuthError } from '@/lib/auth/current-user';
import { AuthServiceError } from '@/lib/auth/service';
import { logger, newCorrelationId } from '@/lib/util/logger';
import { t } from '@/lib/i18n';

/**
 * รูปแบบ Error เดียวกันทุก endpoint (บรีฟข้อ 15)
 *   { error: { code, message, violations? }, correlationId }
 * ห้ามส่งรายละเอียดภายในระบบหรือ secret กลับไปให้ client
 */
export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    violations?: { code: string; field: string; message: string }[];
    details?: Record<string, unknown>;
  };
  correlationId: string;
};

export function apiError(
  code: string,
  message: string,
  status: number,
  extra: { violations?: ApiErrorBody['error']['violations']; details?: Record<string, unknown>; correlationId?: string } = {},
) {
  const correlationId = extra.correlationId ?? newCorrelationId();
  const body: ApiErrorBody = {
    error: { code, message, ...(extra.violations ? { violations: extra.violations } : {}), ...(extra.details ? { details: extra.details } : {}) },
    correlationId,
  };
  return NextResponse.json(body, { status, headers: { 'x-correlation-id': correlationId } });
}

export function apiOk<T>(data: T, init: { status?: number; correlationId?: string } = {}) {
  const correlationId = init.correlationId ?? newCorrelationId();
  return NextResponse.json(data, {
    status: init.status ?? 200,
    headers: { 'x-correlation-id': correlationId, 'cache-control': 'no-store' },
  });
}

/** แปลง error ทุกชนิดให้เป็น response ที่ปลอดภัยและอ่านรู้เรื่อง */
export function toApiError(error: unknown, correlationId = newCorrelationId()) {
  if (error instanceof ZodError) {
    return apiError('validation', t('error.validation'), 422, {
      correlationId,
      violations: error.issues.map((issue) => ({
        code: issue.code,
        field: issue.path.join('.') || 'general',
        message: issue.message,
      })),
    });
  }
  if (error instanceof DomainError) {
    return apiError(error.code, error.message, error.status, {
      correlationId,
      violations: error.violations,
      details: error.details,
    });
  }
  if (error instanceof AuthError) {
    return apiError(error.code, error.message, error.code === 'unauthorized' ? 401 : 403, { correlationId });
  }
  if (error instanceof AuthServiceError) {
    const status = error.code === 'rate_limited' ? 429 : 400;
    return apiError(error.code, error.message, status, {
      correlationId,
      violations: error.field ? [{ code: error.code, field: error.field, message: error.message }] : undefined,
    });
  }
  logger.error('ข้อผิดพลาดที่ไม่ได้จัดการ', { correlationId, error: (error as Error)?.message, stack: (error as Error)?.stack?.slice(0, 500) });
  return apiError('internal_error', t('common.unknownError'), 500, { correlationId });
}

/** ห่อ handler ให้จัดการ error รูปแบบเดียวกันทั้งระบบ */
export function withApi<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    const correlationId = newCorrelationId();
    try {
      return await handler(...args);
    } catch (error) {
      return toApiError(error, correlationId);
    }
  };
}
