'use client';

import { useEffect, useState } from 'react';
import type { Amenity, Room } from '@/lib/domain/rooms';
import { apiFetch, ApiClientError } from '@/lib/client/api';
import { useToast } from '@/components/ui/toast';
import { t } from '@/lib/i18n';
import { toDateISO, toTimeHHmm } from '@/lib/util/time';
import { BookingForm, type EditingBooking } from './booking-form';

type DetailForEdit = {
  id: string;
  version: number;
  roomId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
  privacy: EditingBooking['privacy'];
  priority: EditingBooking['priority'];
  category: string | null;
  purpose: string | null;
  notes: string | null;
  attendeeCount: number;
  seriesId: string | null;
  reminderLeads: number[] | null;
  attendees: { email: string; displayName: string | null; profileId: string | null }[];
  resources: { amenityCode: string }[];
  permissions: { isOwner: boolean };
};

/**
 * เปิดฟอร์มจองในโหมดแก้ไข จากที่ไหนก็ได้ (ปฏิทิน, การจองของฉัน, หน้ารายละเอียดแบบลิงก์ตรง)
 * โหลดข้อมูลล่าสุดของการจอง + ห้อง + อุปกรณ์เอง เพื่อให้ได้ version ล่าสุด (กันเขียนทับคนอื่น)
 */
export function EditBookingDialog({
  bookingId,
  open,
  onClose,
  onSaved,
}: {
  bookingId: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<{ editing: EditingBooking; rooms: Room[]; amenities: Amenity[] } | null>(null);

  useEffect(() => {
    if (!open) {
      setData(null);
      return;
    }
    let active = true;
    Promise.all([
      apiFetch<{ booking: DetailForEdit }>(`/api/bookings/${bookingId}`),
      apiFetch<{ rooms: Room[]; amenities: Amenity[] }>('/api/rooms'),
    ])
      .then(([{ booking: b }, { rooms, amenities }]) => {
        if (!active) return;
        const startsAt = new Date(b.startsAt);
        const editing: EditingBooking = {
          id: b.id,
          version: b.version,
          roomId: b.roomId,
          dateISO: toDateISO(startsAt),
          startTime: toTimeHHmm(startsAt),
          endTime: toTimeHHmm(new Date(b.endsAt)),
          title: b.title,
          purpose: b.purpose,
          notes: b.notes,
          attendeeCount: b.attendeeCount,
          attendees: b.attendees.map((a) => ({ email: a.email, displayName: a.displayName, profileId: a.profileId })),
          privacy: b.privacy,
          priority: b.priority,
          category: b.category,
          resources: b.resources.map((r) => r.amenityCode),
          reminderLeads: b.reminderLeads,
          // เหมือนหน้ารายละเอียด: ผู้จองแก้เวลาเตือนของตัวเองได้จนกว่าประชุมจะเริ่ม
          canEditReminders:
            b.permissions.isOwner && ['confirmed', 'pending'].includes(b.status) && startsAt.getTime() > Date.now(),
          isSeries: b.seriesId !== null,
        };
        // ห้องที่ถูกเก็บเข้าคลังแล้วไม่อยู่ในรายการปกติ — ไม่มีห้องก็แก้ไม่ได้ (เปลี่ยนห้องไม่ได้อยู่แล้ว)
        const room = rooms.find((r) => r.id === b.roomId);
        if (!room) {
          toast.show(t('error.notFound'), 'error');
          onClose();
          return;
        }
        setData({ editing, rooms: [room], amenities });
      })
      .catch((error) => {
        if (!active) return;
        toast.show(error instanceof ApiClientError ? error.message : t('common.unknownError'), 'error');
        onClose();
      });
    return () => {
      active = false;
    };
    // โหลดใหม่ทุกครั้งที่เปิด — onClose/toast เปลี่ยนทุก render ของแม่ ไม่ต้องผูก
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bookingId]);

  if (!open || !data) return null;
  return (
    <BookingForm
      open
      onClose={onClose}
      rooms={data.rooms}
      amenities={data.amenities}
      preset={{ roomId: data.editing.roomId, dateISO: data.editing.dateISO, startTime: data.editing.startTime }}
      canOverride={false}
      editing={data.editing}
      onSaved={onSaved}
    />
  );
}
