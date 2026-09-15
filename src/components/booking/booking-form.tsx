'use client';

import { useMemo, useState } from 'react';
import type { Room, Amenity } from '@/lib/domain/rooms';
import { Button, Checkbox, Field, Input, Select, Textarea, cx } from '@/components/ui/primitives';
import { Overlay } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/client/api';
import { t } from '@/lib/i18n';
import { timeSlots, durationLabel } from '@/lib/domain/booking-rules';
import { formatThaiDate, hhmmToMinutes, minutesToHhmm } from '@/lib/util/time';
import { describeRecurrence } from '@/lib/domain/recurrence';

export type BookingFormPreset = {
  roomId: string | null;
  dateISO: string;
  startTime: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  rooms: Room[];
  amenities: Amenity[];
  preset: BookingFormPreset;
  canOverride: boolean;
  onCreated: (result: { requiresApproval: boolean; skipped?: { dateISO: string; reason: string }[] }) => void;
  onConflict?: (roomId: string, startTime: string) => void;
};

/** ฟอร์มจองห้องประชุม — เปิดเป็น Drawer/Modal โดยไม่พาออกจากปฏิทิน (บรีฟข้อ 5) */
export function BookingForm({ open, onClose, rooms, amenities, preset, canOverride, onCreated, onConflict }: Props) {
  const toast = useToast();
  const [roomId, setRoomId] = useState(preset.roomId ?? rooms[0]?.id ?? '');
  const [dateISO, setDateISO] = useState(preset.dateISO);
  const [startTime, setStartTime] = useState(preset.startTime ?? '09:00');
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');
  const [attendeeCount, setAttendeeCount] = useState(1);
  const [attendeeEmails, setAttendeeEmails] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'busy_only' | 'private'>('public');
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [recurrenceOn, setRecurrenceOn] = useState(false);
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [untilDate, setUntilDate] = useState('');
  const [occurrenceCount, setOccurrenceCount] = useState(4);
  const [overrideReason, setOverrideReason] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [idempotencyKey] = useState(() => `bk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];
  const slots = useMemo(() => (room ? timeSlots(room.policy) : []), [room]);
  const effectiveDuration = durationMinutes ?? room?.policy.minDurationMinutes ?? 30;
  const endTime = useMemo(
    () => minutesToHhmm(hhmmToMinutes(startTime) + effectiveDuration),
    [startTime, effectiveDuration],
  );

  const durationOptions = useMemo(() => {
    if (!room) return [30];
    const out: number[] = [];
    for (let m = room.policy.minDurationMinutes; m <= room.policy.maxDurationMinutes; m += room.policy.slotStepMinutes) {
      out.push(m);
    }
    return out;
  }, [room]);

  const submit = async () => {
    if (!room) return;
    setLoading(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const payload = {
        roomId: room.id,
        title,
        purpose: purpose || null,
        notes: notes || null,
        dateISO,
        startTime,
        endTime,
        attendeeCount,
        attendees: attendeeEmails
          .split(/[,\s;]+/)
          .map((email) => email.trim())
          .filter(Boolean)
          .map((email) => ({ email })),
        resources: selectedAmenities.map((amenityCode) => ({ amenityCode })),
        privacy,
        idempotencyKey,
        overrideReason: overrideReason || null,
        recurrence: recurrenceOn
          ? {
              frequency,
              intervalCount: 1,
              untilDate: untilDate || null,
              occurrenceCount: untilDate ? null : occurrenceCount,
            }
          : null,
      };
      const result = await apiFetch<{ requiresApproval: boolean; skipped?: { dateISO: string; reason: string }[] }>(
        '/api/bookings',
        { method: 'POST', body: JSON.stringify(payload) },
      );
      onCreated(result);
      onClose();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setFieldErrors(error.fieldErrors());
        setFormError(error.message);
        if (error.code === 'conflict') {
          toast.show(error.message, 'error');
          onConflict?.(room.id, startTime);
        }
      } else {
        setFormError(t('common.unknownError'));
      }
    } finally {
      setLoading(false);
    }
  };

  if (!room) return null;

  return (
    <Overlay
      open={open}
      onClose={onClose}
      title={t('booking.new')}
      description={`${room.name} · ${formatThaiDate(dateISO)}`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ink-500">
            {startTime} – {endTime} · {durationLabel(new Date(0), new Date(effectiveDuration * 60_000))}
            {room.policy.requiresApproval && <span className="ms-2 text-purple-700">· ต้องขออนุมัติ</span>}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} loading={loading}>
              {loading ? t('booking.submitting') : t('booking.submit')}
            </Button>
          </div>
        </div>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        noValidate
      >
        {formError && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
            {formError}
          </div>
        )}

        <Field label={t('booking.title')} htmlFor="bk-title" required error={fieldErrors.title}>
          <Input
            id="bk-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('booking.titlePlaceholder')}
            required
            maxLength={200}
            aria-invalid={Boolean(fieldErrors.title)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('booking.room')} htmlFor="bk-room" required error={fieldErrors.roomId}>
            <Select id="bk-room" value={roomId} onChange={(event) => setRoomId(event.target.value)}>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.capacity} {t('common.people')}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('booking.date')} htmlFor="bk-date" required error={fieldErrors.dateISO}>
            <Input id="bk-date" type="date" value={dateISO} onChange={(event) => setDateISO(event.target.value)} required />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('booking.startTime')} htmlFor="bk-start" required error={fieldErrors.startsAt ?? fieldErrors.startTime}>
            <Select id="bk-start" value={startTime} onChange={(event) => setStartTime(event.target.value)}>
              {slots.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={`${t('search.duration')} (${t('booking.endTime')} ${endTime})`}
            htmlFor="bk-duration"
            error={fieldErrors.endsAt ?? fieldErrors.endTime}
          >
            <Select
              id="bk-duration"
              value={String(effectiveDuration)}
              onChange={(event) => setDurationMinutes(Number(event.target.value))}
            >
              {durationOptions.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes % 60 === 0 ? `${minutes / 60} ชม.` : `${minutes} นาที`}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('booking.attendeeCount')}
            htmlFor="bk-count"
            required
            error={fieldErrors.attendeeCount}
            hint={`ความจุห้อง ${room.capacity} ${t('common.people')}`}
          >
            <Input
              id="bk-count"
              type="number"
              min={1}
              max={1000}
              value={attendeeCount}
              onChange={(event) => setAttendeeCount(Number(event.target.value))}
              aria-invalid={Boolean(fieldErrors.attendeeCount)}
            />
          </Field>
          <Field label={t('booking.privacy')} htmlFor="bk-privacy">
            <Select id="bk-privacy" value={privacy} onChange={(event) => setPrivacy(event.target.value as typeof privacy)}>
              <option value="public">{t('booking.privacy.public')}</option>
              <option value="busy_only">{t('booking.privacy.busy_only')}</option>
              <option value="private">{t('booking.privacy.private')}</option>
            </Select>
          </Field>
        </div>

        <Field label={t('booking.attendees')} htmlFor="bk-attendees" error={fieldErrors.attendees}>
          <Textarea
            id="bk-attendees"
            value={attendeeEmails}
            onChange={(event) => setAttendeeEmails(event.target.value)}
            placeholder={t('booking.attendeeEmailPlaceholder')}
            className="min-h-16"
          />
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-ink-700">{t('booking.resources')}</legend>
          <div className="flex flex-wrap gap-2">
            {amenities.map((amenity) => {
              const active = selectedAmenities.includes(amenity.code);
              const available = room.amenities.some((a) => a.code === amenity.code);
              return (
                <button
                  key={amenity.code}
                  type="button"
                  onClick={() =>
                    setSelectedAmenities((prev) =>
                      prev.includes(amenity.code) ? prev.filter((c) => c !== amenity.code) : [...prev, amenity.code],
                    )
                  }
                  aria-pressed={active}
                  className={cx(
                    'rounded-full border px-3 py-1.5 text-xs font-medium',
                    active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-600 hover:bg-ink-50',
                    !available && 'opacity-60',
                  )}
                  title={available ? undefined : 'ห้องนี้ไม่มีอุปกรณ์นี้ประจำห้อง จะถูกบันทึกเป็นคำขอบริการเสริม'}
                >
                  {amenity.nameTh}
                  {!available && ' (ขอเพิ่ม)'}
                </button>
              );
            })}
          </div>
        </fieldset>

        <Field label={t('booking.purpose')} htmlFor="bk-purpose" error={fieldErrors.purpose}>
          <Input id="bk-purpose" value={purpose} onChange={(event) => setPurpose(event.target.value)} maxLength={500} />
        </Field>

        <Field label={t('booking.notes')} htmlFor="bk-notes" error={fieldErrors.notes}>
          <Textarea id="bk-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} />
        </Field>

        <fieldset className="flex flex-col gap-3 rounded-xl border border-ink-200 p-3">
          <legend className="px-1 text-sm font-medium text-ink-700">{t('booking.recurrence')}</legend>
          <Checkbox
            label="จองซ้ำหลายครั้ง"
            checked={recurrenceOn}
            onChange={(event) => setRecurrenceOn(event.target.checked)}
          />
          {recurrenceOn && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="ความถี่" htmlFor="bk-freq">
                  <Select id="bk-freq" value={frequency} onChange={(event) => setFrequency(event.target.value as typeof frequency)}>
                    <option value="daily">{t('booking.recurrence.daily')}</option>
                    <option value="weekly">{t('booking.recurrence.weekly')}</option>
                    <option value="monthly">{t('booking.recurrence.monthly')}</option>
                  </Select>
                </Field>
                <Field label={t('booking.recurrence.until')} htmlFor="bk-until">
                  <Input id="bk-until" type="date" value={untilDate} onChange={(event) => setUntilDate(event.target.value)} />
                </Field>
                <Field label={t('booking.recurrence.count')} htmlFor="bk-count-times" hint="ใช้เมื่อไม่ระบุวันสิ้นสุด">
                  <Input
                    id="bk-count-times"
                    type="number"
                    min={1}
                    max={104}
                    value={occurrenceCount}
                    onChange={(event) => setOccurrenceCount(Number(event.target.value))}
                    disabled={Boolean(untilDate)}
                  />
                </Field>
              </div>
              <p className="text-xs text-ink-500">
                {describeRecurrence({
                  frequency,
                  intervalCount: 1,
                  untilDate: untilDate || null,
                  occurrenceCount: untilDate ? null : occurrenceCount,
                })}
                {' · ครั้งที่ชนเวลาจะถูกข้ามและแจ้งให้ทราบ'}
              </p>
            </>
          )}
        </fieldset>

        {canOverride && (
          <Field
            label={t('booking.overrideCapacity')}
            htmlFor="bk-override"
            hint="ระบุเหตุผลเพื่อข้ามข้อจำกัดความจุหรือเวลาย้อนหลัง ระบบจะบันทึกลง Audit Log"
          >
            <Input id="bk-override" value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} maxLength={300} />
          </Field>
        )}
      </form>
    </Overlay>
  );
}
