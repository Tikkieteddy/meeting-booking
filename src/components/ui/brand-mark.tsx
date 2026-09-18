/**
 * โลโก้ตัว T ของ TNN ในรูปแบบ SVG
 *
 * ทำไมต้องเป็น SVG ไม่ใช่ตัวอักษร "T" ธรรมดา:
 * เครื่องมือช่วยสั่งงานด้วยเสียงให้ผู้ใช้พูด "ข้อความที่เห็นบนปุ่ม" ดังนั้นชื่อที่
 * screen reader อ่าน ต้องครอบคลุมข้อความที่ตาเห็นทั้งหมด (กฎ WCAG 2.5.3
 * Label in Name) ถ้าโลโก้เป็นตัวอักษร "T" อยู่ใน DOM มันจะถูกนับเป็นข้อความที่
 * ตาเห็นด้วย ทำให้ชื่อของลิงก์ไม่ตรงกัน และใส่ aria-hidden ก็ไม่ช่วย
 * เพราะตัวอักษรนั้น "ยังมองเห็นอยู่" จริง ๆ
 *
 * ทำเป็น SVG ฝังในโค้ด (ไม่ใช่ไฟล์ภาพแยก) จึงไม่มีการดาวน์โหลดเพิ่มแม้แต่ไบต์เดียว
 *
 * สีพื้นมาจาก currentColor — ใส่ className="text-brand-500" เพื่อให้ได้สีส้ม TNN
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" className={className} role="presentation">
      <rect width="48" height="48" rx="11" fill="currentColor" />
      <path d="M13 12h22v6.5h-7.6V36h-6.8V18.5H13z" fill="#fff" />
    </svg>
  );
}
