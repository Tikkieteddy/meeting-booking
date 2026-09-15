import type { RuleViolation } from './booking-rules';

/** ข้อผิดพลาดเชิงธุรกิจที่ต้องแสดงให้ผู้ใช้เข้าใจ (ไม่ใช่ error ของระบบ) */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
    readonly violations: RuleViolation[] = [],
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'conflict', 409, [], details);
    this.name = 'ConflictError';
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message, 'not_found', 404);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends DomainError {
  constructor(message: string) {
    super(message, 'forbidden', 403);
    this.name = 'ForbiddenError';
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, violations: RuleViolation[]) {
    super(message, 'validation', 422, violations);
    this.name = 'ValidationError';
  }
}

/** รหัสข้อผิดพลาดของ PostgreSQL ที่ระบบสนใจ */
export const PG_ERROR = {
  exclusionViolation: '23P01',
  uniqueViolation: '23505',
  checkViolation: '23514',
  foreignKeyViolation: '23503',
} as const;

export function pgErrorCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}
