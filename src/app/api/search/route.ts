import { searchQuerySchema } from '@/lib/validation/schemas';
import { guessSearchMode, parseSearchQuery } from '@/lib/domain/parse-query';
import { searchBookings, searchFreeSlots, searchRooms } from '@/lib/domain/search';
import { currentActor } from '@/lib/api/actor';
import { apiOk, withApi } from '@/lib/api/respond';
import { consumeRateLimit } from '@/lib/util/rate-limit';
import { DomainError } from '@/lib/domain/errors';
import { t } from '@/lib/i18n';
import { minutesToHhmm, hhmmToMinutes } from '@/lib/util/time';

export const dynamic = 'force-dynamic';

export const GET = withApi(async (request: Request) => {
  const { actor, ctx } = await currentActor();
  const url = new URL(request.url);

  const limit = await consumeRateLimit(`search:${actor.profileId}`, 120, 60);
  if (!limit.allowed) throw new DomainError(t('error.rateLimited'), 'rate_limited', 429);

  const query = searchQuerySchema.parse({
    q: url.searchParams.get('q') ?? '',
    mode: url.searchParams.get('mode') ?? 'auto',
    date: url.searchParams.get('date') || null,
    startTime: url.searchParams.get('startTime') || null,
    endTime: url.searchParams.get('endTime') || null,
    capacity: url.searchParams.get('capacity') || null,
    buildingId: url.searchParams.get('buildingId') || null,
    floor: url.searchParams.get('floor') || null,
    amenities: url.searchParams.getAll('amenities'),
  });

  // ตีความคำค้นแบบผสม แล้วให้ตัวกรองที่ผู้ใช้ตั้งเองมีน้ำหนักกว่า
  const parsed = parseSearchQuery(query.q);
  const effective = {
    text: parsed.text,
    capacity: query.capacity ?? parsed.capacity,
    dateISO: query.date ?? parsed.dateISO,
    startTime: query.startTime ?? parsed.startTime,
    endTime:
      query.endTime ??
      parsed.endTime ??
      (parsed.startTime && parsed.durationMinutes
        ? minutesToHhmm(hhmmToMinutes(parsed.startTime) + parsed.durationMinutes)
        : null),
    amenityCodes: query.amenities?.length ? query.amenities : parsed.amenityCodes,
    buildingId: query.buildingId ?? null,
    floor: query.floor ?? null,
  };

  const mode = query.mode === 'auto' ? guessSearchMode({ ...parsed, ...effective, durationMinutes: parsed.durationMinutes }) : query.mode;

  if (mode === 'slots') {
    if (!effective.dateISO || !effective.startTime || !effective.endTime) {
      // ข้อมูลไม่พอสำหรับค้นช่วงเวลา -> ตกไปค้นห้องแทน พร้อมบอกสิ่งที่ตีความได้
      const rooms = await searchRooms(ctx, {
        text: effective.text,
        capacity: effective.capacity,
        buildingId: effective.buildingId,
        floor: effective.floor,
        amenityCodes: effective.amenityCodes,
      });
      return apiOk({ mode: 'rooms', parsed: effective, rooms });
    }
    const slots = await searchFreeSlots(ctx, {
      dateISO: effective.dateISO,
      startTime: effective.startTime,
      endTime: effective.endTime,
      capacity: effective.capacity,
      amenityCodes: effective.amenityCodes,
      buildingId: effective.buildingId,
    });
    return apiOk({ mode: 'slots', parsed: effective, slots });
  }

  if (mode === 'bookings') {
    const bookings = await searchBookings(ctx, {
      text: effective.text || query.q,
      fromISO: effective.dateISO,
      toISO: effective.dateISO,
    });
    return apiOk({ mode: 'bookings', parsed: effective, bookings });
  }

  const rooms = await searchRooms(ctx, {
    text: effective.text,
    capacity: effective.capacity,
    buildingId: effective.buildingId,
    floor: effective.floor,
    amenityCodes: effective.amenityCodes,
  });
  return apiOk({ mode: 'rooms', parsed: effective, rooms });
});
