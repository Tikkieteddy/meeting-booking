/**
 * รายการสิ่งอำนวยความสะดวกมาตรฐาน — ข้อมูลตั้งต้นที่ระบบต้องมี (ไม่ใช่ข้อมูลตัวอย่าง)
 *
 * แหล่งความจริงเดียว ใช้ทั้ง seed (เครื่องพัฒนา), สคริปต์ bootstrap/upgrade
 * (ฐานข้อมูลจริง) จึงไม่มีทางที่สองที่จะรายการไม่ตรงกัน
 * ผู้ดูแลห้องเลือกติ๊กจากรายการนี้ตอนเพิ่ม/แก้ห้อง
 */
export const AMENITY_CATALOG = [
  { code: 'tv', nameTh: 'ทีวี', nameEn: 'TV', icon: 'tv', sortOrder: 10 },
  { code: 'projector', nameTh: 'โปรเจกเตอร์', nameEn: 'Projector', icon: 'projector', sortOrder: 20 },
  { code: 'video_conference', nameTh: 'ประชุมทางไกล', nameEn: 'Video conference', icon: 'video', sortOrder: 30 },
  { code: 'whiteboard', nameTh: 'ไวท์บอร์ด', nameEn: 'Whiteboard', icon: 'board', sortOrder: 40 },
  { code: 'microphone', nameTh: 'ไมโครโฟน', nameEn: 'Microphone', icon: 'mic', sortOrder: 50 },
  { code: 'speaker', nameTh: 'ลำโพง', nameEn: 'Speaker', icon: 'speaker', sortOrder: 60 },
  { code: 'phone', nameTh: 'โทรศัพท์', nameEn: 'Phone', icon: 'phone', sortOrder: 70 },
  { code: 'accessible', nameTh: 'รองรับผู้ใช้รถเข็น', nameEn: 'Wheelchair accessible', icon: 'accessible', sortOrder: 80 },
] as const;

/** คำสั่ง SQL ใส่รายการนี้ลงตาราง amenities — รันซ้ำได้ (มีอยู่แล้วจะอัปเดตชื่อ ไม่ซ้ำ) */
export function amenityUpsertSql(): string[] {
  const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
  return AMENITY_CATALOG.map(
    (a) =>
      `INSERT INTO amenities (code, name_th, name_en, icon, sort_order) VALUES (${lit(a.code)}, ${lit(a.nameTh)}, ${lit(a.nameEn)}, ${lit(a.icon)}, ${a.sortOrder})\n  ON CONFLICT (code) DO UPDATE SET name_th = excluded.name_th, name_en = excluded.name_en, icon = excluded.icon, sort_order = excluded.sort_order;`,
  );
}
