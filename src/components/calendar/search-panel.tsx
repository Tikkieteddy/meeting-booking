'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Amenity, Room } from '@/lib/domain/rooms';
import type { BookingSearchResult } from '@/lib/domain/search';
import { Button, EmptyState, Field, Input, Select, SkeletonBlock, StatusBadge, cx } from '@/components/ui/primitives';
import { Overlay } from '@/components/ui/overlay';
import { apiFetch } from '@/lib/client/api';
import { t } from '@/lib/i18n';
import { formatThaiDate, toTimeHHmm } from '@/lib/util/time';

type SearchMode = 'rooms' | 'bookings' | 'slots';

type RoomResult = Room & { nextFreeFrom: string | null; isFreeNow: boolean };
type SlotResult = { room: Room; matchedAmenities: string[] };

type SearchResponse = {
  mode: SearchMode;
  parsed: { capacity: number | null; dateISO: string | null; startTime: string | null; endTime: string | null; amenityCodes: string[]; text: string };
  rooms?: RoomResult[];
  bookings?: BookingSearchResult[];
  slots?: SlotResult[];
};

const RECENT_KEY = 'tnn-meeting:recent-search';

/**
 * แผงค้นหา (บรีฟข้อ 4)
 *  - ค้นหาห้อง / ชื่อผู้จอง / ช่วงเวลาว่าง ในช่องเดียว พร้อมตัวกรองเพิ่มเติม
 *  - debounce 300 มิลลิวินาที และยกเลิก request เก่าอัตโนมัติ
 *  - มีสถานะ Loading / Empty / Error และปุ่มล้างเงื่อนไขทั้งหมด
 */
