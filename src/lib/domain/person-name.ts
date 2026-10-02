/**
 * ชื่อ/นามสกุล — ฟอร์มแยกเป็นสองช่อง (ผู้ใช้ขอ 2 ต.ค. 2569) แต่ฐานข้อมูลเก็บรวมใน profiles.full_name
 * คั่นด้วยเว้นวรรคหนึ่งช่อง ไม่ต้องเปลี่ยนโครงตาราง และที่อื่นที่แสดงชื่อเต็มยังทำงานเหมือนเดิม
 *
 * ชื่อต้นห้ามมีเว้นวรรค (ตรวจที่ schema) จึงแยกกลับได้แน่นอนด้วย "เว้นวรรคแรก"
 * ไฟล์นี้เป็นฟังก์ชันบริสุทธิ์ ใช้ได้ทั้งฝั่งเบราว์เซอร์และ server
 */
export function splitFullName(fullName: string | null | undefined): { firstName: string; lastName: string } {
  const clean = (fullName ?? '').trim().replace(/\s+/g, ' ');
  const space = clean.indexOf(' ');
  if (space === -1) return { firstName: clean, lastName: '' };
  return { firstName: clean.slice(0, space), lastName: clean.slice(space + 1) };
}

export function joinFullName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim().replace(/\s+/g, ' ')}`.trim();
}
