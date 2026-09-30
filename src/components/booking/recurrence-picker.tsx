"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Field, Input, Select, cx } from "@/components/ui/primitives";
import { t } from "@/lib/i18n";
import {
  MAX_OCCURRENCES,
  WEEKDAYS_MON_TO_FRI,
  describeMonthWeek,
  describeRecurrence,
  weekOfMonth,
  type RecurrenceRule,
} from "@/lib/domain/recurrence";
import { formatThaiDate, thaiWeekday, weekdayOfISO } from "@/lib/util/time";

/**
 * ตัวเลือก "การเกิดซ้ำ" แบบ Google Calendar
 * ตัวเลือกสำเร็จรูปเปลี่ยนตามวันที่ที่เลือก (เช่น "รายสัปดาห์ ในวันพุธ") และมี "กำหนดเอง…"
 * ให้ตั้ง ซ้ำทุก N วัน/สัปดาห์/เดือน/ปี เลือกวันในสัปดาห์ และแบบรายเดือนได้ละเอียด
 * ต้องมีจุดสิ้นสุดเสมอ (วันที่ หรือจำนวนครั้ง ไม่เกิน MAX_OCCURRENCES) เพราะแต่ละครั้งเป็นการจองจริง
 */
type Preset =
  | "none"
  | "daily"
  | "weekly"
  | "monthlyWeek"
  | "monthlyDate"
  | "yearly"
  | "weekdays"
  | "custom";
type Unit = RecurrenceRule["frequency"];

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // แสดง จันทร์ → อาทิตย์ ให้ตรงกับปฏิทิน

