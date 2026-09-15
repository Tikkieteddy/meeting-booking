'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Amenity, Room } from '@/lib/domain/rooms';
import { Badge, Button, Checkbox, Field, Input, Select, Textarea, cx } from '@/components/ui/primitives';
import { ConfirmDialog, Overlay } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/client/api';
import { t } from '@/lib/i18n';
import { thaiWeekday } from '@/lib/util/time';

type Props = {
  rooms: Room[];
  amenities: Amenity[];
  buildings: { id: string; name: string }[];
  approvers: { id: string; fullName: string }[];
};

const ROOM_TYPES = [
  { value: 'meeting', label: 'ห้องประชุมทั่วไป' },
  { value: 'board', label: 'ห้องประชุมผู้บริหาร' },
  { value: 'training', label: 'ห้องฝึกอบรม' },
  { value: 'studio', label: 'สตูดิโอ' },
  { value: 'huddle', label: 'ห้องย่อย' },
];

function emptyRoom(): RoomFormState {
  return {
    code: '',
    name: '',
    description: '',
    floor: '',
    locationHint: '',
    capacity: 8,
    roomType: 'meeting',
    buildingId: '',
    color: '#EC5F27',
    amenityCodes: [],
    approverProfileIds: [],
    openTime: '08:00',
    closeTime: '20:00',
    openDays: [1, 2, 3, 4, 5],
    slotStepMinutes: 30,
    minDurationMinutes: 30,
    maxDurationMinutes: 240,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    bookingHorizonDays: 90,
    cancelWindowMinutes: 0,
    requiresApproval: false,
    checkInRequired: false,
    checkInGraceMinutes: 15,
    waitlistEnabled: false,
    sortOrder: 100,
    isActive: true,
  };
}

type RoomFormState = {
  code: string;
  name: string;
  description: string;
  floor: string;
  locationHint: string;
  capacity: number;
  roomType: string;
  buildingId: string;
  color: string;
  amenityCodes: string[];
  approverProfileIds: string[];
  openTime: string;
  closeTime: string;
  openDays: number[];
  slotStepMinutes: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  bookingHorizonDays: number;
  cancelWindowMinutes: number;
  requiresApproval: boolean;
  checkInRequired: boolean;
  checkInGraceMinutes: number;
  waitlistEnabled: boolean;
  sortOrder: number;
  isActive: boolean;
};

function toFormState(room: Room): RoomFormState {
  return {
    code: room.code,
    name: room.name,
    description: room.description ?? '',
    floor: room.floor ?? '',
    locationHint: room.locationHint ?? '',
    capacity: room.capacity,
    roomType: room.roomType,
    buildingId: room.buildingId ?? '',
    color: room.color,
    amenityCodes: room.amenities.map((a) => a.code),
    approverProfileIds: [],
    openTime: room.policy.openTime,
    closeTime: room.policy.closeTime,
    openDays: room.policy.openDays,
    slotStepMinutes: room.policy.slotStepMinutes,
    minDurationMinutes: room.policy.minDurationMinutes,
    maxDurationMinutes: room.policy.maxDurationMinutes,
    bufferBeforeMinutes: room.policy.bufferBeforeMinutes,
    bufferAfterMinutes: room.policy.bufferAfterMinutes,
    bookingHorizonDays: room.policy.bookingHorizonDays,
    cancelWindowMinutes: room.policy.cancelWindowMinutes,
    requiresApproval: room.policy.requiresApproval,
    checkInRequired: room.policy.checkInRequired,
    checkInGraceMinutes: room.policy.checkInGraceMinutes,
    waitlistEnabled: room.policy.waitlistEnabled,
    sortOrder: room.sortOrder,
    isActive: room.isActive,
  };
}

/**
 * จัดการห้องประชุม (บรีฟข้อ 9 และ AC06)
 * เพิ่มห้องแล้วห้องจะปรากฏใน dropdown, ค้นหา และปฏิทินทันทีโดยไม่ต้องแก้โค้ด
 */
