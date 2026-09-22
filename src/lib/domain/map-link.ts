/**
 * ลิงก์แผนที่ — ฟังก์ชันบริสุทธิ์ ใช้ได้ทั้งฝั่ง server และ client (ห้ามใส่ server-only)
 *
 * แนวคิด: เก็บ "ลิงก์ที่ผู้ดูแลวางมา" และ "พิกัดที่ปักหมุด" แยกกัน แล้วให้ทุกจุด
 * ในเว็บเรียก buildMapLink() เพื่อได้ลิงก์เดียวที่กดเปิดแผนที่ได้เสมอ
 */
export type MapLocation = {
  mapUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export function hasCoordinates(loc: MapLocation | null | undefined): loc is MapLocation & { latitude: number; longitude: number } {
  return (
    !!loc &&
    typeof loc.latitude === 'number' &&
    typeof loc.longitude === 'number' &&
    Number.isFinite(loc.latitude) &&
    Number.isFinite(loc.longitude) &&
    Math.abs(loc.latitude) <= 90 &&
    Math.abs(loc.longitude) <= 180
  );
}

/** ลิงก์ต้องเป็น https เท่านั้น — กัน javascript: และ http ที่ไม่ปลอดภัย */
export function isValidMapUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** ลิงก์เปิดแผนที่ในแอปแผนที่ของเครื่อง (Google Maps รองรับทั้งมือถือและคอม) */
export function coordinatesToMapUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

/**
 * ลิงก์เดียวสำหรับปุ่ม "เปิดแผนที่" — ลิงก์ที่ผู้ดูแลวางมาก่อน ถ้าไม่มีใช้พิกัด
 * ถ้าไม่มีทั้งคู่คืน null (จุดนั้นไม่แสดงปุ่ม)
 */
export function buildMapLink(loc: MapLocation | null | undefined): string | null {
  if (!loc) return null;
  if (isValidMapUrl(loc.mapUrl)) return loc.mapUrl;
  if (hasCoordinates(loc)) return coordinatesToMapUrl(loc.latitude, loc.longitude);
  return null;
}

/** ตำแหน่งที่ใช้จริงของห้อง: ของห้องเองก่อน ถ้าห้องไม่ได้ตั้ง ใช้ของอาคาร */
export function effectiveLocation(room: MapLocation | null | undefined, building: MapLocation | null | undefined): MapLocation {
  if (buildMapLink(room)) return room!;
  if (buildMapLink(building)) return building!;
  return {};
}

/**
 * ดึงพิกัดออกจากลิงก์แผนที่ที่ผู้ใช้วางมา — รองรับรูปแบบที่พบบ่อยของ Google Maps
 *   .../@13.7563,100.5018,17z      (ลิงก์จากแถบที่อยู่)
 *   ...?q=13.7563,100.5018         (ลิงก์ค้นหา)
 *   ...?ll=13.7563,100.5018        (ลิงก์เก่า)
 *   ...&query=13.7563,100.5018     (ลิงก์ API)
 *   geo:13.7563,100.5018           (ลิงก์มือถือ)
 * ลิงก์ย่อ (maps.app.goo.gl) ไม่มีพิกัดในตัว จึงคืน null — ยังใช้เป็น map_url ได้ตามปกติ
 */
export function parseMapCoordinates(value: string | null | undefined): { latitude: number; longitude: number } | null {
  if (!value) return null;
  const text = value.trim();
  const patterns = [
    /@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
    /[?&](?:q|ll|query|destination|center)=(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
    /^geo:(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
    /^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/, // พิมพ์พิกัดตรง ๆ "13.75, 100.50"
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const latitude = Number(m[1]);
    const longitude = Number(m[2]);
    if (hasCoordinates({ latitude, longitude })) return { latitude, longitude };
  }
  return null;
}
