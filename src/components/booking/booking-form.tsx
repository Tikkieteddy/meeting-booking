'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapLink } from '@/components/ui/map-link';
import { AttendeePicker, type AttendeeChip } from './attendee-picker';
import { ReminderEditor } from '@/components/ui/reminder-editor';
import type { Room, Amenity } from '@/lib/domain/rooms';
import { Button, Field, Input, Select, Textarea, cx } from '@/components/ui/primitives';
import { Overlay } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/client/api';
import { t } from '@/lib/i18n';
import { timeSlots, durationLabel } from '@/lib/domain/booking-rules';
import { formatThaiDate, hhmmToMinutes, minutesToHhmm, toDateISO } from '@/lib/util/time';
import type { RecurrenceRule } from '@/lib/domain/recurrence';
import { RecurrencePicker } from './recurrence-picker';

export type BookingFormPreset = {
  roomId: string | null;
  dateISO: string;
  startTime: string | null;
};

/** ค่าเดิมของการจองที่จะแก้ไข — เปิดฟอร์มนี้ในโหมดแก้ไข (ห้องและการเกิดซ้ำเปลี่ยนไม่ได้) */
export type EditingBooking = {
  id: string;
  version: number;
  roomId: string;
  dateISO: string;
  startTime: string;
  endTime: string;
  title: string;
  purpose: string | null;
  notes: string | null;
  attendeeCount: number;
  attendees: AttendeeChip[];
  privacy: 'public' | 'busy_only' | 'private';
  priority: 'normal' | 'urgent' | 'vip' | 'internal';
  category: string | null;
  resources: string[];
  /** เวลาเตือนของผู้จอง — null = ใช้ค่าตั้งส่วนตัว */
  reminderLeads: number[] | null;
  /** เฉพาะผู้จองเองแก้เวลาเตือนได้ (เวลาเตือนเป็นของผู้จอง ผู้ดูแลที่แก้แทนไม่ควรไปเปลี่ยน) */
  canEditReminders: boolean;
  isSeries: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  rooms: Room[];
  amenities: Amenity[];
  preset: BookingFormPreset;
  canOverride: boolean;
  onCreated?: (result: { requiresApproval: boolean; skipped?: { dateISO: string; reason: string }[] }) => void;
  onConflict?: (roomId: string, startTime: string) => void;
  /** มีค่า = โหมดแก้ไขการจองเดิม */
  editing?: EditingBooking;
  onSaved?: () => void;
};

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

