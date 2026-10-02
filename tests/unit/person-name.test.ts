import { describe, expect, it } from 'vitest';
import { joinFullName, splitFullName } from '@/lib/domain/person-name';

describe('แยก/รวม ชื่อ-นามสกุล', () => {
  it('แยกที่เว้นวรรคแรก — นามสกุลที่มีหลายคำอยู่ช่องนามสกุลทั้งหมด', () => {
    expect(splitFullName('พรภัสสร สุขะวัฒนะ')).toEqual({ firstName: 'พรภัสสร', lastName: 'สุขะวัฒนะ' });
    expect(splitFullName('  Mary   Ann  Smith ')).toEqual({ firstName: 'Mary', lastName: 'Ann Smith' });
  });

  it('บัญชีเดิมที่มีแค่ชื่อเดียว → นามสกุลว่าง ให้ผู้ใช้กรอกเพิ่ม', () => {
    expect(splitFullName('teddydakkie')).toEqual({ firstName: 'teddydakkie', lastName: '' });
    expect(splitFullName(null)).toEqual({ firstName: '', lastName: '' });
  });

  it('รวมกลับได้ค่าเดิม', () => {
    expect(joinFullName(' พรภัสสร ', ' สุขะวัฒนะ ')).toBe('พรภัสสร สุขะวัฒนะ');
    const { firstName, lastName } = splitFullName('ปิยะ พนักงาน ข่าว');
    expect(joinFullName(firstName, lastName)).toBe('ปิยะ พนักงาน ข่าว');
  });
});
