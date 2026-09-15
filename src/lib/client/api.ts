'use client';

/** เรียก API ของระบบ พร้อมแปลง error format กลางให้ใช้งานง่ายในฟอร์ม */
export type ApiViolation = { code: string; field: string; message: string };

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly violations: ApiViolation[] = [],
    readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  /** map ข้อความ error ลงแต่ละฟิลด์ของฟอร์ม */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const v of this.violations) if (!out[v.field]) out[v.field] = v.message;
    return out;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
    credentials: 'same-origin',
  });

  if (response.status === 204) return undefined as T;

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const body = payload as { error?: { code?: string; message?: string; violations?: ApiViolation[] }; correlationId?: string } | null;
    throw new ApiClientError(
      body?.error?.message ?? 'เกิดข้อผิดพลาดในการเชื่อมต่อระบบ',
      body?.error?.code ?? 'unknown',
      response.status,
      body?.error?.violations ?? [],
      body?.correlationId,
    );
  }
  return payload as T;
}
