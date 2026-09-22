'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button, Field, Input } from '@/components/ui/primitives';
import { MapLink } from '@/components/ui/map-link';
import { buildMapLink, hasCoordinates, parseMapCoordinates } from '@/lib/domain/map-link';
import { t } from '@/lib/i18n';

export type LocationValue = { mapUrl: string; latitude: number | null; longitude: number | null };

/** จุดเริ่มต้นของแผนที่เมื่อยังไม่มีหมุด — กรุงเทพฯ (ระบบใช้ในองค์กรไทย) */
const DEFAULT_CENTER: [number, number] = [13.7563, 100.5018];
const DEFAULT_ZOOM = 12;
const PIN_ZOOM = 17;

/**
 * เลือกตำแหน่งบนแผนที่ — ใช้ในฟอร์มห้องและฟอร์มอาคาร
 *
 * ทำงานได้สามทาง ทางไหนก็ได้:
 *   1. วางลิงก์จาก Google Maps → ถ้าลิงก์มีพิกัดในตัว ระบบดึงมาปักหมุดให้เอง
 *   2. แตะบนแผนที่ → ได้พิกัด
 *   3. กด "ใช้ตำแหน่งปัจจุบัน" → ขอตำแหน่งจากเครื่อง
 *
 * แผนที่ (Leaflet + แผ่นภาพจาก OpenStreetMap) โหลดเฉพาะตอนเปิดฟอร์มนี้เท่านั้น
 * หน้าอื่นทั้งเว็บแสดงแค่ลิงก์ "เปิดแผนที่" จึงไม่หนักขึ้น
 * ถ้าโหลดแผนที่ไม่ได้ (ไม่มีเน็ต) ช่องลิงก์และช่องพิกัดยังใช้ได้ตามปกติ
 *
 * ไม่ใช้ไอคอนหมุดแบบรูปภาพของ Leaflet โดยเจตนา (path รูปพังใต้ bundler) ใช้วงกลม SVG แทน
 */