export function RoomManager({ rooms, amenities, buildings, approvers }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<{ id: string | null; state: RoomFormState } | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Room | null>(null);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setFieldErrors({});
    try {
      const payload = {
        ...editing.state,
        description: editing.state.description || null,
        floor: editing.state.floor || null,
        locationHint: editing.state.locationHint || null,
        buildingId: editing.state.buildingId || null,
      };
      if (editing.id) {
        await apiFetch(`/api/rooms/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/api/rooms', { method: 'POST', body: JSON.stringify(payload) });
      }
      toast.show(editing.id ? 'บันทึกห้องแล้ว' : 'เพิ่มห้องใหม่แล้ว ห้องพร้อมใช้งานทันที', 'success');
      setEditing(null);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setFieldErrors(error.fieldErrors());
        toast.show(error.message, 'error');
      } else toast.show(t('common.unknownError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleArchive = async (room: Room, restore: boolean) => {
    setBusy(true);
    try {
      await apiFetch(`/api/rooms/${room.id}/archive`, {
        method: 'POST',
        body: JSON.stringify({ action: restore ? 'restore' : 'archive' }),
      });
      toast.show(restore ? 'นำห้องกลับมาใช้แล้ว' : 'เก็บห้องเข้าคลังแล้ว', 'success');
      setArchiveTarget(null);
      router.refresh();
    } catch (error) {
      toast.show(error instanceof ApiClientError ? error.message : t('common.unknownError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const state = editing?.state;
  const update = (patch: Partial<RoomFormState>) =>
    setEditing((prev) => (prev ? { ...prev, state: { ...prev.state, ...patch } } : prev));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-ink-900">{t('nav.rooms')}</h1>
        <Button onClick={() => setEditing({ id: null, state: emptyRoom() })}>
          <span aria-hidden="true">＋</span> {t('room.addNew')}
        </Button>
      </div>

      <ul className="flex flex-col gap-2">
        {rooms.map((room) => (
          <li
            key={room.id}
            className={cx('flex flex-wrap items-center gap-3 rounded-xl border p-3', room.archivedAt ? 'border-ink-200 bg-ink-50' : 'border-ink-200 bg-white')}
          >
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-900">
                {room.name}
                <span className="text-xs font-normal text-ink-500">{room.code}</span>
                {room.archivedAt && <Badge>{t('room.archived')}</Badge>}
                {room.policy.requiresApproval && <Badge tone="warn">{t('room.requiresApproval')}</Badge>}
                {room.policy.waitlistEnabled && <Badge tone="brand">คิวรอ</Badge>}
              </p>
              <p className="text-xs text-ink-500">
                {room.capacity} {t('common.people')}
                {room.buildingName ? ` · ${room.buildingName}` : ''}
                {room.floor ? ` ชั้น ${room.floor}` : ''} · {room.policy.openTime}–{room.policy.closeTime} · ช่วงละ{' '}
                {room.policy.slotStepMinutes} นาที
              </p>
              {room.amenities.length > 0 && (
                <p className="mt-1 flex flex-wrap gap-1 text-[11px] text-ink-600">
                  {room.amenities.map((a) => (
                    <span key={a.code} className="rounded bg-ink-100 px-1.5 py-0.5">
                      {a.nameTh}
                    </span>
                  ))}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEditing({ id: room.id, state: toFormState(room) })}>
                {t('common.edit')}
              </Button>
              {room.archivedAt ? (
                <Button size="sm" variant="ghost" onClick={() => toggleArchive(room, true)} disabled={busy}>
                  {t('room.restore')}
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setArchiveTarget(room)} disabled={busy}>
                  {t('room.archive')}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {editing && state && (
        <Overlay
          open
          onClose={() => setEditing(null)}
          title={editing.id ? 'แก้ไขห้องประชุม' : t('room.addNew')}
          size="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button onClick={save} loading={busy}>
                {t('common.save')}
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('room.code')} htmlFor="r-code" required error={fieldErrors.code} hint="ใช้ A-Z 0-9 . _ - เช่น TNN-A-301">
                <Input id="r-code" value={state.code} onChange={(e) => update({ code: e.target.value })} required />
              </Field>
              <Field label={t('room.name')} htmlFor="r-name" required error={fieldErrors.name}>
                <Input id="r-name" value={state.name} onChange={(e) => update({ name: e.target.value })} required />
              </Field>
              <Field label={t('room.building')} htmlFor="r-building">
                <Select id="r-building" value={state.buildingId} onChange={(e) => update({ buildingId: e.target.value })}>
                  <option value="">ไม่ระบุ</option>
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('room.floor')} htmlFor="r-floor">
                <Input id="r-floor" value={state.floor} onChange={(e) => update({ floor: e.target.value })} />
              </Field>
              <Field label={t('room.capacity')} htmlFor="r-capacity" required error={fieldErrors.capacity}>
                <Input
                  id="r-capacity"
                  type="number"
                  min={1}
                  value={state.capacity}
                  onChange={(e) => update({ capacity: Number(e.target.value) })}
                />
              </Field>
              <Field label="ประเภทห้อง" htmlFor="r-type">
                <Select id="r-type" value={state.roomType} onChange={(e) => update({ roomType: e.target.value })}>
                  {ROOM_TYPES.map((tp) => (
                    <option key={tp.value} value={tp.value}>
                      {tp.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="คำอธิบาย" htmlFor="r-desc" error={fieldErrors.description}>
              <Textarea id="r-desc" value={state.description} onChange={(e) => update({ description: e.target.value })} />
            </Field>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-ink-700">{t('room.amenities')}</legend>
              <div className="flex flex-wrap gap-2">
                {amenities.map((a) => {
                  const active = state.amenityCodes.includes(a.code);
                  return (
                    <button
                      key={a.code}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        update({
                          amenityCodes: active
                            ? state.amenityCodes.filter((c) => c !== a.code)
                            : [...state.amenityCodes, a.code],
                        })
                      }
                      className={cx(
                        'rounded-full border px-3 py-1.5 text-xs font-medium',
                        active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-600',
                      )}
                    >
                      {a.nameTh}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-3 rounded-xl border border-ink-200 p-3">
              <legend className="px-1 text-sm font-medium text-ink-700">{t('room.openHours')}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="เปิด" htmlFor="r-open">
                  <Input id="r-open" type="time" step={900} value={state.openTime} onChange={(e) => update({ openTime: e.target.value })} />
                </Field>
                <Field label="ปิด" htmlFor="r-close">
                  <Input id="r-close" type="time" step={900} value={state.closeTime} onChange={(e) => update({ closeTime: e.target.value })} />
                </Field>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                  const active = state.openDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        update({ openDays: active ? state.openDays.filter((d) => d !== day) : [...state.openDays, day].sort() })
                      }
                      className={cx(
                        'rounded-lg border px-3 py-1.5 text-xs font-medium',
                        active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-500',
                      )}
                    >
                      {thaiWeekday(day, true)}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={`${t('room.slotStep')} (นาที)`} htmlFor="r-step" error={fieldErrors.slotStepMinutes}>
                <Select
                  id="r-step"
                  value={String(state.slotStepMinutes)}
                  onChange={(e) => update({ slotStepMinutes: Number(e.target.value) })}
                >
                  {[5, 10, 15, 20, 30, 60].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={`${t('room.minDuration')} (นาที)`} htmlFor="r-min">
                <Input id="r-min" type="number" min={5} value={state.minDurationMinutes} onChange={(e) => update({ minDurationMinutes: Number(e.target.value) })} />
              </Field>
              <Field label={`${t('room.maxDuration')} (นาที)`} htmlFor="r-max" error={fieldErrors.maxDurationMinutes}>
                <Input id="r-max" type="number" min={5} value={state.maxDurationMinutes} onChange={(e) => update({ maxDurationMinutes: Number(e.target.value) })} />
              </Field>
              <Field label={`${t('room.bufferBefore')} (นาที)`} htmlFor="r-bb">
                <Input id="r-bb" type="number" min={0} value={state.bufferBeforeMinutes} onChange={(e) => update({ bufferBeforeMinutes: Number(e.target.value) })} />
              </Field>
              <Field label={`${t('room.bufferAfter')} (นาที)`} htmlFor="r-ba">
                <Input id="r-ba" type="number" min={0} value={state.bufferAfterMinutes} onChange={(e) => update({ bufferAfterMinutes: Number(e.target.value) })} />
              </Field>
              <Field label="จองล่วงหน้าได้ (วัน)" htmlFor="r-horizon">
                <Input id="r-horizon" type="number" min={1} value={state.bookingHorizonDays} onChange={(e) => update({ bookingHorizonDays: Number(e.target.value) })} />
              </Field>
              <Field label="ยกเลิกล่วงหน้าอย่างน้อย (นาที)" htmlFor="r-cancel" hint="0 = ยกเลิกได้ตลอด">
                <Input id="r-cancel" type="number" min={0} value={state.cancelWindowMinutes} onChange={(e) => update({ cancelWindowMinutes: Number(e.target.value) })} />
              </Field>
              <Field label={`${t('room.checkInGrace')} (นาที)`} htmlFor="r-grace">
                <Input id="r-grace" type="number" min={0} value={state.checkInGraceMinutes} onChange={(e) => update({ checkInGraceMinutes: Number(e.target.value) })} />
              </Field>
              <Field label="ลำดับการแสดง" htmlFor="r-sort">
                <Input id="r-sort" type="number" min={0} value={state.sortOrder} onChange={(e) => update({ sortOrder: Number(e.target.value) })} />
              </Field>
            </div>

            <div className="flex flex-col gap-2.5">
              <Checkbox
                label={t('room.requiresApproval')}
                description="การจองจะขึ้นสถานะรออนุมัติและแจ้งผู้อนุมัติทันที"
                checked={state.requiresApproval}
                onChange={(e) => update({ requiresApproval: e.target.checked })}
              />
              <Checkbox
                label={t('room.checkInRequired')}
                description="ถ้าไม่เช็กอินภายในเวลาผ่อนผัน ระบบจะปล่อยห้องคืนอัตโนมัติ"
                checked={state.checkInRequired}
                onChange={(e) => update({ checkInRequired: e.target.checked })}
              />
              <Checkbox
                label={t('room.waitlistEnabled')}
                description="เมื่อมีคนยกเลิก ระบบจะแจ้งผู้รอคิวลำดับถัดไป"
                checked={state.waitlistEnabled}
                onChange={(e) => update({ waitlistEnabled: e.target.checked })}
              />
              <Checkbox
                label="เปิดให้จองได้"
                checked={state.isActive}
                onChange={(e) => update({ isActive: e.target.checked })}
              />
            </div>

            {state.requiresApproval && (
              <Field label="ผู้อนุมัติของห้องนี้" htmlFor="r-approvers" hint="กดเลือกได้มากกว่าหนึ่งคน">
                <div className="flex flex-wrap gap-2">
                  {approvers.map((person) => {
                    const active = state.approverProfileIds.includes(person.id);
                    return (
                      <button
                        key={person.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          update({
                            approverProfileIds: active
                              ? state.approverProfileIds.filter((id) => id !== person.id)
                              : [...state.approverProfileIds, person.id],
                          })
                        }
                        className={cx(
                          'rounded-full border px-3 py-1.5 text-xs',
                          active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-600',
                        )}
                      >
                        {person.fullName}
                      </button>
                    );
                  })}
                </div>
              </Field>
            )}
          </div>
        </Overlay>
      )}

      <ConfirmDialog
        open={archiveTarget !== null}
        title={`${t('room.archive')} “${archiveTarget?.name ?? ''}”`}
        body={t('room.cannotDelete')}
        confirmLabel={t('room.archive')}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => archiveTarget && toggleArchive(archiveTarget, false)}
      />
    </>
  );
}
