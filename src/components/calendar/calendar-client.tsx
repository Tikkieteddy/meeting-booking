'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CalendarData, CalendarView, CalendarBooking } from '@/lib/domain/calendar-shared';
import type { Amenity, Room } from '@/lib/domain/rooms';
import { ErrorState } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/client/api';
import { t } from '@/lib/i18n';
import { addDaysISO, startOfWeekISO } from '@/lib/util/time';
import { BookingForm, type BookingFormPreset } from '@/components/booking/booking-form';
import { BookingDetailDrawer } from '@/components/booking/booking-detail';
import { CalendarToolbar } from './toolbar';
import { DayView } from './day-view';
import { WeekView } from './week-view';
import { MonthView } from './month-view';
import { SearchPanel } from './search-panel';
import { GuidedTour } from '@/components/tutorial/guided-tour';

/**
 * ตัวควบคุมหน้าปฏิทิน
 * ★ AC01: สลับ วัน/สัปดาห์/เดือน แล้วปฏิทินเปลี่ยนเต็มพื้นที่ทีละมุมมอง ไม่แสดงพร้อมกัน
 * ★ ห้องที่เลือก วันที่ และตัวกรองคงค่าเดิมขณะสลับมุมมอง (เก็บใน URL ด้วย)
 */
export function CalendarClient({
  rooms,
  amenities,
  buildings,
  initialData,
  initialView,
  initialDateISO,
  initialRoomId,
  canBook,
  canOverride,
  showTutorial,
}: {
  rooms: Room[];
  amenities: Amenity[];
  buildings: { id: string; name: string }[];
  initialData: CalendarData;
  initialView: CalendarView;
  initialDateISO: string;
  initialRoomId: string | null;
  canBook: boolean;
  canOverride: boolean;
  showTutorial: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [view, setView] = useState<CalendarView>(initialView);
  const [dateISO, setDateISO] = useState(initialDateISO);
  const [roomId, setRoomId] = useState<string | null>(initialRoomId);
  const [data, setData] = useState<CalendarData>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formPreset, setFormPreset] = useState<BookingFormPreset>({ roomId: initialRoomId, dateISO: initialDateISO, startTime: null });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [conflictSlotKey, setConflictSlotKey] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const firstRender = useRef(true);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ view, date: dateISO });
      if (roomId) params.set('roomId', roomId);
      const result = await apiFetch<CalendarData>(`/api/calendar?${params.toString()}`, { signal: controller.signal });
      setData(result);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : t('calendar.loadFailed'));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [view, dateISO, roomId]);

  // ซิงก์ค่าลง URL เพื่อให้แชร์ลิงก์ได้และกดย้อนกลับได้
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const params = new URLSearchParams({ view, date: dateISO });
    if (roomId) params.set('room', roomId);
    router.replace(`/calendar?${params.toString()}`, { scroll: false });
    void load();
  }, [view, dateISO, roomId, router, load]);

  const refresh = useCallback(() => void load(), [load]);

  const openSlot = (targetRoomId: string, startTime: string, targetDateISO = dateISO) => {
    if (!canBook) {
      toast.show(t('error.forbidden'), 'error');
      return;
    }
    setFormPreset({ roomId: targetRoomId, dateISO: targetDateISO, startTime });
    setFormOpen(true);
  };

  const handleConflict = (conflictRoomId: string, startTime: string) => {
    setConflictSlotKey(`${conflictRoomId}|${startTime}`);
    window.setTimeout(() => setConflictSlotKey(null), 2500);
  };

  const openBooking = (booking: CalendarBooking) => setDetailId(booking.id);

  const weekStart = startOfWeekISO(dateISO, 1);

  return (
    <>
      <CalendarToolbar
        view={view}
        dateISO={dateISO}
        rooms={rooms}
        selectedRoomId={roomId}
        searchValue={searchValue}
        onViewChange={setView}
        onDateChange={setDateISO}
        onRoomChange={setRoomId}
        onSearchChange={setSearchValue}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenBooking={() => {
          setFormPreset({ roomId, dateISO, startTime: null });
          setFormOpen(true);
        }}
        canBook={canBook}
        loading={loading}
      />

      {/* พื้นที่ปฏิทิน — เลื่อนเฉพาะในกรอบนี้ หน้าหลักไม่ต้องเลื่อน (บรีฟข้อ 1, AC09) */}
      <section
        aria-label={`ปฏิทิน${t(`view.${view}` as 'view.day')}`}
        className="flex min-h-0 flex-1 flex-col bg-white"
      >
        {error ? (
          <div className="p-6">
            <ErrorState message={error} onRetry={refresh} />
          </div>
        ) : view === 'day' ? (
          <DayView
            dateISO={dateISO}
            rooms={rooms}
            selectedRoomId={roomId}
            bookings={data.bookings}
            closures={data.closures}
            onOpenBooking={openBooking}
            onPickSlot={(targetRoomId, startTime) => openSlot(targetRoomId, startTime)}
            conflictSlotKey={conflictSlotKey}
          />
        ) : view === 'week' ? (
          <WeekView
            startISO={weekStart}
            rooms={rooms}
            selectedRoomId={roomId}
            bookings={data.bookings}
            closures={data.closures}
            holidays={data.holidays}
            onOpenBooking={openBooking}
            onPickSlot={(targetRoomId, startTime, targetDate) => openSlot(targetRoomId, startTime, targetDate)}
          />
        ) : (
          <MonthView
            monthDateISO={dateISO}
            days={data.monthDays}
            bookings={data.bookings}
            onPickDay={(picked) => {
              setDateISO(picked);
              setView('day');
            }}
          />
        )}
      </section>

      {formOpen && (
        <BookingForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          rooms={rooms}
          amenities={amenities}
          preset={formPreset}
          canOverride={canOverride}
          onConflict={handleConflict}
          onCreated={(result) => {
            toast.show(result.requiresApproval ? t('booking.createdPending') : t('booking.created'), 'success');
            if (result.skipped?.length) {
              toast.show(`ข้าม ${result.skipped.length} ครั้งที่ชนเวลา — ดูรายละเอียดในหน้าการจองของฉัน`, 'info');
            }
            refresh();
          }}
        />
      )}

      <BookingDetailDrawer bookingId={detailId} open={detailId !== null} onClose={() => setDetailId(null)} onChanged={refresh} />

      <SearchPanel
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        initialQuery={searchValue}
        rooms={rooms}
        amenities={amenities}
        buildings={buildings}
        onOpenRoom={(targetRoomId, targetDate) => {
          setRoomId(targetRoomId);
          if (targetDate) setDateISO(targetDate);
          setView('day');
          setSearchOpen(false);
        }}
        onOpenBooking={(bookingId) => {
          setSearchOpen(false);
          setDetailId(bookingId);
        }}
        onBookSlot={(targetRoomId, targetDate, startTime) => {
          setSearchOpen(false);
          setRoomId(targetRoomId);
          setDateISO(targetDate);
          openSlot(targetRoomId, startTime, targetDate);
        }}
      />

      {showTutorial && <GuidedTour onFinish={() => void apiFetch('/api/profile/onboarded', { method: 'POST' })} />}
    </>
  );
}

export function nextWeekISO(dateISO: string): string {
  return addDaysISO(dateISO, 7);
}