export function LocationPicker({
  value,
  onChange,
  idPrefix,
  inheritedLink,
}: {
  value: LocationValue;
  onChange: (next: LocationValue) => void;
  idPrefix: string;
  /** ลิงก์ที่จะถูกใช้ถ้าปล่อยว่าง (เช่นของอาคาร) — แสดงให้รู้ว่าไม่ตั้งก็มีแผนที่ */
  inheritedLink?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markerRef = useRef<Leaflet.CircleMarker | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
    valueRef.current = value;
  }, [onChange, value]);

  const setPin = (latitude: number, longitude: number) => {
    const rounded = { latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)) };
    onChangeRef.current({ ...valueRef.current, ...rounded });
  };

  // สร้างแผนที่ครั้งเดียว โหลดไลบรารีแบบ lazy
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const L = await import('leaflet');
        if (cancelled || !containerRef.current || mapRef.current) return;
        leafletRef.current = L;
        const start = hasCoordinates(valueRef.current)
          ? ([valueRef.current.latitude, valueRef.current.longitude] as [number, number])
          : DEFAULT_CENTER;
        const map = L.map(containerRef.current, { zoomControl: true }).setView(
          start,
          hasCoordinates(valueRef.current) ? PIN_ZOOM : DEFAULT_ZOOM,
        );
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);
        map.on('click', (event: Leaflet.LeafletMouseEvent) => setPin(event.latlng.lat, event.latlng.lng));
        mapRef.current = map;
        setMapStatus('ready');
        // กล่องโต้ตอบเพิ่งเปิด ขนาดอาจยังไม่นิ่ง ให้แผนที่วัดขนาดใหม่อีกที
        window.setTimeout(() => map.invalidateSize(), 150);
      } catch {
        if (!cancelled) setMapStatus('failed');
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // หมุดตามค่าปัจจุบันเสมอ (ไม่ว่าจะมาจากลิงก์ การแตะ หรือพิมพ์เอง)
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || mapStatus !== 'ready') return;
    if (hasCoordinates(value)) {
      const latlng: [number, number] = [value.latitude, value.longitude];
      if (!markerRef.current) {
        markerRef.current = L.circleMarker(latlng, {
          radius: 9,
          color: '#ffffff',
          weight: 2,
          fillColor: '#EC5F27',
          fillOpacity: 1,
        }).addTo(map);
      } else {
        markerRef.current.setLatLng(latlng);
      }
      map.setView(latlng, Math.max(map.getZoom(), PIN_ZOOM));
    } else if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
  }, [value, mapStatus]);

  const applyUrl = (url: string) => {
    const coords = parseMapCoordinates(url);
    if (coords) {
      onChangeRef.current({ mapUrl: url, ...coords });
      setNotice(t('map.coordsFromLink'));
    } else {
      onChangeRef.current({ ...valueRef.current, mapUrl: url });
      setNotice(url.trim() ? t('map.noCoordsInLink') : null);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setNotice(t('map.geoDenied'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPin(pos.coords.latitude, pos.coords.longitude);
        setNotice(null);
      },
      () => setNotice(t('map.geoDenied')),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const numberOrNull = (raw: string) => (raw.trim() === '' ? null : Number(raw));
  const currentLink = buildMapLink(value);

  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border border-ink-200 p-3">
      <legend className="px-1 text-sm font-medium text-ink-700">{t('map.section')}</legend>
      <p className="text-xs text-ink-500">{t('map.sectionHint')}</p>

      <Field label={t('map.url')} htmlFor={`${idPrefix}-map-url`} hint={t('map.urlHint')}>
        <Input
          id={`${idPrefix}-map-url`}
          type="url"
          inputMode="url"
          placeholder="https://maps.app.goo.gl/…"
          value={value.mapUrl}
          onChange={(e) => applyUrl(e.target.value)}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text');
            if (pasted) {
              e.preventDefault();
              applyUrl(pasted.trim());
            }
          }}
        />
      </Field>

      {/* แผนที่: ไม่มี role ที่ screen reader จะเข้าใจ จึงบอกวิธีอื่น (ช่องพิกัดด้านล่าง) ไว้ในข้อความ */}
      <div
        ref={containerRef}
        data-testid="location-map"
        className="h-56 w-full overflow-hidden rounded-xl bg-ink-100"
        aria-hidden="true"
      />
      <p className="text-xs text-ink-500">
        {mapStatus === 'loading' && t('map.loading')}
        {mapStatus === 'ready' && t('map.pickHint')}
        {mapStatus === 'failed' && t('map.unavailable')}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('map.latitude')} htmlFor={`${idPrefix}-lat`}>
          <Input
            id={`${idPrefix}-lat`}
            type="number"
            step="any"
            min={-90}
            max={90}
            value={value.latitude ?? ''}
            onChange={(e) => onChange({ ...value, latitude: numberOrNull(e.target.value) })}
          />
        </Field>
        <Field label={t('map.longitude')} htmlFor={`${idPrefix}-lng`}>
          <Input
            id={`${idPrefix}-lng`}
            type="number"
            step="any"
            min={-180}
            max={180}
            value={value.longitude ?? ''}
            onChange={(e) => onChange({ ...value, longitude: numberOrNull(e.target.value) })}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={useMyLocation}>
          {t('map.useMyLocation')}
        </Button>
        {hasCoordinates(value) && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ ...value, latitude: null, longitude: null })}>
            {t('map.clearPin')}
          </Button>
        )}
        <MapLink href={currentLink} />
        {!currentLink && inheritedLink && (
          <span className="text-xs text-ink-500">
            {t('map.inheritedFromBuilding')} · <MapLink href={inheritedLink} compact />
          </span>
        )}
      </div>
      {notice && (
        <p role="status" className="text-xs text-ink-600">
          {notice}
        </p>
      )}
    </fieldset>
  );
}
