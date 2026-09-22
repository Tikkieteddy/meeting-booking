'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Badge, Input, cx } from '@/components/ui/primitives';
import { apiFetch } from '@/lib/client/api';
import { t } from '@/lib/i18n';

export type AttendeeChip = {
  email: string;
  displayName: string | null;
  /** มีค่า = คนในองค์กร (เลือกจากรายชื่อ) */
  profileId: string | null;
  lineReady?: boolean;
  emailReady?: boolean;
};

type Person = { id: string; fullName: string; email: string; department: string | null; lineReady: boolean; emailReady: boolean };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * ช่องผู้เข้าร่วม — พิมพ์ชื่อ/อีเมล/แผนกเพื่อค้นคนในองค์กร หรือพิมพ์อีเมลคนนอกแล้วกด Enter
 *
 * - คนใน: เลือกจากรายชื่อ ระบบรู้อีเมลและสถานะ LINE ของเขาเอง แจ้งเตือนได้ทั้งสองทาง
 * - คนนอก: พิมพ์อีเมลตรง ๆ ได้รับแจ้งเตือนทางอีเมลอย่างเดียว
 * - ใช้คีย์บอร์ดได้ครบ: ลูกศรขึ้น/ลง เลือกจากรายการ, Enter เพิ่ม, Backspace ในช่องว่างลบคนล่าสุด
 */
export function AttendeePicker({
  value,
  onChange,
  id,
  error,
}: {
  value: AttendeeChip[];
  onChange: (next: AttendeeChip[]) => void;
  id: string;
  error?: string;
}) {
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [searching, setSearching] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const listId = useId();
  const abortRef = useRef<AbortController | null>(null);

  // ค้นหาแบบหน่วง 250ms หลังหยุดพิมพ์ ยกเลิกคำค้นเก่าเมื่อพิมพ์ต่อ
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setPeople([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      try {
        const res = await apiFetch<{ people: Person[] }>(`/api/people?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (!controller.signal.aborted) {
          const chosen = new Set(value.map((v) => v.email.toLowerCase()));
          setPeople(res.people.filter((p) => !chosen.has(p.email.toLowerCase())));
          setHighlight(0);
          setOpen(true);
        }
      } catch {
        if (!controller.signal.aborted) setPeople([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, value]);

  const add = (chip: AttendeeChip) => {
    const email = chip.email.trim().toLowerCase();
    if (value.some((v) => v.email.toLowerCase() === email)) return;
    onChange([...value, { ...chip, email }]);
    setQuery('');
    setPeople([]);
    setOpen(false);
    setLocalError(null);
  };

  const addTyped = () => {
    const raw = query.trim().replace(/[,;]$/, '');
    if (!raw) return;
    if (!EMAIL_RE.test(raw)) {
      setLocalError(t('booking.attendeeInvalidEmail'));
      return;
    }
    add({ email: raw, displayName: null, profileId: null });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && people.length > 0) {
      event.preventDefault();
      setOpen(true);
      setHighlight((h) => (h + 1) % people.length);
    } else if (event.key === 'ArrowUp' && people.length > 0) {
      event.preventDefault();
      setHighlight((h) => (h - 1 + people.length) % people.length);
    } else if (event.key === 'Enter' || event.key === ',' || event.key === 'Tab') {
      if (open && people[highlight]) {
        event.preventDefault();
        const p = people[highlight]!;
        add({ email: p.email, displayName: p.fullName, profileId: p.id, lineReady: p.lineReady, emailReady: p.emailReady });
      } else if (query.trim()) {
        event.preventDefault();
        addTyped();
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    } else if (event.key === 'Backspace' && query === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={t('booking.attendees')}>
          {value.map((chip) => (
            <li
              key={chip.email}
              className={cx(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
                chip.profileId ? 'border-brand-200 bg-brand-50 text-ink-800' : 'border-ink-200 bg-white text-ink-700',
              )}
            >
              <span className="font-medium">{chip.displayName ?? chip.email}</span>
              {chip.displayName && <span className="text-ink-500">{chip.email}</span>}
              {chip.profileId ? (
                <>
                  <Badge tone="brand">{t('booking.attendeeInternal')}</Badge>
                  {chip.lineReady && <Badge tone="brand">{t('booking.attendeeLine')}</Badge>}
                </>
              ) : (
                <Badge>{t('booking.attendeeExternal')}</Badge>
              )}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v.email !== chip.email))}
                className="ms-0.5 rounded-full px-1 text-ink-500 hover:bg-ink-100 hover:text-ink-800"
              >
                <span aria-hidden="true">✕</span>
                <span className="sr-only">
                  {t('booking.attendeeRemove')} {chip.displayName ?? chip.email}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <Input
          id={id}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLocalError(null);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => people.length > 0 && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          placeholder={t('booking.attendeeSearchPlaceholder')}
          autoComplete="off"
          role="combobox"
          aria-expanded={open && people.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={Boolean(error || localError)}
        />
        {open && query.trim().length >= 2 && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-ink-200 bg-white py-1 shadow-lift"
          >
            {people.map((p, index) => (
              <li
                key={p.id}
                role="option"
                aria-selected={index === highlight}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add({ email: p.email, displayName: p.fullName, profileId: p.id, lineReady: p.lineReady, emailReady: p.emailReady });
                }}
                onMouseEnter={() => setHighlight(index)}
                className={cx('flex cursor-pointer flex-wrap items-center gap-x-2 px-3 py-2 text-sm', index === highlight ? 'bg-brand-50' : '')}
              >
                <span className="font-medium text-ink-900">{p.fullName}</span>
                <span className="text-xs text-ink-500">{p.email}</span>
                {p.department && <span className="text-xs text-ink-500">· {p.department}</span>}
                <span className="ms-auto flex gap-1">
                  {p.emailReady && <Badge>{t('booking.attendeeEmailOnly')}</Badge>}
                  {p.lineReady && <Badge tone="brand">{t('booking.attendeeLine')}</Badge>}
                </span>
              </li>
            ))}
            {!searching && people.length === 0 && (
              <li className="px-3 py-2 text-xs text-ink-500">{t('booking.attendeeNoMatch')}</li>
            )}
          </ul>
        )}
      </div>
      <p className="text-xs text-ink-500">{t('booking.attendeeHint')}</p>
      {(error || localError) && (
        <p role="alert" className="text-xs font-medium text-red-700">
          {error ?? localError}
        </p>
      )}
    </div>
  );
}
