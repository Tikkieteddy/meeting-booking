'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Input, Select } from '@/components/ui/primitives';
import { t } from '@/lib/i18n';
import {
  MAX_REMINDERS,
  MAX_REMINDER_MINUTES,
  REMINDER_PRESETS,
  REMINDER_UNIT_MINUTES,
  formatReminderLead,
  nextReminderLead,
  splitReminderLead,
  type ReminderUnit,
} from '@/lib/domain/reminders';

// unit เก็บแยก เพื่อไม่ให้หน่วยกระโดดระหว่างพิมพ์ (เช่น พิมพ์ 60 นาทีแล้วกลายเป็น 1 ชั่วโมงเอง)
type Row = { key: number; minutes: number; custom: boolean; unit: ReminderUnit };

const CUSTOM = 'custom';
const UNITS: ReminderUnit[] = ['minute', 'hour', 'day', 'week'];

/**
 * ตัวเลือกเวลาเตือนก่อนประชุมแบบ Google Calendar
 * แต่ละแถวเลือกจากค่าสำเร็จรูป หรือ "กำหนดเอง…" แล้วใส่ตัวเลข + หน่วย ได้หลายแถว (ไม่เกิน MAX_REMINDERS)
 * ค่าที่ส่งออกเป็นจำนวนนาทีก่อนเริ่ม (0 = ตอนเริ่มประชุม) — ตัดค่าซ้ำที่ฝั่ง schema อีกชั้น
 */
export function ReminderEditor({
  id,
  value,
  onChange,
  legend = t('reminder.legend'),
  hint = t('reminder.hint', { max: MAX_REMINDERS }),
}: {
  id: string;
  value: number[];
  onChange: (leads: number[]) => void;
  legend?: string;
  hint?: string;
}) {
  const nextKey = useRef(0);
  const toRows = (leads: number[]): Row[] =>
    leads.map((minutes) => ({
      key: nextKey.current++,
      minutes,
      custom: !REMINDER_PRESETS.includes(minutes),
      unit: splitReminderLead(minutes).unit,
    }));
  const [rows, setRows] = useState<Row[]>(() => toRows(value));

  // ค่าจากภายนอกเปลี่ยน (เช่น โหลดค่าตั้งส่วนตัวเสร็จ) — ซิงก์แถวใหม่ถ้าไม่ตรงกับที่แสดงอยู่
  const shown = rows.map((r) => r.minutes).join(',');
  const incoming = value.join(',');
  useEffect(() => {
    if (incoming !== shown) setRows(toRows(value));
    // เทียบด้วยสตริงพอ ไม่ต้องใส่ rows/value ทั้งก้อน (กันวนลูป)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

  const commit = (next: Row[]) => {
    setRows(next);
    onChange(next.map((r) => r.minutes));
  };
  const update = (key: number, patch: Partial<Row>) => commit(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const hintId = `${id}-hint`;
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={hintId}>
      <legend className="text-sm font-medium text-ink-700">{legend}</legend>
      <p id={hintId} className="text-xs text-ink-500">
        {hint}
      </p>

      {rows.length === 0 && <p className="text-sm text-ink-600">{t('reminder.none')}</p>}

      <ul className="flex flex-col gap-2">
        {rows.map((row, index) => {
          const unitSize = REMINDER_UNIT_MINUTES[row.unit];
          const amount = Math.round(row.minutes / unitSize);
          const label = formatReminderLead(row.minutes);
          const tooFar = row.minutes > MAX_REMINDER_MINUTES;
          return (
            <li key={row.key} className="flex flex-wrap items-center gap-2" data-reminder-row>
              <Select
                id={`${id}-${row.key}`}
                aria-label={t('reminder.item', { n: index + 1 })}
                className="min-w-0 flex-1 basis-40"
                value={row.custom ? CUSTOM : String(row.minutes)}
                onChange={(event) => {
                  const v = event.target.value;
                  if (v === CUSTOM) update(row.key, { custom: true, unit: splitReminderLead(row.minutes).unit });
                  else update(row.key, { custom: false, minutes: Number(v) });
                }}
              >
                {REMINDER_PRESETS.map((m) => (
                  <option key={m} value={m}>
                    {formatReminderLead(m)}
                  </option>
                ))}
                <option value={CUSTOM}>{t('reminder.custom')}</option>
              </Select>

              {row.custom && (
                <span className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    aria-label={t('reminder.customAmount')}
                    className="w-20"
                    value={amount}
                    onChange={(event) => {
                      const next = Math.max(0, Math.floor(Number(event.target.value) || 0));
                      update(row.key, { minutes: next * unitSize });
                    }}
                    aria-invalid={tooFar || undefined}
                  />
                  <Select
                    aria-label={t('reminder.customUnit')}
                    className="w-28"
                    value={row.unit}
                    onChange={(event) => {
                      const unit = event.target.value as ReminderUnit;
                      update(row.key, { unit, minutes: amount * REMINDER_UNIT_MINUTES[unit] });
                    }}
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {t(`reminder.unit.${u}` as 'reminder.unit.minute')}
                      </option>
                    ))}
                  </Select>
                </span>
              )}

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => commit(rows.filter((r) => r.key !== row.key))}
              >
                <span aria-hidden="true">✕</span>
                <span className="sr-only">{t('reminder.remove', { label })}</span>
              </Button>

              {tooFar && (
                <p className="basis-full text-xs text-red-700" role="alert">
                  {t('reminder.tooFar')}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={rows.length >= MAX_REMINDERS}
          onClick={() => {
            const minutes = nextReminderLead(rows.map((r) => r.minutes));
            commit([...rows, { key: nextKey.current++, minutes, custom: false, unit: splitReminderLead(minutes).unit }]);
          }}
        >
          {t('reminder.add')}
        </Button>
      </div>
    </fieldset>
  );
}