/** ฟอร์มจองห้องประชุม — เปิดเป็น Drawer/Modal โดยไม่พาออกจากปฏิทิน (บรีฟข้อ 5) ใช้ทั้งจองใหม่และแก้ไข */
export function BookingForm({ open, onClose, rooms, amenities, preset, canOverride, onCreated, onConflict, editing, onSaved }: Props) {
  const toast = useToast();
  const [roomId, setRoomId] = useState(editing?.roomId ?? preset.roomId ?? rooms[0]?.id ?? '');
  const [dateISO, setDateISO] = useState(editing?.dateISO ?? preset.dateISO);
  const [startTime, setStartTime] = useState(editing?.startTime ?? preset.startTime ?? '09:00');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [purpose, setPurpose] = useState(editing?.purpose ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [attendeeCount, setAttendeeCount] = useState(editing?.attendeeCount ?? 1);
  const [attendees, setAttendees] = useState<AttendeeChip[]>(editing?.attendees ?? []);
  const [privacy, setPrivacy] = useState<'public' | 'busy_only' | 'private'>(editing?.privacy ?? 'public');
  const [priority, setPriority] = useState<'normal' | 'urgent' | 'vip' | 'internal'>(editing?.priority ?? 'normal');
  const [category, setCategory] = useState(editing?.category ?? '');
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>(editing?.resources ?? []);
  const [recurrence, setRecurrence] = useState<RecurrenceRule | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  // เวลาเตือนของการจองนี้ — เริ่มจากค่าตั้งส่วนตัว null = ยังโหลดไม่เสร็จ (ส่งไปไม่ได้ ระบบจะใช้ค่าตั้งส่วนตัวเอง)
  const [reminderLeads, setReminderLeads] = useState<number[] | null>(editing?.reminderLeads ?? null);
  // ค่าเตือนตอนเปิดฟอร์มแก้ไข — ใช้เทียบว่าผู้ใช้เปลี่ยนจริงหรือไม่
  const [initialLeads, setInitialLeads] = useState<number[] | null>(editing?.reminderLeads ?? null);
  const showReminders = !editing || editing.canEditReminders;
  // การจองในชุดเกิดซ้ำ: แก้เฉพาะครั้งนี้ หรือทุกครั้งที่ยังไม่ถึง
  const [scope, setScope] = useState<'this' | 'series'>('this');
  // เวลาสิ้นสุดที่ผู้ใช้เลือกเอง — null = ใช้ค่าเริ่มต้น (เริ่ม + ระยะขั้นต่ำของห้อง)
  const [chosenEndTime, setChosenEndTime] = useState<string | null>(editing?.endTime ?? null);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [idempotencyKey] = useState(() => `bk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    if (!open || reminderLeads !== null || !showReminders) return;
    let cancelled = false;
    apiFetch<{ preferences: { reminderLeads: number[] } }>('/api/notifications/preferences')
      .then((res) => {
        if (cancelled) return;
        setReminderLeads(res.preferences.reminderLeads);
        setInitialLeads(res.preferences.reminderLeads);
      })
      .catch(() => {
        // โหลดไม่ได้ก็ไม่เป็นไร — ไม่ส่งค่าไป ระบบใช้ค่าตั้งส่วนตัวแทน
      });
    return () => {
      cancelled = true;
    };
  }, [open, reminderLeads, showReminders]);

  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];
  const slots = useMemo(() => {
    const base = room ? timeSlots(room.policy) : [];
    // การจองเดิมอาจเริ่มนอกช่องปกติ (เช่น ผู้ดูแลจองแทน) — ใส่เวลาเดิมไว้ให้เลือก ไม่ให้เวลาเปลี่ยนเองเงียบ ๆ
    if (editing && !base.includes(editing.startTime)) return [...base, editing.startTime].sort();
    return base;
  }, [room, editing]);

  /*
   * ตัวเลือก "เวลาสิ้นสุด": ทุกช่วงหลังเวลาเริ่ม ที่ยาวอย่างน้อยเท่าขั้นต่ำของห้อง
   * ไม่เกินสูงสุดของห้อง และไม่เลยเวลาปิด — ผู้ใช้เห็นเวลาจริง ไม่ต้องคิดเลขระยะเวลาเอง
   */
  const endOptions = useMemo(() => {
    if (!room) return [] as string[];
    const start = hhmmToMinutes(startTime);
    const close = hhmmToMinutes(room.policy.closeTime);
    const out: string[] = [];
    for (let m = start + room.policy.minDurationMinutes; m <= close && m - start <= room.policy.maxDurationMinutes; m += room.policy.slotStepMinutes) {
      out.push(minutesToHhmm(m));
    }
    // เช่นเดียวกับเวลาเริ่ม: คงเวลาสิ้นสุดเดิมไว้ถ้ายังไม่ได้เปลี่ยนเวลาเริ่ม แม้จะยาวเกินกฎปัจจุบันของห้อง
    if (editing && startTime === editing.startTime && !out.includes(editing.endTime)) out.push(editing.endTime);
    return out.sort();
  }, [room, startTime, editing]);
  const endTime = chosenEndTime && endOptions.includes(chosenEndTime) ? chosenEndTime : (endOptions[0] ?? startTime);
  const effectiveDuration = Math.max(0, hhmmToMinutes(endTime) - hhmmToMinutes(startTime));

  /*
   * โหมดแก้ไข: ส่งเฉพาะช่องที่เปลี่ยนจริง — ระบบตั้งเตือนใหม่/แจ้งผู้เข้าร่วมตามสิ่งที่ส่งมา
   * ถ้าส่งรายชื่อผู้เข้าร่วมเดิมซ้ำ คำตอบรับ (ไป/ไม่ไป) ของทุกคนจะถูกล้าง
   */
  const buildUpdate = (e: EditingBooking) => {
    const patch: Record<string, unknown> = {};
    if (roomId !== e.roomId) patch.roomId = roomId;
    if (title.trim() !== e.title) patch.title = title;
    if ((purpose || null) !== e.purpose) patch.purpose = purpose || null;
    if ((notes || null) !== e.notes) patch.notes = notes || null;
    if (dateISO !== e.dateISO || startTime !== e.startTime || endTime !== e.endTime) {
      Object.assign(patch, { dateISO, startTime, endTime });
    }
    if (attendeeCount !== e.attendeeCount) patch.attendeeCount = attendeeCount;
    if (privacy !== e.privacy) patch.privacy = privacy;
    if (priority !== e.priority) patch.priority = priority;
    if ((category.trim() || null) !== e.category) patch.category = category.trim() || null;
    if (!sameList(attendees.map((a) => a.email.toLowerCase()), e.attendees.map((a) => a.email.toLowerCase()))) {
      patch.attendees = attendees.map((a) => ({ email: a.email, displayName: a.displayName, profileId: a.profileId }));
    }
    if (!sameList(selectedAmenities, e.resources)) {
      patch.resources = selectedAmenities.map((amenityCode) => ({ amenityCode }));
    }
    if (e.canEditReminders && reminderLeads !== null && (initialLeads === null || reminderLeads.join(',') !== initialLeads.join(','))) {
      patch.reminderLeads = reminderLeads;
    }
    return patch;
  };

  const submit = async () => {
    if (!room) return;
    setLoading(true);
    setFormError(null);
    setFieldErrors({});
    try {
      if (editing) {
        const patch = buildUpdate(editing);
        if (Object.keys(patch).length === 0) {
          toast.show(t('booking.edit.noChange'), 'info');
          onClose();
          return;
        }
        await apiFetch(`/api/bookings/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ expectedVersion: editing.version, ...patch, ...(editing.isSeries ? { scope } : {}) }),
        });
        toast.show(t('booking.edit.saved'), 'success');
        onSaved?.();
        onClose();
        return;
      }
      const payload = {
        roomId: room.id,
        title,
        purpose: purpose || null,
        notes: notes || null,
        dateISO,
        startTime,
        endTime,
        attendeeCount,
        attendees: attendees.map((a) => ({ email: a.email, displayName: a.displayName, profileId: a.profileId })),
        resources: selectedAmenities.map((amenityCode) => ({ amenityCode })),
        privacy,
        priority,
        category: category.trim() || null,
        idempotencyKey,
        overrideReason: overrideReason || null,
        ...(reminderLeads !== null ? { reminderLeads } : {}),
        recurrence,
      };
      const result = await apiFetch<{ requiresApproval: boolean; skipped?: { dateISO: string; reason: string }[] }>(
        '/api/bookings',
        { method: 'POST', body: JSON.stringify(payload) },
      );
      onCreated?.(result);
      onClose();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setFieldErrors(error.fieldErrors());
        setFormError(error.message);
        if (error.code === 'conflict' && !editing) {
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
      title={editing ? t('booking.edit') : t('booking.new')}
      description={`${room.name} · ${formatThaiDate(dateISO)}`}
      placement="drawer"
      size="sm"
      icon={editing ? '✎' : '＋'}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <span>
              {startTime} – {endTime} · {durationLabel(new Date(0), new Date(effectiveDuration * 60_000))}
              {room.policy.requiresApproval && <span className="ms-2 text-purple-700">· ต้องขออนุมัติ</span>}
            </span>
            <MapLink href={room.mapLink} compact />
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} loading={loading}>
              {editing
                ? loading
                  ? t('booking.edit.saving')
                  : t('booking.edit.save')
                : loading
                  ? t('booking.submitting')
                  : t('booking.submit')}
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

        {editing?.isSeries && (
          <fieldset className="flex flex-col gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-950">
            <legend className="px-1 font-medium">{t('booking.edit.scope')}</legend>
            {(['this', 'series'] as const).map((value) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="bk-edit-scope"
                  className="size-5 accent-brand-700"
                  checked={scope === value}
                  onChange={() => {
                    setScope(value);
                    // แก้ทั้งชุดคงวันที่ของแต่ละครั้งไว้ — คืนวันที่เดิมถ้าเคยเปลี่ยนไว้
                    if (value === 'series') setDateISO(editing.dateISO);
                  }}
                />
                {t(value === 'this' ? 'booking.edit.scopeThis' : 'booking.edit.scopeSeries')}
              </label>
            ))}
          </fieldset>
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
          {/* การ์ดห้องที่เลือก: รูป ชื่อ ความจุ แผนที่ (แบบจาก Stitch) */}
          <div className="flex items-center gap-3 rounded-xl border border-ink-200 bg-white p-2 sm:col-span-2">
            <span
              aria-hidden="true"
              className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-100 text-lg"
              style={room.photos[0] ? { backgroundImage: `url(${room.photos[0]})`, backgroundSize: 'cover' } : undefined}
            >
              {!room.photos[0] && '🚪'}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-bold text-ink-900">{room.name}</span>
              <span className="truncate text-xs text-ink-600">
                {room.floor ? `ชั้น ${room.floor} · ` : ''}
                {t('booking.capacity')} {room.capacity} {t('common.people')}
              </span>
            </span>
            <MapLink href={room.mapLink} compact className="ms-auto shrink-0" />
          </div>
          <Field
            label={t('booking.date')}
            htmlFor="bk-date"
            required
            error={fieldErrors.dateISO}
            hint={scope === 'series' ? t('booking.edit.seriesDateHint') : undefined}
          >
            <Input
              id="bk-date"
              type="date"
              value={dateISO}
              onChange={(event) => setDateISO(event.target.value)}
              required
              // จองหรือย้ายไปวันข้างหน้าได้ ย้อนหลังไม่ได้ (ระบบตรวจซ้ำที่ฝั่ง server)
              min={toDateISO(new Date())}
              disabled={scope === 'series'}
            />
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
            label={t('booking.endTime')}
            htmlFor="bk-end"
            required
            error={fieldErrors.endsAt ?? fieldErrors.endTime}
            hint={t('booking.endTimeHint', { duration: durationLabel(new Date(0), new Date(effectiveDuration * 60_000)) })}
          >
            <Select id="bk-end" value={endTime} onChange={(event) => setChosenEndTime(event.target.value)}>
              {endOptions.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
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
            <div className="relative">
              <Input
                id="bk-count"
                type="number"
                min={1}
                max={1000}
                value={attendeeCount}
                onChange={(event) => setAttendeeCount(Number(event.target.value))}
                aria-invalid={Boolean(fieldErrors.attendeeCount)}
                className="pe-14"
              />
              <span
                aria-hidden="true"
                className={cx(
                  'pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs tabular-nums',
                  attendeeCount > room.capacity ? 'font-bold text-red-700' : 'text-ink-600',
                )}
              >
                / {room.capacity}
              </span>
            </div>
          </Field>
          <Field label={t('booking.privacy')} htmlFor="bk-privacy">
            <Select id="bk-privacy" value={privacy} onChange={(event) => setPrivacy(event.target.value as typeof privacy)}>
              <option value="public">{t('booking.privacy.public')}</option>
              <option value="busy_only">{t('booking.privacy.busy_only')}</option>
              <option value="private">{t('booking.privacy.private')}</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('booking.priority')} htmlFor="bk-priority">
            <Select id="bk-priority" value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}>
              {(['normal', 'urgent', 'vip', 'internal'] as const).map((p) => (
                <option key={p} value={p}>
                  {t(`booking.priority.${p}` as 'booking.priority.normal')}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('booking.category')} htmlFor="bk-category" hint={t('booking.categoryHint')} error={fieldErrors.category}>
            <Input id="bk-category" value={category} onChange={(event) => setCategory(event.target.value)} maxLength={40} />
          </Field>
        </div>

        <Field label={t('booking.attendees')} htmlFor="bk-attendees">
          <AttendeePicker id="bk-attendees" value={attendees} onChange={setAttendees} error={fieldErrors.attendees} />
        </Field>

        {showReminders && reminderLeads !== null && <ReminderEditor id="bk-reminders" value={reminderLeads} onChange={setReminderLeads} />}
        {fieldErrors.reminderLeads && <p className="text-xs text-red-700">{fieldErrors.reminderLeads}</p>}

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
                    'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium',
                    active ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50',
                    !available && 'opacity-60',
                  )}
                  title={available ? undefined : 'ห้องนี้ไม่มีอุปกรณ์นี้ประจำห้อง จะถูกบันทึกเป็นคำขอบริการเสริม'}
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      'flex size-4 items-center justify-center rounded border text-[0.625rem]',
                      active ? 'border-brand-500 bg-brand-500 text-white' : 'border-ink-300 bg-white',
                    )}
                  >
                    {active ? '✓' : ''}
                  </span>
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

        {!editing && <RecurrencePicker dateISO={dateISO} onChange={setRecurrence} />}

        {canOverride && !editing && (
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
