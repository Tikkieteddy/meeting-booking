/**
 * Structured log — บรีฟข้อ 13 (Observability) และ 22.11
 * ปกปิดค่า secret / token / password / cookie ทุกครั้ง
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const REDACT_KEYS = [
  'password',
  'password_hash',
  'passwordhash',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'authorization',
  'cookie',
  'set-cookie',
  'api_key',
  'apikey',
  'service_role_key',
  'channel_access_token',
  'channel_secret',
];

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[deep]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEYS.includes(k.toLowerCase()) ? '[REDACTED]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function minLevel(): number {
  const raw = (process.env.LOG_LEVEL ?? 'info') as Level;
  return LEVELS[raw] ?? LEVELS.info;
}

function emit(level: Level, message: string, context?: Record<string, unknown>) {
  if (LEVELS[level] < minLevel()) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    release: process.env.RELEASE_VERSION ?? 'dev',
    ...(context ? { context: redact(context) } : {}),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (m: string, c?: Record<string, unknown>) => emit('debug', m, c),
  info: (m: string, c?: Record<string, unknown>) => emit('info', m, c),
  warn: (m: string, c?: Record<string, unknown>) => emit('warn', m, c),
  error: (m: string, c?: Record<string, unknown>) => emit('error', m, c),
};

/** Correlation ID ต่อหนึ่ง request (บรีฟข้อ 11) */
export function newCorrelationId(): string {
  return crypto.randomUUID();
}
