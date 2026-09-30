'use client';

import type { CalendarView } from '@/lib/domain/calendar-shared';
import { MapLink } from '@/components/ui/map-link';
import type { Room } from '@/lib/domain/rooms';
import { Button, cx } from '@/components/ui/primitives';
import { t } from '@/lib/i18n';
import { addDaysISO, formatThaiDate, formatThaiMonth, startOfWeekISO, thaiWeekday, weekdayOfISO } from '@/lib/util/time';

/**
 * แถบเครื่องมือของหน้าปฏิทิน (บรีฟข้อ 1 และ 2)
 * ประกอบด้วย: เลือกวัน/เดือน · เลือกห้อง (มีรูปห้อง) · ค้นหา · สวิตช์ วัน/สัปดาห์/เดือน · ปุ่มจอง
 * มือถือแบ่งเป็น 2 แถว และย้ายตัวกรองไปไว้ใน Bottom sheet
 */
export function CalendarToolbar({
  view,
  dateISO,
  rooms,
  selectedRoomId,
  searchValue,
  onViewChange,
  onDateChange,
  onRoomChange,
  onSearchChange,
  onOpenSearch,
  onOpenBooking,
  canBook,
  loading,
}: {
  view: CalendarView;
  dateISO: string;
  rooms: Room[];
  selectedRoomId: string | null;
  searchValue: string;
  onViewChange: (view: CalendarView) => void;
  onDateChange: (dateISO: string) => void;
  onRoomChange: (roomId: string | null) => void;
  onSearchChange: (value: string) => void;
  onOpenSearch: () => void;
  onOpenBooking: () => void;
  canBook: boolean;
  loading: boolean;
}) {
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) ?? null;
  const periodLabel = view === 'month' ? formatThaiMonth(dateISO) : formatThaiDate(dateISO);

  const shift = (direction: -1 | 1) => {
    const [y, m, d] = dateISO.split('-').map(Number);
    const base = new Date(Date.UTC(y!, m! - 1, d!));
    if (view === 'day') base.setUTCDate(base.getUTCDate() + direction);
    else if (view === 'week') base.setUTCDate(base.getUTCDate() + 7 * direction);
    else base.setUTCMonth(base.getUTCMonth() + direction);
    onDateChange(
      `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-${String(base.getUTCDate()).padStart(2, '0')}`,
    );
  };

  const today = () => {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now);
    onDateChange(parts);
  };

  // ป้ายช่วงเวลาที่แสดง: "ศุกร์ 12 กันยายน 2568" / "8 – 14 กันยายน 2568" / "กันยายน 2568"
  const periodText =
    view === 'month'
      ? formatThaiMonth(dateISO)
      : view === 'week'
        ? weekRangeLabel(dateISO)
        : `${thaiWeekday(weekdayOfISO(dateISO))} ${periodLabel}`;

  const iconButton =
    'flex size-10 shrink-0 items-center justify-center rounded-lg text-ink-700 hover:bg-ink-100 focus-visible:bg-ink-100';

  return (
    <div className="shrink-0 border-b border-ink-200/70 px-3 pb-3 pt-3 sm:px-6 sm:pt-5">
      {/* แถวที่ 1: ชื่อระบบ · วันที่ · ห้อง · สวิตช์มุมมอง (ตามแบบจาก Stitch) */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="me-2 hidden flex-col xl:flex">
          <p className="text-xl font-bold leading-tight text-ink-900">{t('calendar.title')}</p>
          <p className="text-xs text-ink-600">{t('calendar.subtitle')}</p>
        </div>

        {/* เลือกวันที่: กดที่ป้ายวันที่เพื่อเปิดปฏิทินของเครื่อง */}
        <div
          data-tour="datenav"
          className="flex h-12 w-full items-center gap-0.5 rounded-xl border border-ink-200 bg-white px-1 shadow-sm focus-within:ring-2 focus-within:ring-brand-500/40 sm:w-auto"
        >
          <button type="button" onClick={() => shift(-1)} aria-label={t('common.previous')} className={iconButton}>
            <span aria-hidden="true">‹</span>
          </button>
          <div className="relative flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-2 hover:bg-ink-50 sm:flex-none">
            <span aria-hidden="true" className="text-brand-500">
              📅
            </span>
            <span aria-live="polite" className="truncate whitespace-nowrap text-sm font-semibold text-ink-900">
              {periodText}
            </span>
            <label className="sr-only" htmlFor="calendar-date">
              {t('search.date')}
            </label>
            {/* ช่องวันที่จริงวางทับป้ายแบบโปร่งใส — คลิกแล้วเปิดตัวเลือกวันที่ของเครื่อง พิมพ์ด้วยคีย์บอร์ดได้ */}
            <input
              id="calendar-date"
              type="date"
              value={dateISO}
              onChange={(event) => event.target.value && onDateChange(event.target.value)}
              onClick={(event) => {
                try {
                  event.currentTarget.showPicker?.();
                } catch {
                  // เบราว์เซอร์เก่าไม่มี showPicker — ยังพิมพ์วันที่ได้ตามปกติ
                }
              }}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </div>
          <button type="button" onClick={() => shift(1)} aria-label={t('common.next')} className={iconButton}>
            <span aria-hidden="true">›</span>
          </button>
          <button
            type="button"
            onClick={today}
            className="ms-1 h-9 shrink-0 whitespace-nowrap rounded-lg bg-ink-100 px-3 text-sm font-medium text-ink-800 hover:bg-ink-200"
          >
            {t('common.today')}
          </button>
        </div>

        {/* เลือกห้อง พร้อมรูปห้อง */}
        <div className="flex h-12 min-w-0 basis-full items-center gap-2 rounded-xl border border-ink-200 bg-white ps-1.5 pe-2 shadow-sm sm:max-w-sm sm:basis-auto sm:flex-1 lg:flex-none">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-100 text-base"
            style={selectedRoom?.photos[0] ? { backgroundImage: `url(${selectedRoom.photos[0]})`, backgroundSize: 'cover' } : undefined}
          >
            {!selectedRoom?.photos[0] && (selectedRoom ? '🚪' : '🏢')}
          </span>
          <label className="sr-only" htmlFor="room-picker">
            {t('calendar.selectRoom')}
          </label>
          <select
            data-tour="roompicker"
            id="room-picker"
            value={selectedRoomId ?? ''}
            onChange={(event) => onRoomChange(event.target.value || null)}
            className="h-10 min-w-0 flex-1 cursor-pointer rounded-lg bg-transparent pe-1 text-sm font-semibold text-ink-900 focus:outline-none"
          >
            <option value="">{t('calendar.allRooms')}</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name} ({room.capacity} {t('common.people')})
              </option>
            ))}
          </select>
          <MapLink href={selectedRoom?.mapLink} compact className="hidden shrink-0 sm:inline-flex" />
        </div>

        <div
          data-tour="views"
          role="tablist"
          aria-label={t('view.switchLabel')}
          className="flex w-full rounded-xl bg-ink-100 p-1 sm:ms-auto sm:w-auto"
        >
          {(['day', 'week', 'month'] as CalendarView[]).map((item) => (
            <button
              key={item}
              role="tab"
              type="button"
              aria-selected={view === item}
              aria-label={t(`view.${item}Aria` as 'view.dayAria')}
              onClick={() => onViewChange(item)}
              className={cx(
                'h-10 min-w-16 flex-1 rounded-lg px-3 text-sm font-semibold transition-colors sm:flex-none',
                view === item ? 'bg-brand-500 text-white shadow-sm' : 'text-ink-700 hover:bg-white/70',
              )}
            >
              {t(`view.${item}` as 'view.day')}
            </button>
          ))}
        </div>
      </div>

      {/* แถวที่ 2: ปุ่มจอง · ค้นหา · ตัวกรอง */}
      <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-3">
        {canBook && (
          <Button data-tour="bookbutton" onClick={onOpenBooking} size="md" className="shadow-md">
            <span aria-hidden="true">＋</span>
            <span className="hidden sm:inline">{t('calendar.bookButton')}</span>
            <span className="sm:hidden">จอง</span>
          </Button>
        )}

        <label className="sr-only" htmlFor="calendar-search">
          {t('common.search')}
        </label>
        <div data-tour="search" className="relative min-w-0 flex-1 sm:max-w-md">
          <input
            id="calendar-search"
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            onFocus={onOpenSearch}
            placeholder={t('search.placeholder')}
            className="h-11 w-full rounded-xl border border-ink-200 bg-white ps-10 pe-3 text-sm shadow-sm"
          />
          <span aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm">
            🔍
          </span>
        </div>
        <Button variant="secondary" size="md" onClick={onOpenSearch} className="shrink-0">
          {t('search.advanced')}
        </Button>

        {loading && (
          <span role="status" className="text-xs text-ink-600">
            {t('common.loading')}
          </span>
        )}
      </div>
    </div>
  );
}

/** "8 – 14 กันยายน 2568" (ถ้าข้ามเดือน: "29 กันยายน – 5 ตุลาคม 2568") สัปดาห์เริ่มวันจันทร์ */
function weekRangeLabel(dateISO: string): string {
  const start = startOfWeekISO(dateISO, 1);
  const end = addDaysISO(start, 6);
  const a = formatThaiDate(start);
  const b = formatThaiDate(end);
  if (start.slice(0, 7) === end.slice(0, 7)) return `${Number(start.slice(8, 10))} – ${b}`;
  return `${a.replace(/ \d+$/, '')} – ${b}`;
}