export function SearchPanel({
  open,
  onClose,
  initialQuery,
  amenities,
  buildings,
  onOpenRoom,
  onOpenBooking,
  onBookSlot,
}: {
  open: boolean;
  onClose: () => void;
  initialQuery: string;
  amenities: Amenity[];
  buildings: { id: string; name: string }[];
  onOpenRoom: (roomId: string, dateISO?: string) => void;
  onOpenBooking: (bookingId: string) => void;
  onBookSlot: (roomId: string, dateISO: string, startTime: string) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<SearchMode | 'auto'>('auto');
  const [capacity, setCapacity] = useState('');
  const [buildingId, setBuildingId] = useState('');
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [dateISO, setDateISO] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw) as string[]);
    } catch {
      /* localStorage อาจถูกปิด — ไม่ถือเป็นข้อผิดพลาด */
    }
  }, []);

  const rememberQuery = useCallback((value: string) => {
    if (!value.trim()) return;
    setRecent((prev) => {
      const next = [value, ...prev.filter((v) => v !== value)].slice(0, 5);
      try {
        // เก็บเฉพาะคำค้นทั่วไป ไม่เก็บข้อมูลอ่อนไหว
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* ไม่เป็นไร */
      }
      return next;
    });
  }, []);

  const runSearch = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('q', query);
      params.set('mode', mode);
      if (capacity) params.set('capacity', capacity);
      if (buildingId) params.set('buildingId', buildingId);
      if (dateISO) params.set('date', dateISO);
      if (startTime) params.set('startTime', startTime);
      if (endTime) params.set('endTime', endTime);
      for (const code of selectedAmenities) params.append('amenities', code);

      const data = await apiFetch<SearchResponse>(`/api/search?${params.toString()}`, { signal: controller.signal });
      setResult(data);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : t('common.unknownError'));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [query, mode, capacity, buildingId, dateISO, startTime, endTime, selectedAmenities]);

  // debounce 300ms ตามบรีฟ (250-400ms)
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void runSearch(), 300);
    return () => window.clearTimeout(timer);
  }, [open, runSearch]);

  const clearAll = () => {
    setQuery('');
    setMode('auto');
    setCapacity('');
    setBuildingId('');
    setSelectedAmenities([]);
    setDateISO('');
    setStartTime('');
    setEndTime('');
  };

  const chips: { label: string; onRemove: () => void }[] = [
    capacity ? { label: `≥ ${capacity} ${t('common.people')}`, onRemove: () => setCapacity('') } : null,
    buildingId
      ? { label: buildings.find((b) => b.id === buildingId)?.name ?? t('search.building'), onRemove: () => setBuildingId('') }
      : null,
    dateISO ? { label: formatThaiDate(dateISO), onRemove: () => setDateISO('') } : null,
    startTime ? { label: `เริ่ม ${startTime}`, onRemove: () => setStartTime('') } : null,
    endTime ? { label: `ถึง ${endTime}`, onRemove: () => setEndTime('') } : null,
    ...selectedAmenities.map((code) => ({
      label: amenities.find((a) => a.code === code)?.nameTh ?? code,
      onRemove: () => setSelectedAmenities((prev) => prev.filter((c) => c !== code)),
    })),
  ].filter(Boolean) as { label: string; onRemove: () => void }[];

  const activeMode = result?.mode ?? 'rooms';

  return (
    <Overlay open={open} onClose={onClose} title={t('common.search')} size="lg">
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Input

            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onBlur={() => rememberQuery(query)}
            placeholder={t('search.placeholder')}
            aria-label={t('common.search')}
          />
          <Button variant="secondary" onClick={clearAll}>
            {t('common.clearAll')}
          </Button>
        </div>

        {recent.length > 0 && !query && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-ink-500">{t('search.recent')}:</span>
            {recent.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setQuery(item)}
                className="rounded-full bg-ink-100 px-2.5 py-1 text-ink-700 hover:bg-ink-200"
              >
                {item}
              </button>
            ))}
          </div>
        )}

        <details className="rounded-xl border border-ink-200 p-3">
          <summary className="cursor-pointer text-sm font-medium text-ink-700">{t('search.advanced')}</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label={t('search.capacity')} htmlFor="f-capacity">
              <Input id="f-capacity" type="number" min={1} value={capacity} onChange={(event) => setCapacity(event.target.value)} />
            </Field>
            <Field label={t('search.building')} htmlFor="f-building">
              <Select id="f-building" value={buildingId} onChange={(event) => setBuildingId(event.target.value)}>
                <option value="">{t('common.all')}</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('search.date')} htmlFor="f-date">
              <Input id="f-date" type="date" value={dateISO} onChange={(event) => setDateISO(event.target.value)} />
            </Field>
            <Field label={t('search.startTime')} htmlFor="f-start">
              <Input id="f-start" type="time" step={900} value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            </Field>
            <Field label={t('search.endTime')} htmlFor="f-end">
              <Input id="f-end" type="time" step={900} value={endTime} onChange={(event) => setEndTime(event.target.value)} />
            </Field>
            <Field label={t('search.amenities')} htmlFor="f-amenities">
              <div className="flex flex-wrap gap-1.5">
                {amenities.map((a) => {
                  const active = selectedAmenities.includes(a.code);
                  return (
                    <button
                      key={a.code}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setSelectedAmenities((prev) =>
                          prev.includes(a.code) ? prev.filter((c) => c !== a.code) : [...prev, a.code],
                        )
                      }
                      className={cx(
                        'rounded-full border px-2.5 py-1 text-xs',
                        active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-600',
                      )}
                    >
                      {a.nameTh}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
        </details>

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <span key={chip.label} className="flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-800">
                {chip.label}
                <button type="button" onClick={chip.onRemove} aria-label={`ลบเงื่อนไข ${chip.label}`} className="text-brand-600">
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        <div role="tablist" aria-label="ประเภทผลการค้นหา" className="flex gap-1 border-b border-ink-200">
          {(
            [
              ['rooms', t('search.tabRooms')],
              ['bookings', t('search.tabBookings')],
              ['slots', t('search.tabSlots')],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              type="button"
              aria-selected={activeMode === value}
              onClick={() => setMode(value)}
              className={cx(
                '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
                activeMode === value ? 'border-brand-500 text-brand-700' : 'border-transparent text-ink-500',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex flex-col gap-2">
            <SkeletonBlock className="h-16" />
            <SkeletonBlock className="h-16" />
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
            {error}
            <button type="button" onClick={() => void runSearch()} className="ms-2 underline">
              {t('common.retry')}
            </button>
          </div>
        )}

        {!loading && !error && result && (
          <div className="flex flex-col gap-2">
            {activeMode === 'rooms' &&
              (result.rooms?.length ? (
                result.rooms.map((room) => (
                  <div key={room.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-900">{room.name}</p>
                      <p className="truncate text-xs text-ink-500">
                        {room.code} · {room.capacity} {t('common.people')}
                        {room.buildingName ? ` · ${room.buildingName}` : ''}
                        {room.floor ? ` ชั้น ${room.floor}` : ''}
                      </p>
                      <p className="mt-1 flex flex-wrap gap-1 text-[11px] text-ink-600">
                        {room.amenities.map((a) => (
                          <span key={a.code} className="rounded bg-ink-100 px-1.5 py-0.5">
                            {a.nameTh}
                          </span>
                        ))}
                      </p>
                    </div>
                    <p className="text-xs">
                      {room.isFreeNow ? (
                        <span className="font-medium text-emerald-700">● ว่างตอนนี้</span>
                      ) : (
                        <span className="text-amber-700">
                          {t('search.nextFree')} {room.nextFreeFrom ? toTimeHHmm(new Date(room.nextFreeFrom)) : '-'}
                        </span>
                      )}
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => onOpenRoom(room.id)}>
                        {t('search.viewCalendar')}
                      </Button>
                      <Button size="sm" onClick={() => onBookSlot(room.id, dateISO || result.parsed.dateISO || todayISO(), startTime || result.parsed.startTime || room.policy.openTime)}>
                        {t('search.bookNow')}
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState title={t('search.noResult')} description={t('search.noResultHint')} />
              ))}

            {activeMode === 'bookings' &&
              (result.bookings?.length ? (
                result.bookings.map((booking) => (
                  <button
                    key={booking.id}
                    type="button"
                    onClick={() => onOpenBooking(booking.id)}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 p-3 text-start hover:bg-ink-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-900">{booking.title}</p>
                      <p className="truncate text-xs text-ink-500">
                        {booking.roomName} · {formatThaiDate(booking.startsAt.slice(0, 10))}{' '}
                        {toTimeHHmm(new Date(booking.startsAt))}–{toTimeHHmm(new Date(booking.endsAt))}
                      </p>
                      {booking.bookerName && <p className="text-xs text-ink-600">{booking.bookerName}</p>}
                    </div>
                    <StatusBadge status={booking.status} label={t(`status.${booking.status}` as 'status.confirmed')} />
                  </button>
                ))
              ) : (
                <EmptyState title={t('search.noResult')} description="ลองค้นด้วยชื่อ อีเมล หรือชื่อแผนกของผู้จอง" />
              ))}

            {activeMode === 'slots' &&
              (result.slots?.length ? (
                result.slots.map(({ room }) => (
                  <div key={room.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-900">{room.name}</p>
                      <p className="text-xs text-ink-600">
                        ว่างช่วง {result.parsed.startTime ?? startTime} – {result.parsed.endTime ?? endTime} ·{' '}
                        {room.capacity} {t('common.people')}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() =>
                        onBookSlot(
                          room.id,
                          result.parsed.dateISO ?? dateISO ?? todayISO(),
                          result.parsed.startTime ?? startTime ?? room.policy.openTime,
                        )
                      }
                    >
                      {t('search.bookNow')}
                    </Button>
                  </div>
                ))
              ) : (
                <EmptyState
                  title={t('search.noResult')}
                  description="ระบุวันที่และช่วงเวลา เช่น “พรุ่งนี้ 13:00 ถึง 15:00 12 คน” เพื่อค้นหาห้องว่าง"
                />
              ))}
          </div>
        )}
      </div>
    </Overlay>
  );
}

function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
}
