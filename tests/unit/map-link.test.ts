import { describe, expect, it } from 'vitest';
import { buildMapLink, coordinatesToMapUrl, effectiveLocation, isValidMapUrl, parseMapCoordinates } from '@/lib/domain/map-link';

describe('ลิงก์แผนที่', () => {
  it('ใช้ลิงก์ที่ผู้ดูแลวางมาก่อน ถ้าไม่มีจึงสร้างจากพิกัด ถ้าไม่มีทั้งคู่คืน null', () => {
    expect(buildMapLink({ mapUrl: 'https://maps.app.goo.gl/abc', latitude: 13.7, longitude: 100.5 })).toBe('https://maps.app.goo.gl/abc');
    expect(buildMapLink({ latitude: 13.7563, longitude: 100.5018 })).toBe('https://www.google.com/maps?q=13.756300,100.501800');
    expect(buildMapLink({})).toBeNull();
    expect(buildMapLink(null)).toBeNull();
  });

  it('ปฏิเสธลิงก์ที่ไม่ใช่ https (กัน javascript: และ http)', () => {
    expect(isValidMapUrl('javascript:alert(1)')).toBe(false);
    expect(isValidMapUrl('http://maps.google.com/x')).toBe(false);
    expect(isValidMapUrl('ไม่ใช่ลิงก์')).toBe(false);
    expect(isValidMapUrl('https://www.google.com/maps/place/x')).toBe(true);
    expect(buildMapLink({ mapUrl: 'javascript:alert(1)', latitude: 1, longitude: 2 })).toBe(coordinatesToMapUrl(1, 2));
  });

  it('ห้องที่ไม่ได้ตั้งตำแหน่งเอง ใช้ตำแหน่งของอาคาร', () => {
    const building = { latitude: 13.1, longitude: 100.1 };
    expect(effectiveLocation({}, building)).toBe(building);
    const room = { mapUrl: 'https://maps.app.goo.gl/room' };
    expect(effectiveLocation(room, building)).toBe(room);
    expect(buildMapLink(effectiveLocation({}, {}))).toBeNull();
  });

  it('ดึงพิกัดจากลิงก์ Google Maps รูปแบบต่าง ๆ ได้', () => {
    expect(parseMapCoordinates('https://www.google.com/maps/place/TNN/@13.7563,100.5018,17z/data=abc')).toEqual({ latitude: 13.7563, longitude: 100.5018 });
    expect(parseMapCoordinates('https://www.google.com/maps?q=13.7563,100.5018')).toEqual({ latitude: 13.7563, longitude: 100.5018 });
    expect(parseMapCoordinates('https://maps.google.com/?ll=-33.86,151.21&z=15')).toEqual({ latitude: -33.86, longitude: 151.21 });
    expect(parseMapCoordinates('geo:13.75,100.5')).toEqual({ latitude: 13.75, longitude: 100.5 });
    expect(parseMapCoordinates('13.75, 100.50')).toEqual({ latitude: 13.75, longitude: 100.5 });
  });

  it('ลิงก์ย่อหรือข้อความที่ไม่มีพิกัด คืน null และพิกัดนอกช่วงถูกปัดทิ้ง', () => {
    expect(parseMapCoordinates('https://maps.app.goo.gl/AbCdEf')).toBeNull();
    expect(parseMapCoordinates('')).toBeNull();
    expect(parseMapCoordinates('https://www.google.com/maps?q=95.0,100.0')).toBeNull();
  });
});