export function RecurrencePicker({
  dateISO,
  onChange,
}: {
  dateISO: string;
  onChange: (rule: RecurrenceRule | null) => void;
}) {
  const weekday = weekdayOfISO(dateISO);
  const { n, isLast } = weekOfMonth(dateISO);
  // Google เลือก "สุดท้าย" เมื่อวันนั้นเป็นครั้งสุดท้ายของเดือน (เช่น พุธที่ 5 = พุธสุดท้าย)
  const defaultMonthWeek = isLast ? -1 : n;
  const dayOfMonth = Number(dateISO.slice(8, 10));

  const [preset, setPreset] = useState<Preset>("none");
  // โหมดกำหนดเอง
  const [every, setEvery] = useState(1);
  const [unit, setUnit] = useState<Unit>("weekly");
  const [weekdays, setWeekdays] = useState<number[] | null>(null); // null = ใช้วันของวันที่เลือก
  const [monthMode, setMonthMode] = useState<"date" | "week">("date");
  // จุดสิ้นสุด
  const [endMode, setEndMode] = useState<"count" | "until">("count");
  const [count, setCount] = useState(10);
  const [untilDate, setUntilDate] = useState("");

  const rule = useMemo<RecurrenceRule | null>(() => {
    const end =
      endMode === "until" && untilDate
        ? { untilDate, occurrenceCount: null }
        : {
            untilDate: null,
            occurrenceCount: Math.min(Math.max(1, count || 1), MAX_OCCURRENCES),
          };
    switch (preset) {
      case "none":
        return null;
      case "daily":
        return { frequency: "daily", intervalCount: 1, ...end };
      case "weekly":
        return {
          frequency: "weekly",
          intervalCount: 1,
          byWeekdays: [weekday],
          ...end,
        };
      case "monthlyWeek":
        return {
          frequency: "monthly",
          intervalCount: 1,
          monthWeek: defaultMonthWeek,
          ...end,
        };
      case "monthlyDate":
        return { frequency: "monthly", intervalCount: 1, ...end };
      case "yearly":
        return { frequency: "yearly", intervalCount: 1, ...end };
      case "weekdays":
        return {
          frequency: "weekly",
          intervalCount: 1,
          byWeekdays: WEEKDAYS_MON_TO_FRI,
          ...end,
        };
      case "custom":
        return {
          frequency: unit,
          intervalCount: Math.min(Math.max(1, every || 1), 12),
          byWeekdays:
            unit === "weekly"
              ? weekdays?.length
                ? weekdays
                : [weekday]
              : null,
          monthWeek:
            unit === "monthly" && monthMode === "week"
              ? defaultMonthWeek
              : null,
          ...end,
        };
    }
  }, [
    preset,
    endMode,
    untilDate,
    count,
    weekday,
    defaultMonthWeek,
    unit,
    every,
    weekdays,
    monthMode,
  ]);

  // แจ้งค่าออกเมื่อกฎเปลี่ยนจริง (เทียบเป็นสตริง) — เก็บ onChange ใน ref ไม่ให้ effect วิ่งซ้ำทุก render
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const serialized = JSON.stringify(rule);
  useEffect(() => {
    onChangeRef.current(rule);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized]);

  const selectedWeekdays = weekdays?.length ? weekdays : [weekday];
  const toggleWeekday = (d: number) => {
    const next = selectedWeekdays.includes(d)
      ? selectedWeekdays.filter((x) => x !== d)
      : [...selectedWeekdays, d];
    // ต้องเหลืออย่างน้อย 1 วัน
    if (next.length > 0) setWeekdays(next);
  };

  const monthWeekLabel = describeMonthWeek(weekday, defaultMonthWeek);
  const presetOptions: [Preset, string][] = [
    ["none", t("recurrence.none")],
    ["daily", t("recurrence.daily")],
    ["weekly", t("recurrence.weeklyOn", { day: thaiWeekday(weekday) })],
    ["monthlyWeek", t("recurrence.monthlyOn", { when: monthWeekLabel })],
    ["monthlyDate", t("recurrence.monthlyOnDate", { date: dayOfMonth })],
    [
      "yearly",
      t("recurrence.yearlyOn", {
        date: formatThaiDate(dateISO).replace(/ \d+$/, ""),
      }),
    ],
    ["weekdays", t("recurrence.weekdays")],
    ["custom", t("recurrence.custom")],
  ];

  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border border-ink-200 p-3">
      <legend className="px-1 text-sm font-medium text-ink-700">
        {t("booking.recurrence")}
      </legend>

      <Select
        id="bk-repeat"
        aria-label={t("booking.recurrence")}
        value={preset}
        onChange={(event) => setPreset(event.target.value as Preset)}
      >
        {presetOptions.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>

      {preset === "custom" && (
        <div className="flex flex-col gap-3 rounded-lg bg-ink-50 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <Field
              label={t("recurrence.every")}
              htmlFor="bk-repeat-interval"
              className="w-[5rem]"
            >
              <Input
                id="bk-repeat-interval"
                type="number"
                inputMode="numeric"
                min={1}
                max={12}
                value={every}
                onChange={(event) => setEvery(Number(event.target.value))}
              />
            </Field>
            <Field
              label={t("recurrence.unit")}
              htmlFor="bk-repeat-unit"
              className="w-[8rem]"
            >
              <Select
                id="bk-repeat-unit"
                value={unit}
                onChange={(event) => setUnit(event.target.value as Unit)}
              >
                <option value="daily">{t("recurrence.unit.daily")}</option>
                <option value="weekly">{t("recurrence.unit.weekly")}</option>
                <option value="monthly">{t("recurrence.unit.monthly")}</option>
                <option value="yearly">{t("recurrence.unit.yearly")}</option>
              </Select>
            </Field>
          </div>

          {unit === "weekly" && (
            <div
              role="group"
              aria-label={t("recurrence.onDays")}
              className="flex flex-wrap gap-1.5"
            >
              {WEEK_ORDER.map((d) => {
                const active = selectedWeekdays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleWeekday(d)}
                    className={cx(
                      "flex size-10 items-center justify-center rounded-full border text-xs font-semibold",
                      active
                        ? "border-brand-700 bg-brand-700 text-white"
                        : "border-ink-200 bg-white text-ink-700 hover:bg-ink-100",
                    )}
                  >
                    <span aria-hidden="true">{thaiWeekday(d, true)}</span>
                    <span className="sr-only">{`วัน${thaiWeekday(d)}`}</span>
                  </button>
                );
              })}
            </div>
          )}

          {unit === "monthly" && (
            <Select
              aria-label={t("recurrence.monthMode")}
              value={monthMode}
              onChange={(event) =>
                setMonthMode(event.target.value as "date" | "week")
              }
            >
              <option value="date">
                {t("recurrence.monthlyOnDate", { date: dayOfMonth })}
              </option>
              <option value="week">
                {t("recurrence.monthlyOn", { when: monthWeekLabel })}
              </option>
            </Select>
          )}
        </div>
      )}

      {preset !== "none" && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-ink-700">
              {t("recurrence.ends")}
            </legend>
            <label className="flex flex-wrap items-center gap-2 text-sm text-ink-700">
              <input
                type="radio"
                name="bk-repeat-end"
                className="size-5 accent-brand-700"
                checked={endMode === "count"}
                onChange={() => setEndMode("count")}
              />
              {t("recurrence.after")}
              <span className="w-[5rem]">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_OCCURRENCES}
                  aria-label={t("booking.recurrence.count")}
                  value={count}
                  disabled={endMode !== "count"}
                  onChange={(event) => setCount(Number(event.target.value))}
                />
              </span>
              {t("recurrence.times")}
            </label>
            <label className="flex flex-wrap items-center gap-2 text-sm text-ink-700">
              <input
                type="radio"
                name="bk-repeat-end"
                className="size-5 accent-brand-700"
                checked={endMode === "until"}
                onChange={() => setEndMode("until")}
              />
              {t("recurrence.onDate")}
              <span className="w-[10.5rem]">
                <Input
                  type="date"
                  aria-label={t("booking.recurrence.until")}
                  min={dateISO}
                  value={untilDate}
                  disabled={endMode !== "until"}
                  onChange={(event) => setUntilDate(event.target.value)}
                />
              </span>
            </label>
          </fieldset>

          {rule && (
            <p className="text-xs text-ink-600" aria-live="polite">
              {describeRecurrence(rule, dateISO)}
              {` · ${t("recurrence.skipNote", { max: MAX_OCCURRENCES })}`}
            </p>
          )}
        </>
      )}
    </fieldset>
  );
}
