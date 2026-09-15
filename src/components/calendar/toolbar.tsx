'use client';

import type { CalendarView } from '@/lib/domain/calendar-shared';
import type { Room } from '@/lib/domain/rooms';
import { Button, cx } from '@/components/ui/primitives';
import { t } from '@/lib/i18n';
import { formatThaiDate, formatThaiMonth } from '@/lib/util/time';

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

  return (
    <div className="shrink-0 border-t border-ink-100 bg-white">
      {/* แถวที่ 1: วันที่ · ห้อง · ค้นหา */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shift(-1)}
            aria-label={t('common.previous')}
            className="flex size-10 items-center justify-center rounded-xl text-ink-600 hover:bg-ink-100"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            onClick={today}
            className="h-10 rounded-xl border border-ink-200 px-3 text-sm font-medium text-ink-700 hover:bg-ink-50"
          >
            {t('common.today')}
          </button>
          <button
            type="button"
            onClick={() => shift(1)}
            aria-label={t('common.next')}
            className="flex size-10 items-center justify-center rounded-xl text-ink-600 hover:bg-ink-100"
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>

        <div className="flex min-w-40 flex-col">
          <span aria-live="polite" className="text-sm font-semibold text-ink-900">
            {periodLabel}
          </span>
          <label className="sr-only" htmlFor="calendar-date">
            {t('search.date')}
          </label>
          <input
            id="calendar-date"
            type="date"
            value={dateISO}
            onChange={(event) => event.target.value && onDateChange(event.target.value)}
            className="w-36 rounded-lg border border-ink-200 px-2 py-0.5 text-xs text-ink-600"
          />
        </div>

        {/* เลือกห้อง พร้อมรูปห้อง */}
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ink-100 text-base"
            style={selectedRoom?.photos[0] ? { backgroundImage: `url(${selectedRoom.photos[0]})`, backgroundSize: 'cover' } : undefined}
          >
            {!selectedRoom?.photos[0] && (selectedRoom ? '🚪' : '🏢')}
          </span>
          <label className="sr-only" htmlFor="room-picker">
            {t('calendar.selectRoom')}
          </label>
          <select
            id="room-picker"
            value={selectedRoomId ?? ''}
            onChange={(event) => onRoomChange(event.target.value || null)}
            className="h-10 max-w-52 rounded-xl border border-ink-200 bg-white px-2 text-sm text-ink-800"
          >
            <option value="">{t('calendar.allRooms')}</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name} ({room.capacity} {t('common.people')})
              </option>
            ))}
          </select>
        </div>

        <div className="order-last flex w-full items-center gap-2 sm:order-none sm:ms-auto sm:w-auto">
          <label className="sr-only" htmlFor="calendar-search">
            {t('common.search')}
          </label>
          <div className="relative flex-1 sm:w-72">
            <input
              id="calendar-search"
              type="search"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              onFocus={onOpenSearch}
              placeholder={t('search.placeholder')}
              className="h-10 w-full rounded-xl border border-ink-200 bg-white ps-9 pe-3 text-sm"
            />
            <span aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-400">
              🔍
            </span>
          </div>
          <Button variant="secondary" size="md" onClick={onOpenSearch} className="shrink-0">
            {t('search.advanced')}
          </Button>
        </div>
      </div>

      {/* แถวที่ 2: สวิตช์มุมมอง · ปุ่มจอง */}
      <div className="flex items-center gap-2 border-t border-ink-100 px-3 py-2 sm:px-5">
        <div role="tablist" aria-label={t('view.switchLabel')} className="flex rounded-xl bg-ink-100 p-1">
          {(['day', 'week', 'month'] as CalendarView[]).map((item) => (
            <button
              key={item}
              role="tab"
              type="button"
              aria-selected={view === item}
              aria-label={t(`view.${item}Aria` as 'view.dayAria')}
              onClick={() => onViewChange(item)}
              className={cx(
                'h-9 min-w-16 rounded-lg px-3 text-sm font-medium transition-colors',
                view === item ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-600 hover:text-ink-800',
              )}
            >
              {t(`view.${item}` as 'view.day')}
            </button>
          ))}
        </div>

        {loading && (
          <span role="status" className="text-xs text-ink-500">
            {t('common.loading')}
          </span>
        )}

        <div className="ms-auto flex items-center gap-2">
          {canBook && (
            <Button onClick={onOpenBooking} size="md">
              <span aria-hidden="true">＋</span>
              <span className="hidden sm:inline">{t('calendar.bookButton')}</span>
              <span className="sm:hidden">จอง</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
